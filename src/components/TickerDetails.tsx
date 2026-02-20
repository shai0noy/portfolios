import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton, ToggleButtonGroup, ToggleButton, Menu, MenuItem, ListItemIcon, Tabs, Tab } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState, useMemo, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '../lib/i18n';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PieChartIcon from '@mui/icons-material/PieChart';
import { TickerChart } from './TickerChart';
import type { TickerProfile } from '../lib/types/ticker';
import { useChartComparison, getAvailableRanges, getMaxLabel, SEARCH_OPTION_TICKER } from '../lib/hooks/useChartComparison';
import { useTickerDetails, type TickerDetailsProps } from '../lib/hooks/useTickerDetails';
import { TickerSearch } from './TickerSearch';
import { Exchange } from '../lib/types';
import { formatMoneyPrice, formatPercent, normalizeCurrency, formatMoneyValue } from '../lib/currency';
import { AnalysisDialog } from './AnalysisDialog';
import { HoldingDetails } from './HoldingDetails';
import { HoldingUnderlyingAssets } from './holding-details/HoldingUnderlyingAssets';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { loadFinanceEngine } from '../lib/data/loader';
import type { Holding } from '../lib/data/model';


const formatDate = (timestamp?: Date | string | number | null) => {
  if (!timestamp) return 'N/A';
  const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const formatTimestamp = (timestamp?: Date | string | number | null) => {
  if (!timestamp) return 'N/A';
  const date = (timestamp instanceof Date) ? timestamp : new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const dateStr = formatDate(date);
  return isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${dateStr} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};



export function TickerDetails({ sheetId, ticker: propTicker, exchange: propExchange, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, onClose, portfolios = [], isPortfoliosLoading = false }: TickerDetailsProps) {
  const { ticker: paramTicker, exchange: paramExchange } = useParams();
  const resolvedTickerInput = propTicker || paramTicker;
  const resolvedExchangeInput = propExchange || (paramExchange as any);

  const { t, tTry } = useLanguage();
  const location = useLocation() as any;
  const tickerDetailsResult = useTickerDetails({ sheetId, ticker: resolvedTickerInput, exchange: resolvedExchangeInput, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, portfolios, isPortfoliosLoading });

  const {
    ticker, exchange, data, holdingData, historicalData, loading, error, refreshing,
    sheetRebuildTime, handleRefresh, displayData, resolvedName, resolvedNameHe,
    ownedInPortfolios, externalLinks, formatVolume, state, navigate
  } = tickerDetailsResult;

  const getPortfolioHistory = async (portfolioId: string | null) => {
    try {
      const engine = await loadFinanceEngine(sheetId);

      // FinanceEngine holdings/transactions are Maps, convert to Arrays
      const allHoldings = Array.from(engine.holdings.values());
      const allTransactions = Array.from(engine.transactions.values());

      let relevantHoldings: any[] = allHoldings;
      let relevantTransactions: any[] = allTransactions;

      if (portfolioId) {
        relevantHoldings = allHoldings.filter((h: any) => h.portfolioId === portfolioId);
        relevantTransactions = allTransactions.filter((t: any) => t.portfolioId === portfolioId);
      }

      const { getExchangeRates } = await import('../lib/currency');
      const { calculatePortfolioPerformance } = await import('../lib/performance');

      const rates = await getExchangeRates(sheetId);
      const displayCurrency = normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD');

      const { points } = await calculatePortfolioPerformance(relevantHoldings, relevantTransactions, displayCurrency, rates);

      return points.map(p => ({
        date: new Date(p.date),
        price: p.twr // TWR is cumulative (e.g. 1.05), Chart Percent Mode expects 0.05 for 5%? 
        // WAIT. TickerChart receives "price" data. 
        // If mode is 'percent', TickerChart calculates (val / base - 1).
        // IF we pass raw TWR factor (1.0, 1.05), TickerChart will do (1.05 / 1.0 - 1) = 0.05 = 5%. Correct.
        // SO WE SHOULD PASS RAW TWR.
        // BUT `p.twr` from `calculatePortfolioPerformance` starts at 1.0? Yes.
        // So just passing `p.twr` as price should work if we want the chart to treat it like a price history starting at 1.0.
      }));
    } catch (e) {
      console.error("Failed to calc portfolio history", e);
      return [];
    }
  };

  const {
    chartRange, setChartRange, comparisonSeries, comparisonOptions,
    comparisonLoading, handleSelectComparison, handleRemoveComparison,
    getClampedData, isSearchOpen, setIsSearchOpen
  } = useChartComparison({ portfolios, getPortfolioHistory });

  const [chartMetric, setChartMetric] = useState<'percent' | 'price'>('percent');
  const [compareMenuAnchor, setCompareMenuAnchor] = useState<null | HTMLElement>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeTab, setActiveTabRaw] = useState('analysis');
  const handleTabChange = (_: any, v: string) => setActiveTabRaw(v);
  const [engineHoldings, setEngineHoldings] = useState<Holding[]>([]);

  // Resolve the "Active Holding" - from navigation state (enriched) or hook
  const enrichedHolding = useMemo(() => {
    const stateHolding = location.state?.holding;
    if (stateHolding && stateHolding.ticker === ticker) return stateHolding as EnrichedDashboardHolding;
    return null;
  }, [location.state, ticker]);

  useEffect(() => {
    if (ownedInPortfolios && ownedInPortfolios.length > 0) {
      loadFinanceEngine(sheetId).then(eng => {
        const matches: Holding[] = []; // UnifiedHolding was Holding | SheetHolding, but Engine only has Holding
        eng.holdings.forEach((h: Holding) => {
          if (h.ticker === ticker && (h.exchange === exchange || !exchange)) {
            matches.push(h);
          }
        });
        setEngineHoldings(matches);
      }).catch(console.error);
    }
  }, [sheetId, ownedInPortfolios, ticker, exchange]);

  const hasHolding = useMemo(() => {
    return !!(enrichedHolding || (ownedInPortfolios && ownedInPortfolios.length > 0));
  }, [enrichedHolding, ownedInPortfolios]);

  const handlePortfolioClick = (id: string) => {
    onClose?.(); 
    navigate(`/portfolios/${id}`);
  };

  const handleTickerSearchSelect = (tickerProfile: TickerProfile) => {
    handleSelectComparison({
      type: 'TICKER',
      ticker: tickerProfile.symbol,
      exchange: tickerProfile.exchange,
      name: tickerProfile.name,
    });
    setIsSearchOpen(false);
  };

  const oldestDate = historicalData?.[0]?.date;
  const availableRanges = useMemo(() => getAvailableRanges(oldestDate), [oldestDate]);
  const maxLabel = useMemo(() => getMaxLabel(oldestDate), [oldestDate]);

  const displayHistory = useMemo(() => getClampedData(historicalData, chartRange), [historicalData, chartRange, getClampedData]);
  const displayComparisonSeries = useMemo(() => comparisonSeries.map(series => ({ ...series, data: getClampedData(series.data, chartRange) })), [comparisonSeries, chartRange, getClampedData]);

  const isComparison = comparisonSeries.length > 0;
  const effectiveChartMetric = isComparison ? 'percent' : chartMetric;

  const handleClose = () => {
    if (onClose) onClose();
    else if (state?.from) navigate(state.from, { state: state.returnState });
    else navigate('/dashboard');
  };

  const handleAddTransaction = () => {
    navigate('/transaction', {
      state: {
        prefilledTicker: ticker,
        prefilledExchange: data?.exchange || exchange,
        initialPrice: data?.price?.toString(),
        initialCurrency: data?.currency,
        numericId: data?.numericId || holdingData?.numericId,
        initialName: resolvedName,
        initialNameHe: resolvedNameHe
      }
    });
  };

  const translateRange = (range: string) => {
    const map: Record<string, string> = { '1D': t('1D', 'יומי'), '1W': t('1W', 'שבוע'), '1M': t('1M', 'חודש'), '3M': t('3M', '3 חודשים'), 'YTD': t('YTD', 'מתחילת שנה'), '1Y': t('1Y', 'שנה'), '3Y': t('3Y', '3 שנים'), '5Y': t('5Y', '5 שנים'), 'Max': t('Max', 'מקסימום') };
    return map[range] || (range.endsWith('D') ? range.replace('D', t('D', ' ימים')) : range);
  };

  const rawTimestamp = data?.timestamp || sheetRebuildTime;
  const dataTimestamp = rawTimestamp ? new Date(rawTimestamp) : null;
  const lastUpdated = formatTimestamp(dataTimestamp || undefined);
  const isStale = dataTimestamp ? (Date.now() - dataTimestamp.getTime()) > 1000 * 60 * 60 * 24 * 3 : false;

  const getPerf = (val?: number, date?: Date) => val != null && !isNaN(val) ? { val, date } : undefined;
  const perfData: Record<string, { val: number, date?: Date } | undefined> = {
    '1D': getPerf(data?.changePct1d ?? holdingData?.changePct1d, data?.changeDate1d ?? holdingData?.changeDate1d),
    [data?.recentChangeDays ? `${data.recentChangeDays}D` : '1W']: getPerf(data?.changePctRecent ?? holdingData?.changePctRecent, data?.changeDateRecent ?? holdingData?.changeDateRecent),
    '1M': getPerf(data?.changePct1m ?? holdingData?.changePct1m, data?.changeDate1m ?? holdingData?.changeDate1m),
    '3M': getPerf(data?.changePct3m ?? holdingData?.changePct3m, data?.changeDate3m ?? holdingData?.changeDate3m),
    'YTD': getPerf(data?.changePctYtd ?? holdingData?.changePctYtd, data?.changeDateYtd ?? holdingData?.changeDateYtd),
    '1Y': getPerf(data?.changePct1y ?? holdingData?.changePct1y, data?.changeDate1y ?? holdingData?.changeDate1y),
    '3Y': getPerf(data?.changePct3y ?? holdingData?.changePct3y, data?.changeDate3y ?? holdingData?.changeDate3y),
    '5Y': getPerf(data?.changePct5y ?? holdingData?.changePct5y, data?.changeDate5y ?? holdingData?.changeDate5y),
    'Max': getPerf(data?.changePctMax ?? holdingData?.changePctMax, data?.changeDateMax ?? holdingData?.changeDateMax),
  };

  const isTase = exchange == Exchange.TASE || displayData?.exchange === Exchange.TASE;
  const isProvident = exchange?.toUpperCase() === Exchange.GEMEL || displayData?.exchange === Exchange.GEMEL || exchange?.toUpperCase() === Exchange.PENSION || displayData?.exchange === Exchange.PENSION;
  const price = displayData?.price;
  const openPrice = displayData?.openPrice;
  // const maxDecimals = (price != null && price % 1 !== 0) || (openPrice != null && openPrice % 1 !== 0) ? 2 : 0;
  const dayChange = perfData['1D']?.val || 0;
  const volData = formatVolume(displayData?.volume, displayData?.currency);
  const volumeDisplay = volData ? `${volData.text} ${volData.currency}` : null;

  const parseExposureProfile = (profile: string | undefined) => {
    if (!profile || profile.length < 2) return null;
    const stockChar = profile[0];
    const forexChar = profile[1].toUpperCase();
    const stockMap: Record<string, string> = { '0': '0%', '1': '<10%', '2': '<30%', '3': '<50%', '4': '<120%', '5': '<200%', '6': '>200%' };
    const forexMap: Record<string, string> = { '0': '0%', 'A': '<10%', 'B': '<30%', 'C': '<50%', 'D': '<120%', 'E': '<200%', 'F': '>200%', };
    const stockExp = stockMap[stockChar];
    const forexExp = forexMap[forexChar];
    if (!stockExp && !forexExp) return null;
    return { stock: stockExp, forex: forexExp };
  };

  const exposure = displayData?.meta && 'exposureProfile' in displayData.meta ? parseExposureProfile(displayData.meta.exposureProfile) : null;

  const dividendGains = useMemo(() => {
    if (!data?.dividends || !displayData?.price) return {};
    
    const now = new Date();
    const result: Record<string, { pct: number, amount: number }> = {};
    const ranges = {
        '1Y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        '3Y': new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()),
        '5Y': new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()),
        'Max': new Date(0)
    };

    const sortedDivs = [...data.dividends].sort((a, b) => b.date.getTime() - a.date.getTime());
    const currentPrice = displayData.price;

    Object.entries(ranges).forEach(([range, cutoff]) => {
        const divsInRange = sortedDivs.filter(d => d.date >= cutoff);
        if (divsInRange.length === 0) return;
        
        const totalAmount = divsInRange.reduce((sum, d) => sum + d.amount, 0);
        if (currentPrice && currentPrice > 0) {
            result[range] = { pct: totalAmount / currentPrice, amount: totalAmount };
        }
    });
    
    return result;
  }, [data?.dividends, displayData?.price]);

  return (
    <>
      <Dialog open={true} onClose={handleClose} maxWidth="lg" fullWidth 
        sx={{ '& .MuiDialog-container': { alignItems: { xs: 'flex-start', md: 'center' }, pt: { xs: 4, md: 0 } } }}
        PaperProps={{ sx: { width: 'min(900px, 96%)', m: 1, maxHeight: '90vh', minHeight: { xs: 'auto', md: '600px' }, display: 'flex', flexDirection: 'column' } }}>
        <DialogTitle sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start">
            <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Tooltip title={tTry(resolvedName || ticker, resolvedNameHe)} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                  <Typography variant={(resolvedName || '').length > 30 ? 'h5' : 'h4'} component="div" fontWeight="bold" noWrap>{tTry(resolvedName || ticker, resolvedNameHe)}</Typography>
                </Tooltip>
                {ownedInPortfolios && ownedInPortfolios.length > 0 && (
                  <Tooltip title={`${t('Owned in', 'מוחזק ב')}: ${ownedInPortfolios.join(', ')}`} enterTouchDelay={0} leaveTouchDelay={3000}><BusinessCenterIcon color="action" /></Tooltip>
                )}
              </Box>
              <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                <Typography variant="subtitle1" component="div" color="text.secondary">{resolvedName ? `${exchange?.toUpperCase()}: ${ticker}` : exchange?.toUpperCase()}</Typography>
                {displayData?.sector && <Chip label={displayData.subSector ? (displayData.sector.includes(displayData.subSector) || displayData.subSector.includes(displayData.sector) ? displayData.subSector : `${displayData.sector} • ${displayData.subSector}`) : displayData.sector} size="small" variant="outlined" />}
                {displayData && 'dividendYield' in displayData && displayData.dividendYield !== undefined && displayData.dividendYield > 0 && (
                  <Tooltip title={t('Dividend Yield', 'תשואת דיבידנד')} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                    <Chip label={`${t('Yield', 'תשואה')}: ${formatPercent(displayData.dividendYield as number)}`} size="small" variant="outlined" />
                  </Tooltip>
                )}
                {(() => {
                  const displayType = displayData?.type ? t(displayData.type.nameEn, displayData.type.nameHe) : (displayData?.taseType || displayData?.globesTypeHe);
                  return displayType ? <Chip label={displayType} size="small" variant="outlined" /> : null;
                })()}
                {(() => {
                  if (!exposure || !displayData?.meta || !('exposureProfile' in displayData.meta)) return null;
                  const profileCode = displayData.meta.exposureProfile;
                  const tooltipParts = [];
                  if (exposure.stock) tooltipParts.push(`${t('Stocks', 'מניות')}: ${exposure.stock}`);
                  if (exposure.forex) tooltipParts.push(`${t('Forex', 'מט"ח')}: ${exposure.forex}`);
                  if (tooltipParts.length === 0) return null;
                  return (
                    <Tooltip title={tooltipParts.join(' | ')} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                      <Chip label={<Box display="flex" alignItems="center">{t('Exposure', 'חשיפה')}: {profileCode}<InfoOutlinedIcon sx={{ fontSize: '0.9rem', ml: 0.5, opacity: 0.7 }} /></Box>} size="small" variant="outlined" />
                    </Tooltip>
                  );
                })()}
                {displayData?.providentInfo?.managementFee !== undefined && <Chip label={`${t('Mgmt fee:', 'דמי ניהול:')} ${displayData.providentInfo.managementFee}%`} size="small" variant="outlined" />}
                {displayData?.providentInfo?.depositFee !== undefined && <Chip label={`${t('Deposit fee:', 'דמי הפקדה:')} ${displayData.providentInfo.depositFee}%`} size="small" variant="outlined" />}
              </Box>
            </Box>
            {displayData && (
              <Box sx={{ textAlign: 'right', ml: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {!isProvident && (
                  <>
                    <Box display="flex" alignItems="baseline" justifyContent="flex-end" gap={1.5}>
                      <Typography variant="h6" component="div" fontWeight={600}>{formatMoneyPrice({ amount: price || 0, currency: normalizeCurrency(isTase ? 'ILA' : (displayData?.currency || 'USD')) }, t)}</Typography>
                      <Tooltip title={`${t('Day change', 'שינוי יומי')} (${lastUpdated})`} placement="top" enterTouchDelay={0} leaveTouchDelay={3000}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>{formatPercent(dayChange)}</Typography>
                      </Tooltip>
                    </Box>
                    {(openPrice != null && openPrice !== 0 || data?.tradeTimeStatus || volumeDisplay) && (
                      <Box display="flex" alignItems="baseline" justifyContent="flex-end" gap={1} mt={0.25}>
                        {openPrice != null && openPrice !== 0 && <Typography variant="caption" color="text.secondary">{t('Open:', 'פתיחה:')} {formatMoneyPrice({ amount: openPrice, currency: normalizeCurrency(isTase ? 'ILA' : (displayData?.currency || 'USD')) }, t)}</Typography>}
                        {openPrice != null && openPrice !== 0 && (data?.tradeTimeStatus || volumeDisplay) && <Typography variant="caption" color="text.secondary">|</Typography>}
                        {volumeDisplay && (
                          <>
                            <Tooltip title={t('Average daily trading volume (quarterly avg)', 'מחזור מסחר יומי ממוצע (ממוצע רבעוני)')} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                              <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>{t('Vol:', 'מחזור:')} {volumeDisplay}</Typography>
                            </Tooltip>
                            {data?.tradeTimeStatus && <Typography variant="caption" color="text.secondary">|</Typography>}
                          </>
                        )}
                        {data?.tradeTimeStatus && <Typography variant="caption" color="text.secondary">{t('Stage:', 'שלב:')} {data.tradeTimeStatus}</Typography>}
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}
          </Box>
        </DialogTitle>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label={t('Analysis', 'ניתוח')} value="analysis" />
            {hasHolding && <Tab label={t('Holdings', 'החזקות')} value="holdings" />}
            {hasHolding && <Tab label={t('Transactions', 'עסקאות')} value="transactions" />}
            {hasHolding && <Tab label={t('Dividends', 'דיבידנדים')} value="dividends" />}
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {loading ? <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box> :
            error ? <Typography color="error">{error}</Typography> :
              !displayData && !resolvedName ? <Typography>{t('No data available.', 'אין נתונים זמינים.')}</Typography> :
                <>
                  {activeTab === 'analysis' && (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {isStale && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{t('Data is from', 'הנתונים מתאריך')}: {formatDate(dataTimestamp)}</Typography>}
                        <Typography variant="subtitle2" gutterBottom>{t('Performance', 'ביצועים')}</Typography>
                        <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                        {(() => {
                          const getDuration = (p: string) => {
                            const now = new Date();
                            switch (p) {
                              case '1D': return 1;
                              case '1W': return 7;
                              case '1M': return 30;
                              case '3M': return 90;
                              case '6M': return 180;
                              case 'YTD':
                                const startOfYear = new Date(now.getFullYear(), 0, 1);
                                return (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
                              case '1Y': return 365;
                              case '3Y': return 365 * 3;
                              case '5Y': return 365 * 5;
                              case 'Max': return 36500;
                              default:
                                // Handle "XD" format (e.g. "5D")
                                if (p.endsWith('D')) {
                                  const days = parseInt(p.slice(0, -1), 10);
                                  if (!isNaN(days)) return days;
                                }
                                return 99999;
                            }
                          };

                          return Object.entries(perfData)
                            .filter(([_, item]) => item != null)
                            .sort(([rangeA], [rangeB]) => getDuration(rangeA) - getDuration(rangeB))
                            .map(([range, item]) => item && (
                              <Tooltip key={range} title={item.date ? `Since ${formatDate(item.date)}` : ''} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                                <Chip variant="outlined" size="small" sx={{ minWidth: 78, py: 0.5, px: 0.75, height: 'auto', color: item.val > 0 ? 'success.main' : item.val < 0 ? 'error.main' : 'text.primary', '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center' } }}
                                  label={<><Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(item.val)}</Typography></>}
                                />
                              </Tooltip>
                                    ));
                        })()}
                      </Box>
                                                
                                                                        {historicalData && historicalData.length > 0 && (                            <>
                            <Box display="flex" justifyContent="flex-start" alignItems="center" gap={1} flexWrap="wrap">
                                <ToggleButtonGroup value={chartRange} exclusive onChange={(_, v) => v && setChartRange(v)} size="small">
                                {availableRanges.map(r => <ToggleButton key={r} value={r}>{r === 'ALL' ? maxLabel : r}</ToggleButton>)}
                                </ToggleButtonGroup>
                                <ToggleButtonGroup value={effectiveChartMetric} exclusive onChange={(_, v) => v && setChartMetric(v)} size="small" disabled={isComparison}>
                                <ToggleButton value="percent">%</ToggleButton>
                                <ToggleButton value="price">$</ToggleButton>
                                </ToggleButtonGroup>
                                <Button onClick={(e) => setCompareMenuAnchor(e.currentTarget)}>{t('Compare', 'השווה')}</Button>
                                <Menu anchorEl={compareMenuAnchor} open={Boolean(compareMenuAnchor)} onClose={() => setCompareMenuAnchor(null)}>
                            {(() => {
                              let lastGroup = '';
                              return comparisonOptions.map((opt) => {
                                const showHeader = opt.group && opt.group !== lastGroup;
                                if (showHeader) lastGroup = opt.group!;

                                return [
                                  showHeader && (
                                    <Box key={`header-${opt.group}`} sx={{ px: 2, py: 1, bgcolor: 'background.default', typography: 'caption', color: 'text.secondary', fontWeight: 'bold' }}>
                                      {opt.group}
                                    </Box>
                                  ),
                                  <MenuItem
                                    key={opt.name}
                                    onClick={() => { handleSelectComparison(opt); setCompareMenuAnchor(null); }}
                                    disabled={comparisonSeries.some(s => s.name === opt.name) || comparisonLoading[opt.name]}
                                    sx={{ pl: opt.group ? 3 : 2, minHeight: 32 }}
                                    dense
                                  >
                                    {opt.ticker === SEARCH_OPTION_TICKER && <ListItemIcon sx={{ minWidth: 32 }}><SearchIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /></ListItemIcon>}
                                    {opt.icon && opt.ticker !== SEARCH_OPTION_TICKER && (
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        {opt.icon === 'pie_chart' ? <PieChartIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /> :
                                          opt.icon === 'business_center' ? <BusinessCenterIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /> :
                                            null}
                                      </ListItemIcon>
                                    )}
                                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>{opt.name}</Typography>
                                    {comparisonLoading[opt.name] && <CircularProgress size={12} sx={{ ml: 1 }} />}
                                  </MenuItem>
                                ];
                              });
                            })()}
                                </Menu>
                                <Button onClick={() => setAnalysisOpen(true)}>{t('Analysis', 'ניתוח')}</Button>
                            </Box>
                            {comparisonSeries.length > 0 && <Box display="flex" flexWrap="wrap" gap={1} sx={{ mt: 1, mb: 1 }}>{comparisonSeries.map(s => <Chip key={s.name} label={s.name} onDelete={() => handleRemoveComparison(s.name)} variant="outlined" size="small" sx={{ color: s.color, borderColor: s.color }} />)}</Box>}
                            <Box sx={{ height: 400 }}>
                                <TickerChart series={[{ name: resolvedName || ticker || 'Main', data: displayHistory }, ...displayComparisonSeries]} currency={displayData?.currency || 'USD'} mode={effectiveChartMetric} height="100%" />
                            </Box>
                            </>
                        )}

                        {data?.dividends && data.dividends.length > 0 && (
                          <>
                            <Typography variant="subtitle2" gutterBottom sx={{ mt: 0.5 }}>{t('Dividend Gains', 'רווחי דיבידנד')}</Typography>
                            <Box display="flex" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                              {Object.entries(dividendGains).map(([range, info]) => {
                                const value = info.pct;
                                if (value === undefined || value === null || isNaN(value) || value === 0) {
                                  return null;
                                }
                                const isPositive = value > 0;
                                const textColor = isPositive ? 'success.main' : 'error.main';
                                return (
                                  <Chip
                                    key={range}
                                    variant="outlined"
                                    size="small"
                                    sx={{
                                      minWidth: 80,
                                      py: 0.5,
                                      px: 0.75,
                                      height: 'auto',
                                      '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' },
                                      '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 84 }
                                    }}
                                    label={
                                      <>
                                        <Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: textColor }}>{formatPercent(value)}</Typography>
                                        <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8 }}>{formatMoneyValue({ amount: info.amount, currency: normalizeCurrency(displayData?.currency || 'USD') })}</Typography>
                                      </>
                                    }
                                  />
                                );
                              })}
                            </Box>
                          </>
                        )}

                      {/* Underlying Assets Section */}
                      {displayData?.meta?.underlyingAssets && displayData.meta.underlyingAssets.length > 0 && (
                        <Box sx={{ mt: 3, mb: 2 }}>
                          <HoldingUnderlyingAssets assets={displayData.meta.underlyingAssets} />
                        </Box>
                      )}

                        {externalLinks.length > 0 && (
                            <>
                            <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>{t('External Links', 'קישורים חיצוניים')}</Typography>
                            <Box display="flex" flexWrap="wrap" gap={1}>
                                {externalLinks.map(link => (
                                <Button key={link.name} variant="outlined" size="small" href={link.url} target="_blank" endIcon={<OpenInNewIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{link.name}</Button>
                                ))}
                            </Box>
                            </>
                        )}
                    </Box>
                  )}

                  {activeTab === 'assets' && displayData?.meta?.underlyingAssets && (
                    <Box sx={{ mt: 2, flex: 1, overflow: 'auto' }}>
                      <HoldingDetails
                        sheetId={sheetId}
                        holding={{ ...displayData, underlyingAssets: displayData.meta.underlyingAssets } as any}
                        holdings={[]}
                        displayCurrency={normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')}
                        portfolios={portfolios}
                        onPortfolioClick={handlePortfolioClick}
                        section="assets" // specific section for just assets
                      />
                    </Box>
                  )}

                  {(activeTab === 'holdings' || activeTab === 'transactions' || activeTab === 'dividends') && hasHolding && (
                    <Box sx={{ mt: 2, flex: 1, overflow: 'auto' }}>
                      {(() => {
                        const has = (engineHoldings && engineHoldings.length > 0) || !!enrichedHolding || !!holdingData;
                        return has;
                      })() ? (
                        (() => {
                          const h = (enrichedHolding || (engineHoldings && engineHoldings[0]) || holdingData)! as any;
                          return (
                            <HoldingDetails
                            sheetId={sheetId}
                              holding={h}
                          holdings={engineHoldings && engineHoldings.length > 0 ? engineHoldings as any[] : (enrichedHolding ? [enrichedHolding] : undefined)}
                            displayCurrency={normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')}
                            portfolios={portfolios}
                            onPortfolioClick={handlePortfolioClick}
                              section={activeTab === 'holdings' ? 'holdings' : activeTab === 'transactions' ? 'transactions' : 'dividends'}
                            />
                            );
                          })()
                        ) : (
                            <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
                        )}
                    </Box>
                  )}
                </>}
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3, gap: 1 }}>
          <Tooltip title={t("Refresh Data", "רענן נתונים")} enterTouchDelay={0} leaveTouchDelay={3000}>
            <IconButton onClick={handleRefresh} disabled={refreshing} size="small">{refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}</IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={handleClose} color="inherit" sx={{ textTransform: 'none' }}>{t('Close', 'סגור')}</Button>
          <Button variant="contained" onClick={handleAddTransaction} startIcon={<AddIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{t('Add Transaction', 'הוסף עסקה')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={isSearchOpen} onClose={() => setIsSearchOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('Search to Compare', 'חפש להשוואה')}</DialogTitle>
        <DialogContent>
          <TickerSearch portfolios={portfolios} isPortfoliosLoading={isPortfoliosLoading} onTickerSelect={handleTickerSearchSelect} sx={{ mt: 1 }} />
        </DialogContent>
      </Dialog>
      <AnalysisDialog
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        mainSeries={historicalData ? { name: resolvedName || ticker || 'Main', data: historicalData } : null}
        comparisonSeries={comparisonSeries}
        title={`${t('Overview', 'סקירה')}: ${tTry(resolvedName || ticker || '', resolvedNameHe)}`}
        initialRange={chartRange}
        currency={data?.currency || 'USD'}
        subjectName={ticker}
      />
    </>
  );
}