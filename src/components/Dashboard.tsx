import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, CircularProgress, FormControlLabel, Switch, IconButton, Tooltip, Alert
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { fetchPortfolios, fetchTransactions, fetchLiveData } from '../lib/sheets';
import { ColumnSelector } from './ColumnSelector';
import { getExchangeRates } from '../lib/currency';
import type { LiveData } from '../lib/types';
import { DashboardSummary } from './DashboardSummary';
import { DashboardTable } from './DashboardTable';

interface DashboardProps {
  sheetId: string;
}
interface Holding {
  key: string;
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  exchange: string;
  displayName: string;
  name_he?: string; // Add name_he
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  avgCost: number;
  currentPrice: number;
  mvVested: number;
  mvUnvested: number;
  totalMV: number;
  realizedGain: number;
  realizedGainPct: number;
  realizedGainAfterTax: number;
  dividends: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  totalGain: number;
  totalGainPct: number;
  valueAfterTax: number;
  sector: string;
  dayChangePct: number;
  dayChangeVal: number;
  costBasis: number;
  costOfSold: number;
  stockCurrency: string;
  priceUnit?: string;
  perf1w: number;
  perf1m: number;
  perf3m: number;
  perfYtd: number;
  perf1y: number;
  perf3y: number;
  perf5y: number;
}

export const Dashboard = ({ sheetId }: DashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  const [includeUnvested, setIncludeUnvested] = useState<boolean>(false);
  const [hasFutureTxns, setHasFutureTxns] = useState(false);  
  // Persist Currency
  const [displayCurrency, setDisplayCurrency] = useState(() => localStorage.getItem('displayCurrency') || 'USD');
  
  const [exchangeRates, setExchangeRates] = useState<any>({ USD: 1, ILS: 3.7 });
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  const [portMap, setPortMap] = useState<Map<string, any>>(new Map());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openColSelector = Boolean(anchorEl);

  const handleClickColSelector = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseColSelector = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    localStorage.setItem('displayCurrency', displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    getExchangeRates(sheetId).then(rates => setExchangeRates(rates));
  }, [sheetId]);

  useEffect(() => {
    const portId = searchParams.get('portfolioId');
    setSelectedPortfolioId(portId);
    const selectedPort = portMap.get(portId || '');
    if (selectedPort) {
      setDisplayCurrency(selectedPort.currency);
    } else if (!portId) {
      // Reset to default if no portfolio is selected
      setDisplayCurrency(localStorage.getItem('displayCurrency') || 'USD');
    }
  }, [searchParams, portMap]);

  const handleSelectPortfolio = (portfolioId: string | null) => {
    if (portfolioId) {
      setSearchParams({ portfolioId });
    } else {
      setSearchParams({});
    }
  };

  const perfPeriods = {
    perf1w: 'perf1w',
    perf1m: 'perf1m',
    perf3m: 'perf3m',
    perfYtd: 'perfYtd',
    perf1y: 'perf1y',
    perf3y: 'perf3y',
    perf5y: 'perf5y',
  } as const;

  const [summary, setSummary] = useState({
    aum: 0,
    totalUnrealized: 0,
    totalRealized: 0,
    totalDividends: 0,
    totalReturn: 0,
    realizedGainAfterTax: 0,
    valueAfterTax: 0,
    totalDayChange: 0,
    totalDayChangePct: 0,
    totalDayChangeIsIncomplete: false,
    perf1d: 0,
    perf1w: 0,
    perf1w_incomplete: false,
    perf1m: 0,
    perf1m_incomplete: false,
    perf3m: 0,
    perf3m_incomplete: false,
    perf1y: 0,
    perf1y_incomplete: false,
    perf3y: 0,
    perf3y_incomplete: false,
    perf5y: 0,
    perf5y_incomplete: false,
    perfYtd: 0,
    perfYtd_incomplete: false,
    divYield: 0, // Placeholder
  });

  useEffect(() => {
    loadData();
  }, [sheetId, includeUnvested]);

  useEffect(() => {
    const calculateSummary = (data: Holding[]) => {
      
      const initialAcc = {
        aum: 0,
        totalUnrealized: 0,
        totalRealized: 0,
        totalDividends: 0,
        totalReturn: 0,
        realizedGainAfterTax: 0,
        valueAfterTax: 0,
        totalDayChange: 0,
        aumWithDayChangeData: 0,
        holdingsWithDayChange: 0,
        ...Object.fromEntries(Object.keys(perfPeriods).flatMap(p => [
            [`totalChange_${p}`, 0],
            [`aumFor_${p}`, 0],
            [`holdingsFor_${p}`, 0]
        ]))
      };

      const s = data.reduce((acc, h) => {
        const toUSD = (val: number) => {
           if (!exchangeRates) return val;
           const fromRate = exchangeRates[h.stockCurrency] || 1;
           return h.stockCurrency === 'USD' ? val : val / fromRate;
        };
        
        acc.aum += toUSD(h.totalMV);
        acc.totalUnrealized += toUSD(h.unrealizedGain);
        acc.totalRealized += toUSD(h.realizedGain);
        acc.totalDividends += toUSD(h.dividends);
        acc.totalReturn += toUSD(h.totalGain);
        acc.realizedGainAfterTax += toUSD(h.realizedGainAfterTax);
        acc.valueAfterTax += toUSD(h.valueAfterTax);
        
        if (h.dayChangePct !== 0) {
            acc.totalDayChange += toUSD(h.dayChangeVal);
            acc.aumWithDayChangeData += toUSD(h.totalMV);
            acc.holdingsWithDayChange++;
        }
        
        for (const [key, holdingKey] of Object.entries(perfPeriods)) {
            const perf = h[holdingKey as keyof Holding] as number;
            if (perf && !isNaN(perf)) {
                const change = toUSD(h.totalMV) - (toUSD(h.totalMV) / (1 + perf));
                (acc as any)[`totalChange_${key}`] += change;
                (acc as any)[`aumFor_${key}`] += toUSD(h.totalMV);
                (acc as any)[`holdingsFor_${key}`]++;
            }
        }

        return acc;
      }, initialAcc);

      const summaryResult: typeof summary = { ...summary, ...s, totalDayChangePct: 0, perf1d: 0 };
      const totalHoldings = data.length;

      const prevClose = s.aumWithDayChangeData - s.totalDayChange;
      summaryResult.totalDayChangePct = prevClose > 0 ? s.totalDayChange / prevClose : 0;
      summaryResult.perf1d = summaryResult.totalDayChangePct;
      summaryResult.totalDayChangeIsIncomplete = s.holdingsWithDayChange > 0 && s.holdingsWithDayChange < totalHoldings;
      
      for (const key of Object.keys(perfPeriods)) {
        const totalChange = (s as any)[`totalChange_${key}`];
        const aumForPeriod = (s as any)[`aumFor_${key}`];
        const prevValue = aumForPeriod - totalChange;
        (summaryResult as any)[key] = prevValue > 0 ? totalChange / prevValue : 0;

        const holdingsForPeriod = (s as any)[`holdingsFor_${key}`];
        (summaryResult as any)[`${key}_incomplete`] = holdingsForPeriod > 0 && holdingsForPeriod < totalHoldings;
      }
      
      setSummary(summaryResult);
    };

    if (selectedPortfolioId) {
      calculateSummary(holdings.filter(h => h.portfolioId === selectedPortfolioId));
    } else {
      calculateSummary(holdings);
    }
  }, [selectedPortfolioId, holdings, exchangeRates]);

  const getPriceInBaseCurrency = (holding: Holding) => {
    if (holding.priceUnit === 'agorot' && holding.stockCurrency === 'ILS') {
      return holding.currentPrice / 100;
    } else if (holding.priceUnit === 'cents') {
      return holding.currentPrice / 100;
    }
    return holding.currentPrice;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ports, txns] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
      ]);

      const liveData = await fetchLiveData(sheetId);
      
      const liveDataMap = new Map<string, LiveData>();
      liveData.forEach(d => liveDataMap.set(`${d.ticker}:${d.exchange}`, d));

      const newPortMap = new Map(ports.map(p => [p.id, p]));
      setPortMap(newPortMap);
      const holdingMap = new Map<string, Holding>();
      const taxRate = 0.25;

      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const today = new Date();
      const futureTxns = txns.filter(t => new Date(t.date) > today);
      setHasFutureTxns(futureTxns.length > 0);
      const pastTxns = txns.filter(t => new Date(t.date) <= today);
      const filteredTxns = includeUnvested ? pastTxns : pastTxns.filter(t => !t.vestDate || new Date(t.vestDate) <= new Date());

      filteredTxns.forEach(t => {
        const key = `${t.portfolioId}_${t.ticker}`;
        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          const p = newPortMap.get(t.portfolioId);
          const defaultExchange = /\d/.test(t.ticker) ? 'TASE' : 'NASDAQ';
          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: p?.name || t.portfolioId,
            ticker: t.ticker,
            exchange: t.exchange || live?.exchange || defaultExchange,
            displayName: live?.name || t.ticker,
            name_he: live?.name_he,
            qtyVested: 0,
            qtyUnvested: 0,
            totalQty: 0,
            avgCost: 0,
            currentPrice: live?.price || t.price || 0,
            mvVested: 0,
            mvUnvested: 0,
            totalMV: 0,
            realizedGain: 0,
            realizedGainPct: 0,
            realizedGainAfterTax: 0,
            dividends: 0,
            unrealizedGain: 0,
            unrealizedGainPct: 0,
            totalGain: 0,
            totalGainPct: 0,
            valueAfterTax: 0,
            sector: live?.sector || '',
            dayChangePct: live?.changePct || 0,
            dayChangeVal: 0,
            costBasis: 0,
            costOfSold: 0,
            stockCurrency: live?.currency || t.currency || p?.currency || 'USD',
            priceUnit: live?.priceUnit,
            perf1w: live?.changePct1w || 0,
            perf1m: live?.changePct1m || 0,
            perf3m: live?.changePct3m || 0,
            perfYtd: live?.changePctYtd || 0,
            perf1y: live?.changePct1y || 0,
            perf3y: live?.changePct3y || 0,
            perf5y: live?.changePct5y || 0,
          });
        }

        const h = holdingMap.get(key)!;
        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
        const grossValue = t.qty * t.price;

        if (t.type === 'BUY') {
          if (isVested) h.qtyVested += t.qty;
          else h.qtyUnvested += t.qty;
          h.costBasis += grossValue + (t.commission || 0);
        } else if (t.type === 'SELL') {
          const avgCost = (h.qtyVested + h.qtyUnvested) > 0 ? h.costBasis / (h.qtyVested + h.qtyUnvested) : 0;
          const costOfSold = avgCost * t.qty;
          h.realizedGain += (grossValue - costOfSold);
          h.costBasis -= costOfSold;
          h.costOfSold += costOfSold;
          if (isVested) h.qtyVested -= t.qty;
          else h.qtyUnvested -= t.qty;
        } else if (t.type === 'DIVIDEND') {
          const taxAmount = grossValue * ((t.tax || 0) / 100);
          h.dividends += grossValue - (t.commission || 0) - taxAmount;
        }
      });

      const processedHoldings: Holding[] = [];

      holdingMap.forEach(h => {
        const priceInBase = getPriceInBaseCurrency(h);

        h.totalQty = h.qtyVested + h.qtyUnvested;
        h.avgCost = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
        h.mvVested = h.qtyVested * priceInBase;
        h.mvUnvested = h.qtyUnvested * priceInBase;
        h.totalMV = h.mvVested + h.mvUnvested;
        
        const unrealized = h.totalMV - h.costBasis;
        h.unrealizedGain = unrealized;
        h.unrealizedGainPct = h.costBasis > 0 ? unrealized / h.costBasis : 0;
        h.realizedGainPct = h.costOfSold > 0 ? h.realizedGain / h.costOfSold : 0;
        h.realizedGainAfterTax = h.realizedGain * (1 - taxRate);
        h.totalGain = h.unrealizedGain + h.realizedGain + h.dividends;
        h.totalGainPct = h.costBasis + h.costOfSold > 0 ? h.totalGain / (h.costBasis + h.costOfSold) : 0;
        h.valueAfterTax = h.totalMV - (h.unrealizedGain > 0 ? h.unrealizedGain * taxRate : 0);
        h.dayChangeVal = h.totalMV * h.dayChangePct;

        processedHoldings.push(h);
      });

      setHoldings(processedHoldings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Default Columns
  const defaultColumns = {
    displayName: true,
    ticker: true,
    sector: true,
    qty: true,
    avgCost: true,
    currentPrice: true,
    dayChangePct: true,
    dayChangeVal: true,
    mv: true,
    unrealizedGain: true,
    unrealizedGainPct: true,
    realizedGain: true,
    realizedGainPct: true,
    realizedGainAfterTax: true,
    totalGain: true,
    totalGainPct: true,
    valueAfterTax: true,
  };

  const [columnVisibility, setColumnVisibility] = useState(() => {
    const saved = localStorage.getItem('columnVisibility');
    return saved ? { ...defaultColumns, ...JSON.parse(saved) } : defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
  }, [columnVisibility]);

  const columnDisplayNames: Record<string, string> = {
    displayName: 'Display Name',
    ticker: 'Ticker',
    sector: 'Sector',
    qty: 'Quantity',
    avgCost: 'Avg Cost',
    currentPrice: 'Current Price',
    dayChangePct: 'Day Change %',
    dayChangeVal: 'Day Change $',
    mv: 'Market Value',
    unrealizedGain: 'Unrealized Gain',
    unrealizedGainPct: 'Unrealized Gain %',
    realizedGain: 'Realized Gain',
    realizedGainPct: 'Realized Gain %',
    realizedGainAfterTax: 'Realized Gain After Tax',
    totalGain: 'Total Gain',
    totalGainPct: 'Total Gain %',
    valueAfterTax: 'Value After Tax',
  };

  // Grouping Logic
  const groupedData = useMemo(() => {
    const filteredHoldings = selectedPortfolioId ? holdings.filter(h => h.portfolioId === selectedPortfolioId) : holdings;
    if (!groupByPortfolio || selectedPortfolioId) return { 'All Holdings': filteredHoldings };
    const groups: Record<string, Holding[]> = {};
    filteredHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [holdings, groupByPortfolio, selectedPortfolioId]);

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4 }}>
      {hasFutureTxns && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Note: Some transactions with future dates exist and are not included in the calculations.
        </Alert>
      )}
      <DashboardSummary
        summary={summary}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        selectedPortfolio={portMap.get(selectedPortfolioId || '')?.name || null}
        onBack={() => handleSelectPortfolio(null)}
        onCurrencyChange={setDisplayCurrency}
      />

      {/* CONTROLS */}
      <Box display="flex" justifyContent="space-between" mb={2} alignItems="center">
        <Box display="flex" gap={1}>
          <ColumnSelector
            columns={columnVisibility}
            columnDisplayNames={columnDisplayNames}
            onColumnChange={(key, value) =>
              setColumnVisibility((prev: any) => ({ ...prev, [key]: value }))
            }
            anchorEl={anchorEl}
            open={openColSelector}
            onClick={handleClickColSelector}
            onClose={handleCloseColSelector}
          />
        </Box>
        <Box display="flex" alignItems="center">
          <FormControlLabel
            control={<Switch checked={includeUnvested} onChange={e => setIncludeUnvested(e.target.checked)} />}
            label='Include Unvested'
            sx={{ mr: 2 }}
          />
          <FormControlLabel
            control={<Switch checked={groupByPortfolio} onChange={e => setGroupByPortfolio(e.target.checked)} />}
            label="Group by Portfolio"
            sx={{ mr: 2 }}
          />
          <Tooltip title="Refresh Data">
            <IconButton 
              onClick={() => loadData()} 
              disabled={loading}
              size="small"
              sx={{ border: 'none', borderRadius: 0 }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <DashboardTable 
        holdings={holdings} 
        groupedData={groupedData}
        groupByPortfolio={groupByPortfolio}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        includeUnvested={includeUnvested}
        onSelectPortfolio={handleSelectPortfolio} // Updated prop
        columnVisibility={columnVisibility}
        onHideColumn={(col) => setColumnVisibility((prev: any) => ({ ...prev, [col]: false }))}
      />
    </Box>
  );
}
