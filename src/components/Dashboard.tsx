import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, CircularProgress, FormControlLabel, Switch, IconButton, Tooltip, Typography
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { fetchPortfolios, fetchTransactions } from '../lib/sheets/index';
import { ColumnSelector } from './ColumnSelector';
import { getExchangeRates, convertCurrency, calculatePerformanceInDisplayCurrency, calculateHoldingDisplayValues, normalizeCurrency, fromAgorot } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import { Currency } from '../lib/types';
import type { Holding, DashboardHolding, ExchangeRates } from '../lib/types';
import { DashboardSummary } from './DashboardSummary';
import { DashboardTable } from './DashboardTable';
import { SessionExpiredError } from '../lib/errors';

interface DashboardProps {
  sheetId: string;
}

export const Dashboard = ({ sheetId }: DashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<DashboardHolding[]>([]);
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  const [includeUnvested, setIncludeUnvested] = useState<boolean>(false);
  const [hasFutureTxns, setHasFutureTxns] = useState(false);  
  // Persist Currency - normalize initial value
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
  
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1, ILS: 3.7 } });
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(searchParams.get('portfolioId'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    getExchangeRates(sheetId).then(rates => {
        setExchangeRates(rates);
    });
  }, [sheetId]);

  useEffect(() => {
    const portId = searchParams.get('portfolioId');
    setSelectedPortfolioId(portId);
    const selectedPort = portMap.get(portId || '');
    if (selectedPort) {
      setDisplayCurrency(normalizeCurrency(selectedPort.currency));
    } else if (!portId) {
      // Reset to default if no portfolio is selected
      setDisplayCurrency(normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
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
    totalUnrealizedGainPct: 0,
    totalRealized: 0,
    totalRealizedGainPct: 0,
    totalCostOfSold: 0,
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
    const fetchData = async () => {
      try {
        setLoading(true);
        await loadData();
      } catch (error) {
        console.error('Error caught in fetchData:', error);
        if (error instanceof SessionExpiredError) {
          console.warn('Session expired, re-throwing to trigger global handler.');
          throw error;
        } else {
          console.error('Error loading data (not SessionExpiredError):', error);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sheetId, includeUnvested, exchangeRates]);

  useEffect(() => {
    const calculateSummary = (data: DashboardHolding[]) => {
      
      const initialAcc = {
        aum: 0,
        totalUnrealizedDisplay: 0,
        totalRealizedDisplay: 0,
        totalCostOfSoldDisplay: 0,
        totalDividendsDisplay: 0,
        totalReturnDisplay: 0,
        realizedGainAfterTaxDisplay: 0,
        valueAfterTaxDisplay: 0,
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
        // Use shared helper for display values (Cost Basis, MV, Gains)
        const vals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);

        acc.aum += vals.marketValue;
        acc.totalUnrealizedDisplay += vals.unrealizedGain;
        acc.totalRealizedDisplay += vals.realizedGain;
        acc.totalCostOfSoldDisplay += vals.costOfSold;
        acc.totalDividendsDisplay += vals.dividends;
        acc.totalReturnDisplay += vals.totalGain;

        if (h.dayChangePct !== 0) {
            const { changeVal } = calculatePerformanceInDisplayCurrency(
                h.currentPrice, h.stockCurrency,
                h.dayChangePct, 'ago1d', displayCurrency, exchangeRates
            );
            acc.totalDayChange += changeVal * h.totalQty;
            acc.aumWithDayChangeData += vals.marketValue;
            acc.holdingsWithDayChange++;
        }
        
        const periodMap: Record<string, string> = {
            perf1w: 'ago1w',
            perf1m: 'ago1m',
            perf3m: 'ago3m',
            perfYtd: 'ytd',
            perf1y: 'ago1y',
            perf3y: 'ago3y',
            perf5y: 'ago5y',
        };

        for (const [key, holdingKey] of Object.entries(perfPeriods)) {
            const perf = h[holdingKey as keyof DashboardHolding] as number;
            if (perf && !isNaN(perf)) {
                const { changeVal } = calculatePerformanceInDisplayCurrency(
                    h.currentPrice, h.stockCurrency,
                    perf, periodMap[key], displayCurrency, exchangeRates
                );
                
                const currentMVDisplay = vals.marketValue;
                const totalChangeForHolding = changeVal * h.totalQty;
                
                (acc as any)[`totalChange_${key}`] += totalChangeForHolding;
                (acc as any)[`aumFor_${key}`] += currentMVDisplay;
                (acc as any)[`holdingsFor_${key}`]++;
            }
        }

        return acc;
      }, initialAcc);

      const summaryResult: typeof summary = {
        ...summary,
        aum: s.aum,
        totalUnrealized: s.totalUnrealizedDisplay,
        totalRealized: s.totalRealizedDisplay,
        totalDividends: s.totalDividendsDisplay,
        totalReturn: s.totalReturnDisplay,
        totalCostOfSold: s.totalCostOfSoldDisplay, // Keep for reference
        totalUnrealizedGainPct: (s.aum - s.totalUnrealizedDisplay) > 0 ? s.totalUnrealizedDisplay / (s.aum - s.totalUnrealizedDisplay) : 0,
        totalRealizedGainPct: s.totalCostOfSoldDisplay > 0 ? s.totalRealizedDisplay / s.totalCostOfSoldDisplay : 0,
        totalDayChange: s.totalDayChange,
        realizedGainAfterTax: s.totalRealizedDisplay * 0.75, // Approx
        valueAfterTax: s.aum - (s.totalUnrealizedDisplay > 0 ? s.totalUnrealizedDisplay * 0.25 : 0), // Approx
        totalDayChangePct: 0, perf1d: 0
      };

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
  }, [selectedPortfolioId, holdings, exchangeRates, displayCurrency]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ports, txns] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
      ]);
      
      const newPortMap = new Map(ports.map(p => [p.id, p]));
      setPortMap(newPortMap);
      const holdingMap = new Map<string, DashboardHolding>();

      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const today = new Date();
      const futureTxns = txns.filter(t => new Date(t.date) > today);
      setHasFutureTxns(futureTxns.length > 0);
      const pastTxns = txns.filter(t => new Date(t.date) <= today);
      const filteredTxns = includeUnvested ? pastTxns : pastTxns.filter(t => !t.vestDate || new Date(t.vestDate) <= new Date());

      const liveDataMap = new Map<string, Holding>();
      ports.forEach(p => {
        p.holdings?.forEach(h => {
          liveDataMap.set(`${h.ticker}:${h.exchange}`, h);
        });
      });

      filteredTxns.forEach(t => {
        const key = `${t.portfolioId}_${t.ticker}`;
        const p = logIfFalsy(newPortMap.get(t.portfolioId), `Portfolio not found for ID ${t.portfolioId}`, t);
        const portfolioCurrency = normalizeCurrency(p?.currency || 'USD');

        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          const defaultExchange = /\d/.test(t.ticker) ? 'TASE' : 'NASDAQ';
          const defaultCurrency = defaultExchange === 'TASE' ? Currency.ILS : Currency.USD;
          const stockCurrency = normalizeCurrency(live?.currency || t.currency || defaultCurrency);
          
          let currentPrice = live?.price || 0;
          // TASE stocks are typically quoted in Agorot (1/100 ILS).
          // We normalize all prices to the major currency unit (ILS) for consistent storage and calculations.
          if (stockCurrency === Currency.ILA) {
              currentPrice = fromAgorot(currentPrice);
          }

          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: p?.name || t.portfolioId,
            portfolioCurrency,
            ticker: t.ticker,
            exchange: t.exchange || live?.exchange || defaultExchange,
            displayName: live?.name || t.ticker,
            name_he: live?.name_he,
            qtyVested: 0,
            qtyUnvested: 0,
            totalQty: 0,
            currentPrice: currentPrice,
            stockCurrency,
            priceUnit: live?.priceUnit,
            costBasisPortfolioCurrency: 0,
            costOfSoldPortfolioCurrency: 0,
            proceedsPortfolioCurrency: 0,
            dividendsPortfolioCurrency: 0,
            unrealizedGainPortfolioCurrency: 0,
            realizedGainPortfolioCurrency: 0,
            totalGainPortfolioCurrency: 0,
            marketValuePortfolioCurrency: 0,
            dayChangeValuePortfolioCurrency: 0,
            costBasisStockCurrency: 0,
            costOfSoldStockCurrency: 0,
            proceedsStockCurrency: 0,
            dividendsStockCurrency: 0,
            
            // Historical Accumulators
            costBasisUSD: 0, costOfSoldUSD: 0, proceedsUSD: 0, dividendsUSD: 0, realizedGainUSD: 0,
            costBasisILS: 0, costOfSoldILS: 0, proceedsILS: 0, dividendsILS: 0, realizedGainILS: 0,

            // Initialize display fields
            avgCost: 0, mvVested: 0, mvUnvested: 0, totalMV: 0, realizedGain: 0, realizedGainPct: 0, realizedGainAfterTax: 0, dividends: 0, unrealizedGain: 0, unrealizedGainPct: 0, totalGain: 0, totalGainPct: 0, valueAfterTax: 0, dayChangeVal: 0,
            sector: live?.sector || '',
            dayChangePct: live?.changePct || 0,
            perf1w: live?.changePct1w || 0, perf1m: live?.changePct1m || 0, perf3m: live?.changePct3m || 0,
            perfYtd: live?.changePctYtd || 0, perf1y: live?.changePct1y || 0, perf3y: live?.changePct3y || 0, perf5y: live?.changePct5y || 0,
          });
        }

        const h = holdingMap.get(key)!;
        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
        // Determine Original Price in Portfolio Currency (Major Unit)
        let originalPricePortfolioCurrency = 0;
        
        const priceInUSD = (t as any).Original_Price_USD || 0;
        const priceInAgorot = (t as any).Original_Price_ILA || 0;
        const priceInILS = fromAgorot(priceInAgorot);
        const tQty = t.qty || 0;

        if (portfolioCurrency === Currency.ILS) {
             // If Portfolio is ILS, use Original_Price_ILA (in Agorot) and convert to ILS Major Unit
             logIfFalsy((t as any).Original_Price_ILA, `Original_Price_ILA missing for ${t.ticker}`, t);
             originalPricePortfolioCurrency = priceInILS;
        } else {
             // Otherwise use USD value and convert to Portfolio Currency if needed
             logIfFalsy((t as any).Original_Price_USD, `Original_Price_USD missing for ${t.ticker}`, t);
             originalPricePortfolioCurrency = convertCurrency(priceInUSD, Currency.USD, portfolioCurrency, exchangeRates);
        }

        const txnValuePortfolioCurrency = tQty * originalPricePortfolioCurrency;
        let txnPrice = t.price || 0;
        if (h.stockCurrency === Currency.ILA) {
            txnPrice = fromAgorot(txnPrice);
        }
        const txnValueStockCurrency = tQty * txnPrice;
        const txnValueUSD = tQty * priceInUSD;
        const txnValueILS = tQty * priceInILS;

        if (t.type === 'BUY') {
            if (isVested) h.qtyVested += tQty; else h.qtyUnvested += tQty;
            h.costBasisPortfolioCurrency += txnValuePortfolioCurrency; // NO commission included in basis? User didn't specify. Assuming raw price.
            h.costBasisStockCurrency += txnValueStockCurrency;
            
            h.costBasisUSD += txnValueUSD;
            h.costBasisILS += txnValueILS;

        } else if (t.type === 'SELL') {
            const totalQtyPreSell = h.qtyVested + h.qtyUnvested;
            // Calculate avg cost PER SHARE in Portfolio Currency BEFORE this sale
            const avgCostPC = totalQtyPreSell > 1e-9 ? h.costBasisPortfolioCurrency / totalQtyPreSell : 0;
            const costOfSoldPC = avgCostPC * tQty;
            
            const avgCostSC = totalQtyPreSell > 1e-9 ? h.costBasisStockCurrency / totalQtyPreSell : 0;
            const costOfSoldSC = avgCostSC * tQty;

            const avgCostUSD = totalQtyPreSell > 1e-9 ? h.costBasisUSD / totalQtyPreSell : 0;
            const costOfSoldUSD = avgCostUSD * tQty;

            const avgCostILS = totalQtyPreSell > 1e-9 ? h.costBasisILS / totalQtyPreSell : 0;
            const costOfSoldILS = avgCostILS * tQty;

            h.costOfSoldPortfolioCurrency += costOfSoldPC;
            h.proceedsPortfolioCurrency += txnValuePortfolioCurrency; 
            h.costBasisPortfolioCurrency -= costOfSoldPC;
            
            h.costOfSoldStockCurrency += costOfSoldSC;
            h.proceedsStockCurrency += txnValueStockCurrency;
            h.costBasisStockCurrency -= costOfSoldSC;
            
            h.costOfSoldUSD += costOfSoldUSD;
            h.proceedsUSD += txnValueUSD;
            h.costBasisUSD -= costOfSoldUSD;

            h.costOfSoldILS += costOfSoldILS;
            h.proceedsILS += txnValueILS;
            h.costBasisILS -= costOfSoldILS;

            if (Math.abs(h.costBasisPortfolioCurrency) < 1e-6) h.costBasisPortfolioCurrency = 0;
            if (Math.abs(h.costBasisStockCurrency) < 1e-6) h.costBasisStockCurrency = 0;
            if (Math.abs(h.costBasisUSD) < 1e-6) h.costBasisUSD = 0;
            if (Math.abs(h.costBasisILS) < 1e-6) h.costBasisILS = 0;

            // Reduce quantity
            let qtyToSell = tQty;
            if (isVested) {
                const canSellVested = Math.min(qtyToSell, h.qtyVested);
                h.qtyVested -= canSellVested;
                qtyToSell -= canSellVested;
            }
            if (qtyToSell > 0 && includeUnvested) { // Only reduce unvested if they are included
                const canSellUnvested = Math.min(qtyToSell, h.qtyUnvested);
                h.qtyUnvested -= canSellUnvested;
            }
        } else if (t.type === 'DIVIDEND') {
            const taxAmountPC = txnValuePortfolioCurrency * (t.tax || 0);
            h.dividendsPortfolioCurrency += txnValuePortfolioCurrency - taxAmountPC; // NO commission
            
            const taxAmountSC = txnValueStockCurrency * (t.tax || 0);
            h.dividendsStockCurrency += txnValueStockCurrency - taxAmountSC;

            const taxAmountUSD = txnValueUSD * (t.tax || 0);
            h.dividendsUSD += txnValueUSD - taxAmountUSD;

            const taxAmountILS = txnValueILS * (t.tax || 0);
            h.dividendsILS += txnValueILS - taxAmountILS;
        }
      });
        
              const processedHoldings: DashboardHolding[] = [];
              holdingMap.forEach(h => {
                h.totalQty = h.qtyVested + h.qtyUnvested;
                // No need to convert from Agorot here anymore, as currentPrice is already normalized.
                // Just ensure we use the 'currentPrice' (Major Unit) for MV calculation.
                const priceInStockCurrency = h.currentPrice; 
                
                // Use new typed convertCurrency which supports full ExchangeRates object
                const currentPricePC = convertCurrency(priceInStockCurrency, h.stockCurrency, h.portfolioCurrency, exchangeRates);
                
        h.marketValuePortfolioCurrency = h.totalQty * currentPricePC;
                h.unrealizedGainPortfolioCurrency = h.marketValuePortfolioCurrency - h.costBasisPortfolioCurrency;
                h.realizedGainPortfolioCurrency = h.proceedsPortfolioCurrency - h.costOfSoldPortfolioCurrency;
                
                h.realizedGainUSD = h.proceedsUSD - h.costOfSoldUSD;
                h.realizedGainILS = h.proceedsILS - h.costOfSoldILS;

                h.totalGainPortfolioCurrency = h.unrealizedGainPortfolioCurrency + h.realizedGainPortfolioCurrency + h.dividendsPortfolioCurrency;
                        h.dayChangeValuePortfolioCurrency = h.marketValuePortfolioCurrency * h.dayChangePct;
                
                        // NEW Avg Cost Calculation for display (In Stock Currency)
                        h.avgCost = h.totalQty > 1e-9 ? h.costBasisStockCurrency / h.totalQty : 0;
                
                        h.mvVested = h.qtyVested * currentPricePC;                h.mvUnvested = h.qtyUnvested * currentPricePC;
                h.totalMV = h.marketValuePortfolioCurrency;
        
                // Calculate percentages based on portfolio currency values
                h.unrealizedGainPct = h.costBasisPortfolioCurrency > 1e-6 ? h.unrealizedGainPortfolioCurrency / h.costBasisPortfolioCurrency : 0;
                h.realizedGainPct = h.costOfSoldPortfolioCurrency > 1e-6 ? h.realizedGainPortfolioCurrency / h.costOfSoldPortfolioCurrency : 0;
                h.totalGainPct = (h.costBasisPortfolioCurrency + h.costOfSoldPortfolioCurrency) > 1e-6 ? h.totalGainPortfolioCurrency / (h.costBasisPortfolioCurrency + h.costOfSoldPortfolioCurrency) : 0;
        
                processedHoldings.push(h);
              });
      setHoldings(processedHoldings);
    } catch (e) {
      console.error('loadData error:', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [sheetId, includeUnvested, exchangeRates]);


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
    if (!groupByPortfolio || selectedPortfolioId || filteredHoldings.length === 0) return { 'All Holdings': filteredHoldings };
    const groups: Record<string, DashboardHolding[]> = {};
    filteredHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [holdings, groupByPortfolio, selectedPortfolioId]);

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', mt: 4 }}>
      <DashboardSummary
        summary={summary}
        displayCurrency={displayCurrency}
        exchangeRates={exchangeRates}
        selectedPortfolio={portMap.get(selectedPortfolioId || '')?.name || null}
        onBack={() => handleSelectPortfolio(null)}
        onCurrencyChange={setDisplayCurrency}
      />
      {hasFutureTxns && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5, mb: 1, fontSize: '0.7rem' }}>
          Note: Some transactions with future dates exist and are not included in the calculations.
        </Typography>
      )}

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
