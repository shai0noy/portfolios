import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, CircularProgress, FormControlLabel, Switch, Grid,
  Collapse, IconButton, TableSortLabel, Select, MenuItem, Button, Menu
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { fetchPortfolios, fetchTransactions, syncAndFetchLiveData } from '../lib/sheets';
import { ColumnSelector } from './ColumnSelector';
import { getExchangeRates } from '../lib/currency';
import type { LiveData } from '../lib/types';

interface DashboardProps {
  sheetId: string;
}
interface Holding {
  key: string; // Composite key: portfolioId_ticker
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  exchange: string;
  displayName: string;
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  avgCost: number;
  currentPrice: number; // Last transaction price
  mvVested: number;
  mvUnvested: number;
  totalMV: number;
  realizedGain: number; // Net realized gain
  realizedGainPct: number;
  realizedGainAfterTax: number;
  dividends: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  totalGain: number;
  totalGainPct: number;
  valueAfterTax: number;
  sector: string;
  costBasis: number; // For unrealized calc
  costOfSold: number;
}

export function Dashboard({ sheetId }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [groupByPortfolio, setGroupByPortfolio] = useState(true);
  const [sortBy, setSortBy] = useState<string>('totalMV');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [includeUnvested, setIncludeUnvested] = useState<boolean>(false);
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [exchangeRates, setExchangeRates] = useState<any>({ USD: 1, ILS: 3.7 });
  const [selectedPortfolio, setSelectedPortfolio] = useState<string | null>(null);
  const [portMap, setPortMap] = useState<Map<string, any>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; column: string; } | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openColSelector = Boolean(anchorEl);

  const handleClickColSelector = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseColSelector = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    getExchangeRates('USD').then(rates => setExchangeRates(rates));
  }, []);

  useEffect(() => {
    const selectedPort = portMap.get(selectedPortfolio || '');
    if (selectedPort) {
      setDisplayCurrency(selectedPort.currency);
    }
  }, [selectedPortfolio, portMap]);

  const handleCurrencyChange = (event: any) => {
    setDisplayCurrency(event.target.value);
  };

  const [summary, setSummary] = useState({
    aum: 0,
    totalUnrealized: 0,
    totalRealized: 0,
    totalDividends: 0,
    totalReturn: 0,
    realizedGainAfterTax: 0,
    valueAfterTax: 0,
  });

  useEffect(() => {
    loadData();
  }, [sheetId, includeUnvested]);

  useEffect(() => {
    if (selectedPortfolio) {
      const portfolioHoldings = holdings.filter(h => h.portfolioName === selectedPortfolio);
      const summary = portfolioHoldings.reduce((acc, h) => {
        acc.aum += h.totalMV;
        acc.totalUnrealized += h.unrealizedGain;
        acc.totalRealized += h.realizedGain;
        acc.totalDividends += h.dividends;
        acc.totalReturn += h.totalGain;
        acc.realizedGainAfterTax += h.realizedGainAfterTax;
        acc.valueAfterTax += h.valueAfterTax;
        return acc;
      }, {
        aum: 0,
        totalUnrealized: 0,
        totalRealized: 0,
        totalDividends: 0,
        totalReturn: 0,
        realizedGainAfterTax: 0,
        valueAfterTax: 0,
      });
      setSummary(summary);
    } else {
      const grandAUM = holdings.reduce((sum, h) => sum + h.totalMV, 0);
      const grandUnrealized = holdings.reduce((sum, h) => sum + h.unrealizedGain, 0);
      const grandRealized = holdings.reduce((sum, h) => sum + h.realizedGain, 0);
      const grandDividends = holdings.reduce((sum, h) => sum + h.dividends, 0);
      const grandRealizedAfterTax = holdings.reduce((sum, h) => sum + h.realizedGainAfterTax, 0);
      const grandValueAfterTax = holdings.reduce((sum, h) => sum + h.valueAfterTax, 0);
      setSummary({
        aum: grandAUM,
        totalUnrealized: grandUnrealized,
        totalRealized: grandRealized,
        totalDividends: grandDividends,
        totalReturn: grandUnrealized + grandRealized + grandDividends,
        realizedGainAfterTax: grandRealizedAfterTax,
        valueAfterTax: grandValueAfterTax
      });
    }
  }, [selectedPortfolio, holdings]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ports, txns] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
      ]);

      const liveData = await syncAndFetchLiveData(sheetId, txns);
      const liveDataMap = new Map<string, LiveData>();
      liveData.forEach(d => liveDataMap.set(`${d.ticker}:${d.exchange}`, d));

      const newPortMap = new Map(ports.map(p => [p.id, p]));
      setPortMap(newPortMap);
      const holdingMap = new Map<string, Holding>();
      const taxRate = 0.25;

      // Sort transactions by date ascending
      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 1. Process Transactions
      const filteredTxns = includeUnvested ? txns : txns.filter(t => !t.vestDate || new Date(t.vestDate) <= new Date());

      filteredTxns.forEach(t => {
        const key = `${t.portfolioId}_${t.ticker}`;
        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: newPortMap.get(t.portfolioId)?.name || t.portfolioId,
            ticker: t.ticker,
            exchange: t.exchange || '',
            displayName: live?.name || t.ticker,
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
            sector: newPortMap.get(t.portfolioId)?.type || '',
            costBasis: 0,
            costOfSold: 0,
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

      // 2. Finalize Calculations
      const processedHoldings: Holding[] = [];

      holdingMap.forEach(h => {
        h.totalQty = h.qtyVested + h.qtyUnvested;
        h.avgCost = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
        h.mvVested = h.qtyVested * h.currentPrice;
        h.mvUnvested = h.qtyUnvested * h.currentPrice;
        h.totalMV = h.mvVested + h.mvUnvested;
        const unrealized = h.totalMV - h.costBasis;
        h.unrealizedGain = unrealized;
        h.unrealizedGainPct = h.costBasis > 0 ? unrealized / h.costBasis : 0;
        h.realizedGainPct = h.costOfSold > 0 ? h.realizedGain / h.costOfSold : 0;
        h.realizedGainAfterTax = h.realizedGain * (1 - taxRate);
        h.totalGain = h.unrealizedGain + h.realizedGain + h.dividends;
        h.totalGainPct = h.costBasis + h.costOfSold > 0 ? h.totalGain / (h.costBasis + h.costOfSold) : 0;
        h.valueAfterTax = h.totalMV - (h.unrealizedGain > 0 ? h.unrealizedGain * taxRate : 0);
        processedHoldings.push(h);
      });

      setHoldings(processedHoldings);
    } catch (e) {
      console.error(e);
      let msg = 'Error loading dashboard data';
      try {
        if (e && typeof e === 'object') {
          if ((e as any).result) msg += ': ' + JSON.stringify((e as any).result);
          else if ((e as any).body) msg += ': ' + ((typeof (e as any).body === 'string') ? (e as any).body : JSON.stringify((e as any).body));
          else if ((e as any).message) msg += ': ' + (e as any).message;
          else msg += ': ' + JSON.stringify(e);
        } else {
          msg += ': ' + String(e);
        }
      } catch (_err) {
        msg += '.';
      }
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const [columnVisibility, setColumnVisibility] = useState({
    displayName: true,
    ticker: true,
    sector: true,
    qty: true,
    avgCost: true,
    currentPrice: true,
    mv: true,
    unrealizedGain: true,
    unrealizedGainPct: true,
    realizedGain: true,
    realizedGainPct: true,
    realizedGainAfterTax: true,
    totalGain: true,
    totalGainPct: true,
    valueAfterTax: true,
  });

  const columnDisplayNames: Record<string, string> = {
    displayName: 'Display Name',
    ticker: 'Ticker',
    sector: 'Sector',
    qty: 'Quantity',
    avgCost: 'Avg Cost',
    currentPrice: 'Current Price',
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
    const filteredHoldings = selectedPortfolio ? holdings.filter(h => h.portfolioName === selectedPortfolio) : holdings;
    if (!groupByPortfolio) return { 'All Holdings': filteredHoldings };
    const groups: Record<string, Holding[]> = {};
    filteredHoldings.forEach(h => {
      if (!groups[h.portfolioName]) groups[h.portfolioName] = [];
      groups[h.portfolioName].push(h);
    });
    return groups;
  }, [holdings, groupByPortfolio, selectedPortfolio]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));
  };

  const handleSort = (key: string) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const handleContextMenu = (event: React.MouseEvent, column: string) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      column,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleHideColumn = () => {
    if (contextMenu) {
      setColumnVisibility((prev) => ({ ...prev, [contextMenu.column]: false }));
    }
    handleCloseContextMenu();
  };

  const getSortValue = (h: Holding, key: string) => {
    switch (key) {
      case 'ticker': return h.ticker || '';
      case 'qty': return h.totalQty;
      case 'qtyVested': return h.qtyVested;
      case 'qtyUnvested': return h.qtyUnvested;
      case 'avgCost': return h.avgCost;
      case 'currentPrice': return h.currentPrice;
      case 'marketValue': return h.totalMV;
      case 'mvVested': return h.mvVested;
      case 'mvUnvested': return h.mvUnvested;
      case 'unrealized': {
        const avg = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
        const costVested = avg * h.qtyVested;
        const mvV = h.mvVested;
        const mvU = h.mvUnvested;
        const effectiveMV = includeUnvested ? mvV + mvU : mvV;
        const effectiveCost = includeUnvested ? costVested + (avg * h.qtyUnvested) : costVested;
        return effectiveMV - effectiveCost;
      }
      case 'unrealizedPct': {
        const avg2 = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
        const costVested2 = avg2 * h.qtyVested;
        const mvV2 = h.mvVested;
        const mvU2 = h.mvUnvested;
        const effectiveMV2 = includeUnvested ? mvV2 + mvU2 : mvV2;
        const effectiveCost2 = includeUnvested ? costVested2 + (avg2 * h.qtyUnvested) : costVested2;
        return effectiveCost2 > 0 ? (effectiveMV2 - effectiveCost2) / effectiveCost2 : 0;
      }
      case 'realizedGain': return h.realizedGain;
      case 'totalRet': {
        const unreal = getSortValue(h, 'unrealized') as number;
        return unreal + h.realizedGain + h.dividends;
      }
      case 'totalMV': return h.totalMV;
      default: return 0;
    }
  };

  // Render helper for each portfolio group (keeps JSX cleaner)
  const renderGroup = (entry: [string, Holding[]]) => {
    const [groupName, groupHoldings] = entry;
    const isExpanded = expandedGroups[groupName] ?? true;
    const hasUnvested = groupHoldings.some(h => h.qtyUnvested > 0);

    const sortedHoldings = [...groupHoldings].sort((a, b) => {
      const va = getSortValue(a, sortBy);
      const vb = getSortValue(b, sortBy);
      if (va === vb) return 0;
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return (
      <Box key={groupName} component={Paper} sx={{ mb: 4, overflowX: 'auto' }}>
        {groupByPortfolio && (
          <Box display="flex" alignItems="center" justifyContent="space-between" p={1} bgcolor="#f5f5f5" borderBottom="1px solid #e0e0e0">
            <Box display="flex" alignItems="center" gap={1} onClick={() => setSelectedPortfolio(groupName)} style={{ cursor: 'pointer' }}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleGroup(groupName); }} sx={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>{groupName}</Typography>
            </Box>
            <Typography variant="caption" sx={{ opacity: 0.7, pr: 1 }}>{groupHoldings.length} holdings</Typography>
          </Box>
        )}
        <Collapse in={groupByPortfolio ? isExpanded : true} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableHead>
              {/* Keep this order: Identity, Quantity, Value, Gains */}
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                {columnVisibility.displayName && <TableCell onContextMenu={(e) => handleContextMenu(e, 'displayName')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Display Name</TableSortLabel></TableCell>}
                {columnVisibility.ticker && <TableCell onContextMenu={(e) => handleContextMenu(e, 'ticker')}><TableSortLabel active={sortBy === 'ticker'} direction={sortDir} onClick={() => handleSort('ticker')}>Ticker</TableSortLabel></TableCell>}
                {columnVisibility.sector && <TableCell onContextMenu={(e) => handleContextMenu(e, 'sector')}><TableSortLabel active={sortBy === 'sector'} direction={sortDir} onClick={() => handleSort('sector')}>Sector</TableSortLabel></TableCell>}
                {columnVisibility.qty && <TableCell onContextMenu={(e) => handleContextMenu(e, 'qty')} align="right"><TableSortLabel active={sortBy === 'qty'} direction={sortDir} onClick={() => handleSort('qty')}>Quantity</TableSortLabel></TableCell>}
                {columnVisibility.avgCost && <TableCell onContextMenu={(e) => handleContextMenu(e, 'avgCost')} align="right"><TableSortLabel active={sortBy === 'avgCost'} direction={sortDir} onClick={() => handleSort('avgCost')}>Avg Cost</TableSortLabel></TableCell>}
                {columnVisibility.currentPrice && <TableCell onContextMenu={(e) => handleContextMenu(e, 'currentPrice')} align="right"><TableSortLabel active={sortBy === 'currentPrice'} direction={sortDir} onClick={() => handleSort('currentPrice')}>Current Price</TableSortLabel></TableCell>}
                {columnVisibility.mv && <TableCell onContextMenu={(e) => handleContextMenu(e, 'mv')} align="right"><TableSortLabel active={sortBy === 'marketValue'} direction={sortDir} onClick={() => handleSort('marketValue')}>Market Value</TableSortLabel></TableCell>}
                {includeUnvested && <TableCell align="right"><TableSortLabel active={sortBy === 'mvVested'} direction={sortDir} onClick={() => handleSort('mvVested')}>Vested Value</TableSortLabel></TableCell>}
                {hasUnvested && <TableCell align="right"><TableSortLabel active={sortBy === 'mvUnvested'} direction={sortDir} onClick={() => handleSort('mvUnvested')}>Unvested Value</TableSortLabel></TableCell>}
                {columnVisibility.unrealizedGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGain')} align="right"><TableSortLabel active={sortBy === 'unrealizedGain'} direction={sortDir} onClick={() => handleSort('unrealizedGain')}>Unrealized Gain</TableSortLabel></TableCell>}
                {columnVisibility.unrealizedGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'unrealizedGainPct')} align="right"><TableSortLabel active={sortBy === 'unrealizedGainPct'} direction={sortDir} onClick={() => handleSort('unrealizedGainPct')}>Unrealized Gain %</TableSortLabel></TableCell>}
                {columnVisibility.realizedGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGain')} align="right"><TableSortLabel active={sortBy === 'realizedGain'} direction={sortDir} onClick={() => handleSort('realizedGain')}>Realized Gain</TableSortLabel></TableCell>}
                {columnVisibility.realizedGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainPct')} align="right"><TableSortLabel active={sortBy === 'realizedGainPct'} direction={sortDir} onClick={() => handleSort('realizedGainPct')}>Realized Gain %</TableSortLabel></TableCell>}
                {columnVisibility.realizedGainAfterTax && <TableCell onContextMenu={(e) => handleContextMenu(e, 'realizedGainAfterTax')} align="right"><TableSortLabel active={sortBy === 'realizedGainAfterTax'} direction={sortDir} onClick={() => handleSort('realizedGainAfterTax')}>Realized Gain After Tax</TableSortLabel></TableCell>}
                {columnVisibility.totalGain && <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGain')} align="right"><TableSortLabel active={sortBy === 'totalGain'} direction={sortDir} onClick={() => handleSort('totalGain')}>Total Gain</TableSortLabel></TableCell>}
                {columnVisibility.totalGainPct && <TableCell onContextMenu={(e) => handleContextMenu(e, 'totalGainPct')} align="right"><TableSortLabel active={sortBy === 'totalGainPct'} direction={sortDir} onClick={() => handleSort('totalGainPct')}>Total Gain %</TableSortLabel></TableCell>}
                {columnVisibility.valueAfterTax && <TableCell onContextMenu={(e) => handleContextMenu(e, 'valueAfterTax')} align="right"><TableSortLabel active={sortBy === 'valueAfterTax'} direction={sortDir} onClick={() => handleSort('valueAfterTax')}>Value After Tax</TableSortLabel></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedHoldings.map(h => {
                const avg = h.totalQty > 0 ? h.costBasis / h.totalQty : 0;
                const costVested = avg * h.qtyVested;
                const costUnvested = avg * h.qtyUnvested;
                const mvV = h.mvVested;
                const mvU = h.mvUnvested;
                const displayedVestedValue = mvV;
                const displayedUnvestedValue = mvU;
                const effectiveCost = includeUnvested ? costVested + costUnvested : costVested;
                const unrealized = (includeUnvested ? h.totalMV : h.mvVested) - effectiveCost;
                const unrealizedPct = effectiveCost > 0 ? unrealized / effectiveCost : 0;
                const totalRet = unrealized + h.realizedGain + h.dividends;
                const portfolio = portMap.get(h.portfolioId);
                const holdingCurrency = portfolio?.currency || displayCurrency;

                return (
                  <TableRow key={h.key} hover>
                    {columnVisibility.displayName && <TableCell sx={{ fontWeight: 'bold' }}>{h.displayName}</TableCell>}
                    {columnVisibility.ticker && <TableCell>{h.ticker}</TableCell>}
                    {columnVisibility.sector && <TableCell>{h.sector}</TableCell>}
                    {columnVisibility.qty && <TableCell align="right">{h.totalQty.toLocaleString()}</TableCell>}
                    {columnVisibility.avgCost && <TableCell align="right">{formatMoney(h.avgCost, holdingCurrency)}</TableCell>}
                    {columnVisibility.currentPrice && <TableCell align="right">{formatMoney(h.currentPrice, holdingCurrency)}</TableCell>}
                    {columnVisibility.mv && <TableCell align="right">{formatMoney(h.totalMV)}</TableCell>}
                    {includeUnvested && <TableCell align="right">{formatMoney(displayedVestedValue)}</TableCell>}
                    {hasUnvested && <TableCell align="right" sx={{ color: 'text.secondary' }}>{displayedUnvestedValue > 0 ? formatMoney(displayedUnvestedValue) : '-'}</TableCell>}
                    {columnVisibility.unrealizedGain && <TableCell align="right"><Typography variant="body2" color={unrealized >= 0 ? 'success.main' : 'error.main'}>{formatMoney(unrealized)}</Typography></TableCell>}
                    {columnVisibility.unrealizedGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(unrealizedPct)}</TableCell>}
                    {columnVisibility.realizedGain && <TableCell align="right">{formatMoney(h.realizedGain)}</TableCell>}
                    {columnVisibility.realizedGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(h.realizedGainPct)}</TableCell>}
                    {columnVisibility.realizedGainAfterTax && <TableCell align="right">{formatMoney(h.realizedGainAfterTax)}</TableCell>}
                    {columnVisibility.totalGain && <TableCell align="right" sx={{ fontWeight: 'bold', color: totalRet >= 0 ? 'success.dark' : 'error.dark' }}>{formatMoney(totalRet)}</TableCell>}
                    {columnVisibility.totalGainPct && <TableCell align="right" sx={{ color: 'text.secondary' }}>{formatPct(h.totalGainPct)}</TableCell>}
                    {columnVisibility.valueAfterTax && <TableCell align="right">{formatMoney(h.valueAfterTax)}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Collapse>
      </Box>
    );
  };

  const formatMoney = (n: number, currency = displayCurrency, decimals = 2) => {
    const rate = exchangeRates[currency] || 1;
    const value = (n * rate).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (currency === 'USD') return `$${value}`;
    if (currency === 'ILS') return `₪${value}`;
    return value;
  }
  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 4 }}>
      {/* SUMMARY CARD */}
      <Paper sx={{ p: 3, mb: 4, bgcolor: 'primary.main', color: 'white' }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={3}>
            {selectedPortfolio ? (
              <>
              <Button variant="outlined" color="inherit" onClick={() => setSelectedPortfolio(null)} sx={{ mb: 1 }}>
                &larr; Back to All Portfolios
              </Button>
              <Typography variant="h5" fontWeight="bold">{selectedPortfolio}</Typography>
              </>
            ) : (
              <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>TOTAL AUM</Typography>
            )}
            <Typography variant="h4" fontWeight="bold">{formatMoney(summary.aum, displayCurrency, 0)}</Typography>
          </Grid>
          <Grid item xs={12} md={9}>
            <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center">
              <Select value={displayCurrency} onChange={handleCurrencyChange} size="small" sx={{ color: 'white', '& .MuiSvgIcon-root': { color: 'white' } }}>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="ILS">ILS</MenuItem>
              </Select>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>UNREALIZED GAIN</Typography>
                <Typography variant="h6" color={summary.totalUnrealized >= 0 ? '#4caf50' : '#ff5252'}>
                  {summary.totalUnrealized >= 0 ? '+' : ''}{formatMoney(summary.totalUnrealized, displayCurrency, 0)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>REALIZED GAIN</Typography>
                <Typography variant="h6">
                  {summary.totalRealized >= 0 ? '+' : ''}{formatMoney(summary.totalRealized, displayCurrency, 0)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>REALIZED GAIN AFTER TAX</Typography>
                <Typography variant="h6">
                  {summary.realizedGainAfterTax >= 0 ? '+' : ''}{formatMoney(summary.realizedGainAfterTax, displayCurrency, 0)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>TOTAL RETURN</Typography>
                <Typography variant="h6" fontWeight="bold">
                  {summary.totalReturn >= 0 ? '+' : ''}{formatMoney(summary.totalReturn, displayCurrency, 0)}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" sx={{ opacity: 0.8 }}>VALUE AFTER TAX</Typography>
                <Typography variant="h6" fontWeight="bold">
                  {formatMoney(summary.valueAfterTax, displayCurrency, 0)}
                </Typography>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* CONTROLS */}
      <Box display="flex" justifyContent="space-between" mb={2}>
        <ColumnSelector
          columns={columnVisibility}
          columnDisplayNames={columnDisplayNames}
          onColumnChange={(key, value) =>
            setColumnVisibility((prev) => ({ ...prev, [key]: value }))
          }
          anchorEl={anchorEl}
          open={openColSelector}
          onClick={handleClickColSelector}
          onClose={handleCloseColSelector}
        />
        <Box>
          <FormControlLabel
            control={<Switch checked={includeUnvested} onChange={e => setIncludeUnvested(e.target.checked)} />}
            label='Include Unvested'
            sx={{ mr: 2 }}
          />
          <FormControlLabel
            control={<Switch checked={groupByPortfolio} onChange={e => setGroupByPortfolio(e.target.checked)} />}
            label="Group by Portfolio"
          />
        </Box>
      </Box>

      {/* TABLES */}
      {Object.entries(groupedData).map(renderGroup)}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleHideColumn}>Hide Column</MenuItem>
      </Menu>
    </Box>
  );
}