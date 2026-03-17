import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton, ToggleButtonGroup, ToggleButton, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, useTheme, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useState, useMemo, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '../lib/i18n';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PieChartIcon from '@mui/icons-material/PieChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import DateRangeIcon from '@mui/icons-material/DateRange';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import EventIcon from '@mui/icons-material/Event';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PaidIcon from '@mui/icons-material/Paid';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TickerChart, type TrendType, type GammaType, TrendLineIcon, GammaIcon } from './TickerChart';
import type { TickerProfile } from '../lib/types/ticker';
import { useChartComparison, getAvailableRanges, getMaxLabel, SEARCH_OPTION_TICKER } from '../lib/hooks/useChartComparison';
import { useTickerDetails, type TickerDetailsProps } from '../lib/hooks/useTickerDetails';
import { TickerSearch } from './TickerSearch';
import { Exchange, isUSExchange, type ExchangeRates } from '../lib/types';
import { formatMoneyPrice, formatPercent, normalizeCurrency, formatMoneyValue, formatMoneyCompactValue, formatCompactValue } from '../lib/currency';
import { AnalysisDialog } from './AnalysisDialog';
import { TickerAiChat } from './TickerAiChat';
import { checkGeminiKey } from '../lib/gemini';
import toast from 'react-hot-toast';
import { CustomRangeDialog } from './CustomRangeDialog';
import { HoldingDetails } from './HoldingDetails';
import { HoldingUnderlyingAssets } from './holding-details/HoldingUnderlyingAssets';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { loadFinanceEngine } from '../lib/data/loader';
import type { Holding } from '../lib/data/model';
import { useScrollShadows, ScrollShadows, useResponsiveDialogProps } from '../lib/ui-utils';


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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { ticker: paramTicker, exchange: paramExchange } = useParams();
  const resolvedTickerInput = propTicker || paramTicker;
  const resolvedExchangeInput = propExchange || (paramExchange as any);

  const { t, tTry } = useLanguage();
  const location = useLocation() as any;
  const responsiveDialogProps = useResponsiveDialogProps();
  const tickerDetailsResult = useTickerDetails({ sheetId, ticker: resolvedTickerInput, exchange: resolvedExchangeInput, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, portfolios, isPortfoliosLoading });

  const {
    ticker, exchange, data, holdingData, historicalData, loading, error, refreshing,
    sheetRebuildTime, handleRefresh, displayData, resolvedName, resolvedNameHe,
    ownedInPortfolios, externalLinks, formatVolume, state, navigate,
    isFavorite, toggleFavorite, isUpdatingFavorite, trackingLists
  } = tickerDetailsResult;

  const getPortfolioHistory = async (portfolioId: string | null) => {
    try {
      const { engine } = await loadFinanceEngine(sheetId);

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
        price: p.twr
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

  const [chartMetric, setChartMetric] = useState<'percent' | 'price' | 'candle'>('percent');
  const [scaleType, setScaleType] = useState<'linear' | 'log'>('linear');
  const [trendType, setTrendType] = useState<TrendType>('none');
  const [trendMenuAnchor, setTrendMenuAnchor] = useState<null | HTMLElement>(null);
  const [gammaType, setGammaType] = useState<GammaType>('none');
  const [gammaWindow, setGammaWindow] = useState<number | undefined>(undefined);
  const [gammaMenuAnchor, setGammaMenuAnchor] = useState<null | HTMLElement>(null);
  const [compareMenuAnchor, setCompareMenuAnchor] = useState<null | HTMLElement>(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [rangeMenuAnchor, setRangeMenuAnchor] = useState<null | HTMLElement>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const handleOpenChat = async () => {
    try {
      const key = await checkGeminiKey(sheetId);
      if (key) {
        setApiKey(key);
        setChatOpen(true);
      } else {
        toast.error(t('Please set your Gemini API Key in the Dashboard first.', 'אנא הגדר מפתח API של Gemini במסך הראשי תחילה.'));
      }
    } catch (e) {
      console.error(e);
      toast.error(t('Please set your Gemini API Key in the Dashboard first.', 'אנא הגדר מפתח API של Gemini במסך הראשי תחילה.'));
    }
  };

  useEffect(() => {
    if (location.state && (location.state as any).openAiChatId && !chatOpen) {
      handleOpenChat();
    }
  }, [location.state, chatOpen]);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });

  const [activeTab, setActiveTabRaw] = useState('analysis');
  const handleTabChange = (_: any, v: string) => setActiveTabRaw(v);
  const [engineHoldings, setEngineHoldings] = useState<Holding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);

  // Resolve the "Active Holding" - from navigation state (enriched) or hook
  const enrichedHolding = useMemo(() => {
    const stateHolding = location.state?.holding;
    if (stateHolding && stateHolding.ticker === ticker) return stateHolding as EnrichedDashboardHolding;
    return null;
  }, [location.state, ticker]);

  const [isEngineLoading, setIsEngineLoading] = useState(true);

  useEffect(() => {
    if (sheetId && ticker) {
      setIsEngineLoading(true);
      loadFinanceEngine(sheetId).then(({ engine: eng }) => {
        const matches: Holding[] = [];
        eng.holdings.forEach((h: Holding) => {
          const isTickerMatch = h.ticker.toUpperCase() === ticker.toUpperCase();
          const engineExchange = h.exchange;
          const targetExchange = exchange?.toUpperCase();

          let isExchangeMatch = !targetExchange || (engineExchange === targetExchange);

          // Relaxed matching for "US" region: If target is 'US', match 'NASDAQ' or 'NYSE'
          if (!isExchangeMatch && targetExchange === 'US' && isUSExchange(engineExchange)) {
            isExchangeMatch = true;
          }
          // Also reverse: if target is 'NASDAQ'/'NYSE' but engine (rarely) has 'US'
          if (!isExchangeMatch && targetExchange && isUSExchange(targetExchange) && (engineExchange as any) === 'US') {
            isExchangeMatch = true;
          }

          if (isTickerMatch && isExchangeMatch) {
            matches.push(h);
          }
        });
        setEngineHoldings(matches);
        import('../lib/currency').then(({ getExchangeRates }) => {
          getExchangeRates(sheetId).then(setExchangeRates).catch(console.error);
        });
      }).catch(console.error).finally(() => setIsEngineLoading(false));
    } else {
      setIsEngineLoading(false);
    }
  }, [sheetId, ticker, exchange]);

  const hasHolding = useMemo(() => {
    return !!(enrichedHolding || (ownedInPortfolios && ownedInPortfolios.length > 0) || (engineHoldings && engineHoldings.length > 0) || holdingData);
  }, [enrichedHolding, ownedInPortfolios, engineHoldings, holdingData]);

  const hasGrants = useMemo(() => {
    if (!hasHolding) return false;
    const checkLots = (lots: any[]) => lots?.some(l => !!l.vestingDate || !!l.vestDate);
    if (enrichedHolding && checkLots(enrichedHolding.activeLots)) return true;
    if (engineHoldings && engineHoldings.some((h: any) => checkLots(h.activeLots || h._lots))) return true;
    if (holdingData && checkLots((holdingData as any)._lots)) return true;
    return false;
  }, [hasHolding, enrichedHolding, engineHoldings, holdingData]);

  // Force activeTab to 'analysis' if hasHolding is false and we are on a holding tab
  // Force activeTab to 'analysis' if hasHolding is false AND we are done loading.
  // Force activeTab to 'analysis' if hasHolding is false and we are on a holding tab
  // Force activeTab to 'analysis' if hasHolding is false AND we are done loading.
  useEffect(() => {
    const validTabsNoHolding = ['analysis', 'calendar', 'financials'];
    if (!isEngineLoading && !hasHolding && !validTabsNoHolding.includes(activeTab)) {
      setActiveTabRaw('analysis');
    }
  }, [isEngineLoading, hasHolding, activeTab]);

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

  const displayHistory = useMemo(() => {
    if (chartRange === 'Custom') {
      if (!historicalData) return [];
      const { start, end } = customDateRange;
      return historicalData.filter(d => (!start || d.date >= start) && (!end || d.date <= end));
    }
    return getClampedData(historicalData, chartRange);
  }, [historicalData, chartRange, getClampedData, customDateRange]);

  const displayComparisonSeries = useMemo(() => comparisonSeries.map(series => ({
    ...series,
    data: chartRange === 'Custom'
      ? series.data.filter(d => (!customDateRange.start || d.date >= customDateRange.start) && (!customDateRange.end || d.date <= customDateRange.end))
      : getClampedData(series.data, chartRange)
  })), [comparisonSeries, chartRange, getClampedData, customDateRange]);

  const isComparison = comparisonSeries.length > 0;
  const effectiveChartMetric = isComparison ? 'percent' : chartMetric;

  const isLogSupported = useMemo(() => {
    if (effectiveChartMetric === 'percent') return true;
    if (!displayHistory || displayHistory.length === 0) return false;
    return displayHistory.every(d => {
      const val = d.adjClose ?? d.price;
      return val > 0;
    });
  }, [effectiveChartMetric, displayHistory]);

  useEffect(() => {
    if (!isLogSupported && scaleType === 'log') {
      setScaleType('linear');
    }
  }, [isLogSupported, scaleType]);

  const handleClose = () => {
    if (onClose) onClose();
    else if (state?.from) navigate(state.from, { state: state.returnState });
    else navigate('/dashboard');
  };

  const handleAddTransaction = () => {
    navigate(`/transaction?ticker=${encodeURIComponent(ticker || '')}&exchange=${encodeURIComponent(data?.exchange || exchange || '')}`, {
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
    const map: Record<string, string> = { '1D': t('1D', 'יומי'), '7D': t('1W', 'שבוע'), '1W': t('1W', 'שבוע'), '1M': t('1M', 'חודש'), '3M': t('3M', '3 חודשים'), 'YTD': t('YTD', 'מתחילת שנה'), '1Y': t('1Y', 'שנה'), '3Y': t('3Y', '3 שנים'), '5Y': t('5Y', '5 שנים'), 'Max': t('Max', 'מקסימום') };
    return map[range] || (range.endsWith('D') ? range.replace('D', t('D', ' ימים')) : range);
  };

  const rawTimestamp = data?.timestamp || sheetRebuildTime;
  const dataTimestamp = rawTimestamp ? new Date(rawTimestamp) : null;
  const lastUpdated = formatTimestamp(dataTimestamp || undefined);
  const isStale = dataTimestamp ? (Date.now() - dataTimestamp.getTime()) > 1000 * 60 * 60 * 24 * 3 : false;

  const getPerf = (val?: number, date?: Date) => val != null && isFinite(val) ? { val, date } : undefined;
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
      <Dialog open={true} onClose={handleClose} {...responsiveDialogProps}>
        <DialogTitle sx={{ p: isMobile ? 1.5 : 2 }}>
          <Box display="flex" flexDirection={isMobile ? 'column' : 'row'} justifyContent="space-between" alignItems={isMobile ? 'stretch' : 'flex-start'} gap={isMobile ? 1 : 0}>
            <Box sx={{ flex: 1, minWidth: 0, pr: isMobile ? 0 : 2 }}>
              <Box display="flex" alignItems="center" gap={1}>
                <Tooltip title={tTry(resolvedName || ticker, resolvedNameHe)} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                  <Typography variant={(resolvedName || '').length > 30 ? 'h6' : 'h5'} component="div" fontWeight="bold" noWrap>{tTry(resolvedName || ticker, resolvedNameHe)}</Typography>
                </Tooltip>
                <Tooltip title={isFavorite ? t('Remove from favorites', 'הסר ממועדפים') : t('Add to favorites', 'הוסף למועדפים')} enterTouchDelay={0} leaveTouchDelay={3000}>
                  <IconButton onClick={toggleFavorite} disabled={isUpdatingFavorite} size="small" sx={{ color: isFavorite ? 'success.main' : 'action.disabled' }}>
                    {isFavorite ? <StarIcon /> : <StarBorderIcon />}
                  </IconButton>
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
              <Box sx={{ textAlign: isMobile ? 'left' : 'right', ml: isMobile ? 0 : 2, display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: isMobile ? 'center' : 'flex-end', justifyContent: isMobile ? 'space-between' : 'flex-start', mt: isMobile ? 1 : 0, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap', gap: 1 }}>
                {!isProvident && (
                  <>
                    <Box display="flex" alignItems="baseline" justifyContent={isMobile ? 'flex-start' : 'flex-end'} gap={1.5}>
                      <Typography variant="h6" component="div" fontWeight={600}>{formatMoneyPrice({ amount: price || 0, currency: normalizeCurrency(isTase ? 'ILA' : (displayData?.currency || 'USD')) }, t)}</Typography>
                      <Tooltip title={`${t('Day change', 'שינוי יומי')} (${lastUpdated})`} placement="top" enterTouchDelay={0} leaveTouchDelay={3000}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>{formatPercent(dayChange)}</Typography>
                      </Tooltip>
                    </Box>
                    {(openPrice != null && openPrice !== 0 || data?.tradeTimeStatus || volumeDisplay) && (
                      <Box display="flex" alignItems="baseline" justifyContent={isMobile ? 'flex-end' : 'flex-end'} gap={1} mt={0.25}>
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
          <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
            <Tab label={t('Analysis', 'ניתוח')} value="analysis" />
            {hasHolding && <Tab label={t('Holdings', 'החזקות')} value="holdings" />}
            {hasHolding && <Tab label={t('Transactions', 'עסקאות')} value="transactions" />}
            {hasGrants && <Tab label={t('Grants', 'מענקים')} value="grants" />}
            {hasHolding && <Tab label={t('Dividends', 'דיבידנדים')} value="dividends" />}
            {(!!(displayData as any)?.calendarEvents || !!(displayData as any)?.incomeStatementHistory || !!(displayData as any)?.incomeStatementHistoryQuarterly) && <Tab label={t('Financials', 'פיננסי')} value="financials" />}
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', flex: 1 }}>
          {loading ? <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box> :
            (error || (!displayData && !resolvedName)) ? (
              <Box sx={{ p: 3, textAlign: 'center', maxWidth: 600, mx: 'auto', width: '100%' }}>
                <Typography variant="h6" color="error" gutterBottom>
                  {error || t('No data available.', 'אין נתונים זמינים.')}
                </Typography>
                <Typography variant="body1" sx={{ mb: 4 }} color="text.secondary">
                  {t('Please search for the correct ticker below:', 'אנא חפש את הנייר הנכון למטה:')}
                </Typography>
                <TickerSearch
                  portfolios={portfolios}
                  isPortfoliosLoading={isPortfoliosLoading}
                  trackingLists={trackingLists}
                  onTickerSelect={(profile) => {
                    navigate(`/ticker/${profile.exchange}/${profile.symbol}`, { replace: true });
                  }}
                  prefilledTicker={resolvedTickerInput}
                  prefilledExchange={resolvedExchangeInput && resolvedExchangeInput !== 'ALL' ? resolvedExchangeInput : undefined}
                  sx={{ textAlign: 'left' }}
                />
              </Box>
            ) :
              <>
                {activeTab === 'analysis' && (
                  <TabPanelWithShadows theme={theme}>
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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

                      {historicalData && historicalData.length > 0 && (
                        <Box sx={{ height: { xs: 300, md: 440 }, minWidth: 0 }}>
                          <TickerChart
                            series={[{ name: resolvedName || ticker || 'Main', data: displayHistory }, ...displayComparisonSeries]}
                            currency={displayData?.currency || 'USD'}
                            mode={effectiveChartMetric}
                            valueType="price"
                            height="100%"
                            scaleType={scaleType}
                            onScaleTypeChange={setScaleType}
                            trendType={trendType}
                            onTrendTypeChange={setTrendType}
                            gammaType={gammaType}
                            onGammaTypeChange={setGammaType}
                            gammaWindow={gammaWindow}
                            onGammaWindowChange={setGammaWindow}
                            topControls={
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: comparisonSeries.length > 0 ? 1 : 0, flexWrap: { xs: 'nowrap', md: 'wrap' }, overflowX: { xs: 'auto', md: 'visible' }, pb: { xs: 1, md: 0 }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
                                  {isMobile ? (
                                    <>
                                      <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={(e) => setRangeMenuAnchor(e.currentTarget)}
                                        sx={{ height: 26, minWidth: 40, px: 1, fontSize: '0.75rem', textTransform: 'none', whiteSpace: 'nowrap' }}
                                        endIcon={<DateRangeIcon sx={{ fontSize: '0.9rem !important' }} />}
                                      >
                                        {chartRange === 'Custom' ? '' : chartRange}
                                      </Button>
                                      <Menu
                                        anchorEl={rangeMenuAnchor}
                                        open={Boolean(rangeMenuAnchor)}
                                        onClose={() => setRangeMenuAnchor(null)}
                                      >
                                        {availableRanges.map(r => (
                                          <MenuItem key={r} onClick={() => { setChartRange(r); setRangeMenuAnchor(null); }} selected={chartRange === r} dense>
                                            {r === 'ALL' ? maxLabel : r}
                                          </MenuItem>
                                        ))}
                                        <Divider />
                                        <MenuItem onClick={() => { setCustomRangeOpen(true); setRangeMenuAnchor(null); }} selected={chartRange === 'Custom'} dense>
                                          <ListItemIcon><DateRangeIcon fontSize="small" /></ListItemIcon>
                                          <ListItemText primary={t('Custom', 'מותאם')} />
                                        </MenuItem>
                                      </Menu>
                                    </>
                                  ) : (
                                    <ToggleButtonGroup value={chartRange} exclusive onChange={(_, v) => {
                                      if (v === 'Custom') {
                                        setCustomRangeOpen(true);
                                      } else if (v) {
                                        setChartRange(v);
                                      }
                                    }} size="small" sx={{ height: 26 }}>
                                      {availableRanges.map(r => <ToggleButton key={r} value={r} sx={{ px: 1, fontSize: '0.65rem' }}>{r === 'ALL' ? maxLabel : r}</ToggleButton>)}
                                      <ToggleButton value="Custom" sx={{ px: 1 }}><DateRangeIcon sx={{ fontSize: '1rem' }} /></ToggleButton>
                                    </ToggleButtonGroup>
                                  )}
                                  <ToggleButtonGroup value={effectiveChartMetric} exclusive onChange={(_, v) => v && setChartMetric(v)} size="small" disabled={isComparison} sx={{ height: 26 }}>
                                    <ToggleButton value="percent" sx={{ px: 1, fontSize: '0.65rem' }}>%</ToggleButton>
                                    <ToggleButton value="price" sx={{ px: 1, fontSize: '0.65rem' }}>$</ToggleButton>
                                    <ToggleButton value="candle" sx={{ px: 1, fontSize: '0.65rem' }}><CandlestickChartIcon sx={{ fontSize: '1rem' }} /></ToggleButton>
                                  </ToggleButtonGroup>
                                  {isMobile ? (
                                    <>
                                      <ToggleButtonGroup
                                        value={scaleType}
                                        exclusive
                                        onChange={(_, v) => v && setScaleType(v)}
                                        size="small"
                                        disabled={!isLogSupported}
                                        sx={{ height: 26 }}
                                      >
                                        <ToggleButton value="linear" sx={{ px: 0.5, fontSize: '0.65rem', minWidth: 32 }}>LIN</ToggleButton>
                                        <ToggleButton value="log" sx={{ px: 0.5, fontSize: '0.65rem', minWidth: 32 }}>LOG</ToggleButton>
                                      </ToggleButtonGroup>

                                      <IconButton
                                        size="small"
                                        onClick={(e) => setTrendMenuAnchor(e.currentTarget)}
                                        sx={{
                                          borderRadius: 1,
                                          p: 0.5,
                                          height: 24,
                                          width: 24,
                                          bgcolor: trendType !== 'none' ? 'primary.main' : 'action.selected',
                                          color: trendType !== 'none' ? 'primary.contrastText' : 'text.primary',
                                          '&:hover': {
                                            bgcolor: trendType !== 'none' ? 'primary.dark' : 'action.hover'
                                          }
                                        }}
                                      >
                                        <TrendLineIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
                                      </IconButton>

                                      <IconButton
                                        size="small"
                                        onClick={(e) => setGammaMenuAnchor(e.currentTarget)}
                                        sx={{
                                          borderRadius: 1,
                                          p: 0.5,
                                          height: 24,
                                          width: 24,
                                          bgcolor: gammaType !== 'none' ? 'primary.main' : 'action.selected',
                                          color: gammaType !== 'none' ? 'primary.contrastText' : 'text.primary',
                                          '&:hover': {
                                            bgcolor: gammaType !== 'none' ? 'primary.dark' : 'action.hover'
                                          }
                                        }}
                                      >
                                        <GammaIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
                                      </IconButton>

                                      <IconButton
                                        size="small"
                                        onClick={(e) => setCompareMenuAnchor(e.currentTarget)}
                                        sx={{
                                          borderRadius: 1,
                                          p: 0.5,
                                          height: 24,
                                          width: 24,
                                          bgcolor: 'action.selected',
                                          color: 'primary.main',
                                          '&:hover': { bgcolor: 'action.hover' }
                                        }}
                                      >
                                        <AddIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
                                      </IconButton>

                                      <IconButton
                                        size="small"
                                        onClick={() => setAnalysisOpen(true)}
                                        sx={{
                                          borderRadius: 1,
                                          p: 0.5,
                                          height: 24,
                                          width: 24,
                                          bgcolor: 'action.selected',
                                          color: 'primary.main',
                                          '&:hover': { bgcolor: 'action.hover' }
                                        }}
                                      >
                                        <QueryStatsIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
                                      </IconButton>
                                    </>
                                  ) : (
                                    <>
                                      <ToggleButtonGroup value={scaleType} exclusive onChange={(_, v) => v && setScaleType(v)} size="small" disabled={!isLogSupported} sx={{ height: 26 }}>
                                        <ToggleButton value="linear" sx={{ px: 1, fontSize: '0.65rem' }}>LIN</ToggleButton>
                                        <ToggleButton value="log" sx={{ px: 1, fontSize: '0.65rem' }}>LOG</ToggleButton>
                                      </ToggleButtonGroup>
                                      <ToggleButtonGroup value={trendType !== 'none' ? 'trend' : ''} exclusive size="small" sx={{ height: 26 }}>
                                        <ToggleButton value="trend" onClick={(e) => setTrendMenuAnchor(e.currentTarget)} sx={{ px: 1 }}>
                                          <ListItemIcon sx={{ minWidth: 'auto' }}>
                                            <TrendLineIcon sx={{ fontSize: '1rem' }} />
                                          </ListItemIcon>
                                        </ToggleButton>
                                      </ToggleButtonGroup>
                                      <ToggleButtonGroup value={gammaType !== 'none' ? 'gamma' : ''} exclusive size="small" sx={{ height: 26 }}>
                                        <ToggleButton value="gamma" onClick={(e) => setGammaMenuAnchor(e.currentTarget)} sx={{ px: 1 }}>
                                          <ListItemIcon sx={{ minWidth: 'auto' }}>
                                            <GammaIcon sx={{ fontSize: '1rem' }} />
                                          </ListItemIcon>
                                        </ToggleButton>
                                      </ToggleButtonGroup>

                                      <Button size="small" sx={{ height: 26, fontSize: '0.65rem', minWidth: 0 }} onClick={(e) => setCompareMenuAnchor(e.currentTarget)}>{t('Compare', 'השווה')}</Button>
                                      <Button size="small" sx={{ height: 26, fontSize: '0.65rem', minWidth: 0 }} onClick={() => setAnalysisOpen(true)}>{t('Analysis', 'ניתוח')}</Button>
                                    </>
                                  )}
                                </Box>
                                {comparisonSeries.length > 0 && <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>{comparisonSeries.map(s => <Chip key={s.name} label={s.name} onDelete={() => handleRemoveComparison(s.name)} variant="outlined" size="small" sx={{ color: s.color, borderColor: s.color, fontSize: '0.65rem', height: 20 }} />)}</Box>}
                              </Box>
                            }
                          />
                          <Menu anchorEl={settingsMenuAnchor} open={Boolean(settingsMenuAnchor)} onClose={() => setSettingsMenuAnchor(null)}>
                            <MenuItem onClick={() => { setScaleType(scaleType === 'linear' ? 'log' : 'linear'); setSettingsMenuAnchor(null); }} disabled={!isLogSupported}>
                              <ListItemIcon><PieChartIcon fontSize="small" /></ListItemIcon>
                              <ListItemText primary={t('Logarithmic Scale', 'סקאלה לוגריתמית')} secondary={scaleType === 'log' ? t('ON', 'פעיל') : t('OFF', 'כבוי')} />
                              {/* <Typography variant="caption" color="text.secondary">{scaleType === 'log' ? 'ON' : 'OFF'}</Typography> */}
                            </MenuItem>
                            <MenuItem onClick={(e) => { setTrendMenuAnchor(e.currentTarget); setSettingsMenuAnchor(null); }}>
                              <ListItemIcon><TrendLineIcon fontSize="small" /></ListItemIcon>
                              <ListItemText primary={t('Trend Lines', 'קווי מגמה')} />
                            </MenuItem>
                            <MenuItem onClick={(e) => { setCompareMenuAnchor(e.currentTarget); setSettingsMenuAnchor(null); }}>
                              <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
                              <ListItemText primary={t('Compare', 'השווה')} />
                            </MenuItem>
                            <MenuItem onClick={() => { setAnalysisOpen(true); setSettingsMenuAnchor(null); }}>
                              <ListItemIcon><QueryStatsIcon fontSize="small" /></ListItemIcon>
                              <ListItemText primary={t('Analysis', 'ניתוח')} />
                            </MenuItem>
                          </Menu>
                          <Menu anchorEl={trendMenuAnchor} open={Boolean(trendMenuAnchor)} onClose={() => setTrendMenuAnchor(null)}>
                            <MenuItem onClick={() => { setTrendType('none'); setTrendMenuAnchor(null); }} selected={trendType === 'none'}>{t('No Trend', 'ללא מגמה')}</MenuItem>
                            <MenuItem onClick={() => { setTrendType('linear'); setTrendMenuAnchor(null); }} selected={trendType === 'linear'}>{t('Linear', 'ליניארי')}</MenuItem>
                            <MenuItem onClick={() => { setTrendType('exponential'); setTrendMenuAnchor(null); }} selected={trendType === 'exponential'}>{t('Exponential', 'אקספוננציאלי')}</MenuItem>
                            <MenuItem onClick={() => { setTrendType('polynomial'); setTrendMenuAnchor(null); }} selected={trendType === 'polynomial'}>{t('Cubic', 'פולינום (3)')}</MenuItem>

                            <MenuItem onClick={() => { setTrendType('logarithmic'); setTrendMenuAnchor(null); }} selected={trendType === 'logarithmic'}>{t('Logarithmic', 'לוגריתמי')}</MenuItem>
                          </Menu>
                          <Menu anchorEl={gammaMenuAnchor} open={Boolean(gammaMenuAnchor)} onClose={() => setGammaMenuAnchor(null)}>
                            <MenuItem onClick={() => { setGammaType('none'); setGammaMenuAnchor(null); }} selected={gammaType === 'none'}>{t('No Gamma', 'ללא גמא')}</MenuItem>
                            <MenuItem onClick={() => { setGammaType('gamma'); setGammaMenuAnchor(null); }} selected={gammaType === 'gamma'}>{t('Gamma', 'גמא')}</MenuItem>
                            <MenuItem onClick={() => { setGammaType('gamma-log'); setGammaMenuAnchor(null); }} selected={gammaType === 'gamma-log'}>{t('Gamma (Log)', 'גמא (לוג)')}</MenuItem>
                            <Divider />
                            <Box sx={{ px: 2, py: 0.5, typography: 'caption', color: 'text.secondary', fontWeight: 'bold' }}>{t('Calc Window', 'חלון חישוב')}</Box>
                            <MenuItem onClick={() => { setGammaWindow(undefined); setGammaMenuAnchor(null); }} selected={gammaWindow === undefined} dense sx={{ height: 24, minHeight: 24 }}>{t('Auto', 'אוטומטי')}</MenuItem>
                            <MenuItem onClick={() => { setGammaWindow(5); setGammaMenuAnchor(null); }} selected={gammaWindow === 5} dense sx={{ height: 24, minHeight: 24 }}>5 {t('Days', 'ימים')}</MenuItem>
                            <MenuItem onClick={() => { setGammaWindow(10); setGammaMenuAnchor(null); }} selected={gammaWindow === 10} dense sx={{ height: 24, minHeight: 24 }}>10 {t('Days', 'ימים')}</MenuItem>
                            <MenuItem onClick={() => { setGammaWindow(20); setGammaMenuAnchor(null); }} selected={gammaWindow === 20} dense sx={{ height: 24, minHeight: 24 }}>20 {t('Days', 'ימים')}</MenuItem>
                            <MenuItem onClick={() => { setGammaWindow(50); setGammaMenuAnchor(null); }} selected={gammaWindow === 50} dense sx={{ height: 24, minHeight: 24 }}>50 {t('Days', 'ימים')}</MenuItem>
                          </Menu>
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
                                    {opt.ticker === SEARCH_OPTION_TICKER && <ListItemIcon sx={{ minWidth: 32 }}><QueryStatsIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /></ListItemIcon>}
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
                          {null}
                        </Box>
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
                  </TabPanelWithShadows>
                )}




                {activeTab === 'assets' && displayData?.meta?.underlyingAssets && (
                  <TabPanelWithShadows theme={theme}>
                    <HoldingDetails
                      sheetId={sheetId}
                      holding={{ ...displayData, underlyingAssets: displayData.meta.underlyingAssets } as any}
                      holdings={[]}
                      displayCurrency={normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')}
                      portfolios={portfolios}
                      onPortfolioClick={handlePortfolioClick}
                      section="assets" // specific section for just assets
                    />
                  </TabPanelWithShadows>
                )}

                {activeTab === 'financials' && ((displayData as any)?.incomeStatementHistory || (displayData as any)?.incomeStatementHistoryQuarterly || (displayData as any)?.calendarEvents) && (
                  <TabPanelWithShadows theme={theme}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(displayData as any)?.calendarEvents && <CalendarEventsView events={(displayData as any).calendarEvents} t={t} />}
                      {((displayData as any)?.incomeStatementHistory || (displayData as any)?.incomeStatementHistoryQuarterly) && (
                        <IncomeStatementView
                          history={(displayData as any).incomeStatementHistory}
                          historyQuarterly={(displayData as any).incomeStatementHistoryQuarterly}
                          currency={displayData?.currency}
                          t={t}
                        />
                      )}
                    </Box>
                  </TabPanelWithShadows>
                )}

                {(activeTab === 'holdings' || activeTab === 'transactions' || activeTab === 'dividends' || activeTab === 'grants') && hasHolding && (
                  <TabPanelWithShadows theme={theme}>
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
                            section={activeTab as any}
                          />
                        );
                      })()
                    ) : (
                      <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
                    )}
                  </TabPanelWithShadows>
                )}
              </>}
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3, gap: 1 }}>
          <Tooltip title={t("Refresh Data", "רענן נתונים")} enterTouchDelay={0} leaveTouchDelay={3000}>
            <IconButton onClick={handleRefresh} disabled={refreshing} size="small">{refreshing ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}</IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={handleOpenChat} color="primary" variant="outlined" sx={{ textTransform: 'none', borderRadius: 2 }} startIcon={<SmartToyIcon fontSize="small" />}>
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{t('AI Assistant', 'עוזר AI')}</Box>
          </Button>
          <Button variant="contained" onClick={handleAddTransaction} startIcon={<AddIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{t('Add Transaction', 'הוסף עסקה')}</Button>
          <Button onClick={handleClose} color="inherit" sx={{ textTransform: 'none' }}>{t('Close', 'סגור')}</Button>
        </DialogActions>
      </Dialog>
      <TickerAiChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        apiKey={apiKey}
        tickerData={(displayData && 'exchange' in displayData) ? (displayData as any) : undefined}
        historicalData={historicalData ?? undefined}
        holdings={engineHoldings}
        displayCurrency={normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD')}
        exchangeRates={exchangeRates}
        subjectName={ticker}
      />
      <Dialog open={isSearchOpen} onClose={() => setIsSearchOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('Search to Compare', 'חפש להשוואה')}</DialogTitle>
        <DialogContent>
          <TickerSearch portfolios={portfolios} isPortfoliosLoading={isPortfoliosLoading} trackingLists={trackingLists} onTickerSelect={handleTickerSearchSelect} sx={{ mt: 1 }} />
        </DialogContent>
      </Dialog>
      <AnalysisDialog
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        mainSeries={historicalData && historicalData.length > 0 ? { name: resolvedName || ticker || 'Main', data: historicalData as any } : null}
        comparisonSeries={comparisonSeries}
        title={`${t('Overview', 'סקירה')}: ${tTry(resolvedName || ticker || '', resolvedNameHe)}`}
        initialRange={chartRange}
        currency={data?.currency || 'USD'}
        subjectName={ticker}
      />
      <CustomRangeDialog
        open={customRangeOpen}
        onClose={() => setCustomRangeOpen(false)}
        initialStart={customDateRange.start}
        initialEnd={customDateRange.end}
        onSave={(start, end) => {
          setCustomDateRange({ start, end });
          setChartRange('Custom');
        }}
      />
    </>
  );

}

// Helper component to avoid hook rules violation inside conditional rendering
const TabPanelWithShadows = ({ children, theme }: { children: React.ReactNode, theme: any }) => {
  const { containerRef, showTop, showBottom } = useScrollShadows();
  return (
    <Box sx={{ mt: 0, flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box ref={containerRef} sx={{ flex: 1, overflow: 'auto' }}>
        {children}
      </Box>
      <ScrollShadows top={showTop} bottom={showBottom} theme={theme} />
    </Box>
  );
};

const EventCard = ({ title, value, subValue, icon }: { title: string, value: React.ReactNode, subValue?: React.ReactNode, icon?: React.ReactNode }) => (
  <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 200, display: 'flex', gap: 1.5, borderRadius: 2, alignItems: 'center', bgcolor: 'background.paper', overflow: 'hidden' }}>
    {icon && (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}>
        {icon}
      </Box>
    )}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle2" color="text.secondary" noWrap sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>{title}</Typography>
      {typeof value === 'string' ? <Typography variant="body2" fontWeight="600" noWrap>{value}</Typography> : value}
      {subValue && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.65rem' }}>{subValue}</Typography>}
    </Box>
  </Paper>
);

const getDaysDiff = (dateStr: string | number | Date) => {
  const diffTime = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

const formatDateWithRelative = (dateStr: string | number | Date, t: any) => {
  const d = new Date(dateStr);
  const dStr = d.toLocaleDateString('en-GB'); // dd/mm/yyyy
  const days = getDaysDiff(d);

  if (days === 0) return `${dStr} (${t('Today', 'היום')})`;
  if (days > 0) return `${dStr} (${t('in {days} days', 'בעוד {days} ימים').replace('{days}', String(days))})`;
  return `${dStr} (${t('{days} days ago', 'לפני {days} ימים').replace('{days}', String(Math.abs(days)))})`;
};

const CalendarEventsView = ({ events, t }: { events: any, t: any }) => {
  const earningsCallDays = events.earningsCallDate ? getDaysDiff(events.earningsCallDate) : undefined;
  const showEarningsCall = earningsCallDays !== undefined && earningsCallDays >= -30;

  return (
    <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
      {events.earningsDate && (
        <EventCard
          title={t('Earnings Date', 'תאריך דיווח נתונים')}
          value={formatDateWithRelative(events.earningsDate, t)}
          subValue={events.isEarningsDateEstimate ? t('Estimate', 'הערכה') : undefined}
          icon={<EventIcon fontSize="small" />}
        />
      )}
      {showEarningsCall && events.earningsCallDate && (
        <EventCard
          title={earningsCallDays! < 0 ? t('Last Earning Call', 'שיחת נתונים אחרונה') : t('Earnings Call', 'שיחת נתונים')}
          value={formatDateWithRelative(events.earningsCallDate, t)}
          icon={<RecordVoiceOverIcon fontSize="small" />}
        />
      )}
      {events.earningsAnalystEstimate?.avg != null && (
        <EventCard
          title={t('EPS Estimate', 'הערכת רווח למניה')}
          value={`${events.earningsAnalystEstimate.avg}`}
          subValue={`${t('Low', 'נמוך')}: ${events.earningsAnalystEstimate.low} | ${t('High', 'גבוה')}: ${events.earningsAnalystEstimate.high}`}
          icon={<TrendingUpIcon fontSize="small" />}
        />
      )}
      {events.revenueEstimate?.avg != null && (
        <EventCard
          title={t('Revenue Estimate', 'הערכת הכנסות')}
          value={formatMoneyCompactValue({ amount: events.revenueEstimate.avg, currency: events.revenueEstimate.currency || 'USD' })}
          subValue={`${t('Low', 'נמוך')}: ${formatMoneyCompactValue({ amount: events.revenueEstimate.low, currency: events.revenueEstimate.currency || 'USD' })} | ${t('High', 'גבוה')}: ${formatMoneyCompactValue({ amount: events.revenueEstimate.high, currency: events.revenueEstimate.currency || 'USD' })}`}
          icon={<MonetizationOnIcon fontSize="small" />}
        />
      )}
      {(events.dividendDate || events.exDividendDate) && (
        <EventCard
          title={t('Dividends', 'דיבידנדים')}
          value={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {events.dividendDate && <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{t('Pay', 'תשלום')}: <strong>{formatDateWithRelative(events.dividendDate, t)}</strong></Typography>}
              {events.exDividendDate && <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{t('Ex', 'אקס')}: <strong>{formatDateWithRelative(events.exDividendDate, t)}</strong></Typography>}
            </Box>
          }
          icon={<PaidIcon fontSize="small" />}
        />
      )}
    </Box>
  );
};

const IncomeStatementView = ({ history, historyQuarterly, currency, t }: { history?: any[], historyQuarterly?: any[], currency?: string, t: any }) => {
  const theme = useTheme();
  const [period, setPeriod] = useState<'Quarterly' | 'Annual'>('Quarterly');

  const activeHistory = period === 'Quarterly' && historyQuarterly?.length ? historyQuarterly : history;
  if (!activeHistory || activeHistory.length === 0) return null;

  // Format data for chart (reverse to chronological order for chart)
  const chartData = [...activeHistory].reverse().map(item => {
    const d = new Date(item.endDate);
    return {
      periodName: period === 'Quarterly' ? `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}` : d.getFullYear().toString(),
      Revenue: item.totalRevenue,
      GrossProfit: item.grossProfit,
      NetIncome: item.netIncome,
      OperatingIncome: item.operatingIncome
    };
  });

  const formatValue = (val: number | undefined) => val !== undefined && val !== null ? formatMoneyValue({ amount: val, currency: normalizeCurrency(currency || 'USD') }) : '-';
  const formatCompactVal = (val: number | undefined) => val !== undefined && val !== null ? formatCompactValue(val, normalizeCurrency(currency || 'USD')) : '-';

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ height: 280, minWidth: 0, mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">{t('Revenue & Income', 'הכנסות ורווחים')}</Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={(_, v) => v && setPeriod(v)}
            size="small"
            sx={{ height: 26 }}
          >
            <ToggleButton value="Quarterly" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Quarterly', 'רבעוני')}</ToggleButton>
            <ToggleButton value="Annual" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Annual', 'שנתי')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="periodName" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(val) => formatCompactVal(val)} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
            <RechartsTooltip formatter={formatValue as any} cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, color: theme.palette.text.primary }} />
            <Legend wrapperStyle={{ paddingTop: 20 }} />
            <Bar dataKey="Revenue" fill={theme.palette.text.disabled} fillOpacity={0.4} name={t('Revenue', 'הכנסות')} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="Revenue" position="top" formatter={formatCompactVal as any} fill={theme.palette.text.secondary} fontSize={10} />
            </Bar>
            <Bar dataKey="NetIncome" fill={theme.palette.primary.main} fillOpacity={0.6} name={t('Net Income', 'רווח נקי')} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="NetIncome" position="top" formatter={formatCompactVal as any} fill={theme.palette.text.secondary} fontSize={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><b>{t('Period Ends', 'סוף תקופה')}</b></TableCell>
              <TableCell align="right"><b>{t('Revenue', 'הכנסות')}</b></TableCell>
              <TableCell align="right"><b>{t('Gross Profit', 'רווח גולמי')}</b></TableCell>
              <TableCell align="right"><b>{t('Operating Income', 'רווח תפעולי')}</b></TableCell>
              <TableCell align="right"><b>{t('Net Income', 'רווח נקי')}</b></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activeHistory.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{new Date(row.endDate).toLocaleDateString()}</TableCell>
                <TableCell align="right">{formatValue(row.totalRevenue)}</TableCell>
                <TableCell align="right">{formatValue(row.grossProfit)}</TableCell>
                <TableCell align="right">{formatValue(row.operatingIncome)}</TableCell>
                <TableCell align="right">{formatValue(row.netIncome)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};