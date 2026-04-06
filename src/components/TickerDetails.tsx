import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Chip, CircularProgress, Tooltip, IconButton, ToggleButtonGroup, ToggleButton, Menu, MenuItem, ListItemIcon, ListItemText, Tabs, Tab, useTheme, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Accordion, AccordionSummary, AccordionDetails, Grid } from '@mui/material';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import AssignmentIcon from '@mui/icons-material/Event';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PaidIcon from '@mui/icons-material/Paid';
import AssessmentIconOutlined from '@mui/icons-material/AssessmentOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TickerChart, type TrendType, type GammaType, TrendLineIcon, GammaIcon } from './TickerChart';
import type { TickerProfile } from '../lib/types/ticker';
import { useChartComparison, getAvailableRanges, getMaxLabel, SEARCH_OPTION_TICKER } from '../lib/hooks/useChartComparison';
import { useTickerDetails, type TickerDetailsProps } from '../lib/hooks/useTickerDetails';
import { TickerSearch } from './TickerSearch';
import { Currency, Exchange, isUSExchange, type ExchangeRates } from '../lib/types';
import { formatMoneyPrice, formatPercent, normalizeCurrency, formatMoneyValue, formatMoneyCompactValue, formatCompactValue, formatCompactPrice } from '../lib/currency';
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
import type { AdvancedStats } from '../lib/fetching';


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
  const resolvedExchangeInput = propExchange || paramExchange;

  const { t, tTry } = useLanguage();
  const location = useLocation();
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

      let relevantHoldings: Holding[] = allHoldings;
      let relevantTransactions = allTransactions;

      if (portfolioId) {
        relevantHoldings = allHoldings.filter(h => h.portfolioId === portfolioId);
        relevantTransactions = allTransactions.filter(t => t.portfolioId === portfolioId);
      }

      const { getExchangeRates } = await import('../lib/currency');
      const { calculatePortfolioPerformance } = await import('../lib/performance');

      const rates = await getExchangeRates(sheetId);
      const displayCurrency = normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD');

      const { points } = await calculatePortfolioPerformance(relevantHoldings as any, relevantTransactions, displayCurrency, rates);

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
  const initialHash = (location.hash || '').replace('#', '');
  const isInitialAi = initialHash === 'ai';
  const initialTab = (initialHash && initialHash !== 'ai') ? initialHash : 'analysis';

  const [activeTab, setActiveTabRaw] = useState(initialTab);
  const handleTabChange = (_: any, v: string) => {
    setActiveTabRaw(v);
    navigate({ hash: v }, { replace: true });
  };

  const [chatOpen, setChatOpen] = useState(isInitialAi);
  const [apiKey, setApiKey] = useState('');

  const handleOpenChat = async () => {
    try {
      const key = await checkGeminiKey(sheetId);
      if (key) {
        setApiKey(key);
        setChatOpen(true);
        navigate({ hash: 'ai' }, { replace: true });
      } else {
        toast.error(t('Please set your Gemini API Key in the Dashboard first.', 'אנא הגדר מפתח API של Gemini במסך הראשי תחילה.'));
      }
    } catch (e) {
      console.error(e);
      toast.error(t('Please set your Gemini API Key in the Dashboard first.', 'אנא הגדר מפתח API של Gemini במסך הראשי תחילה.'));
    }
  };

  useEffect(() => {
    if ((location.state as { openAiChatId?: string })?.openAiChatId && !chatOpen) {
      handleOpenChat();
    }
    // Also support hash change from external navigation if we mount with #ai or others
    if (isInitialAi && !chatOpen && !apiKey) {
      handleOpenChat();
    }
  }, [location.state, location.hash, chatOpen]);

  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });

  const [engineHoldings, setEngineHoldings] = useState<Holding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);

  // Resolve the "Active Holding" - from navigation state (enriched) or hook
  const enrichedHolding = useMemo(() => {
    const stateHolding = (location.state as { holding?: EnrichedDashboardHolding })?.holding;
    if (stateHolding && stateHolding.ticker === ticker) return stateHolding;
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

          if (!isExchangeMatch && targetExchange && isUSExchange(engineExchange) && isUSExchange(targetExchange)) {
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

  ///// XXXXXX
  const totalQty = useMemo(() => {
    if (engineHoldings && engineHoldings.length > 0) {
      return engineHoldings.reduce((acc: number, h: any) => acc + (h.qtyTotal ?? h.qty ?? 0), 0);
    }
    if (portfolios && portfolios.length > 0 && hasHolding) {
      return portfolios.reduce((acc, p) => acc + (p.holdings?.filter(h =>
        h.ticker.toUpperCase() === ticker?.toUpperCase() &&
        (!exchange || h.exchange.toUpperCase() === exchange.toUpperCase() || (isUSExchange(h.exchange) && isUSExchange(exchange as any)))
      ).reduce((sub, h: any) => sub + (h.qtyTotal ?? h.qty ?? 0), 0) || 0), 0);
    }
    if (enrichedHolding) {
      return enrichedHolding.qtyTotal || (enrichedHolding as any).qty || 0;
    }
    if (holdingData) {
      return (holdingData as any).qtyTotal || (holdingData as any).qty || 0;
    }
    return 0;
  }, [engineHoldings, portfolios, ticker, exchange, hasHolding, enrichedHolding, holdingData]);

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
    const map: Record<string, string> = { '1D': t('1D', 'יומי'), '7D': t('1W', 'שבוע'), '1W': t('1W', 'שבוע'), '1M': t('1M', 'חודש'), '3M': t('3M', '3 חודשים'), 'YTD': t('YTD', 'מתחילת שנה'), '1Y': t('1Y', 'שנה'), '3Y': t('3Y', '3 שנים'), '5Y': t('5Y', '5 שנים'), '10Y': t('10Y', '10 שנים'), 'Max': t('Max', 'מקסימום') };
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
    '10Y': getPerf(data?.changePct10y ?? holdingData?.changePct10y, data?.changeDate10y ?? holdingData?.changeDate10y),
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
      '10Y': new Date(now.getFullYear() - 10, now.getMonth(), now.getDate()),
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
                      <Tooltip title={`${data?.isStaleDayChange ? t('Last Trading Day', 'מסחר אחרון') : t('Day change', 'שינוי יומי')} (${lastUpdated})`} placement="top" enterTouchDelay={0} leaveTouchDelay={3000}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: dayChange >= 0 ? 'success.main' : 'error.main' }}>{formatPercent(dayChange)}</Typography>
                      </Tooltip>
                    </Box>
                    {(() => {
                      const priceInfo = ((displayData as any)?.advStats || data?.advancedStats)?.priceInfo;
                      if (!priceInfo) return null;

                      const preTime = priceInfo.preMarketTime || 0;
                      const postTime = priceInfo.postMarketTime || 0;

                      // Show if we have any extended hours data
                      if (!priceInfo.preMarketPrice && !priceInfo.postMarketPrice) return null;

                      const isPre = (preTime >= postTime) && priceInfo.preMarketPrice;
                      const hasPost = !isPre && priceInfo.postMarketPrice;

                      if (!isPre && !hasPost) return null;

                      const pPrice = isPre ? priceInfo.preMarketPrice : priceInfo.postMarketPrice;
                      const pChange = isPre ? priceInfo.preMarketChangePercent : priceInfo.postMarketChangePercent;
                      const label = isPre ? t('Pre-Market:', 'טרום-מסחר:') : t('Post-Market:', 'אחרי-מסחר:');

                      if (!pPrice) return null;

                      const regTime = priceInfo.regularMarketTime || 0;
                      const latestExtTime = Math.max(preTime, postTime);
                      if (regTime > latestExtTime && priceInfo.marketState === 'REGULAR') return null;

                      return (
                        <Box display="flex" alignItems="baseline" justifyContent={isMobile ? 'flex-start' : 'flex-end'} gap={1}>
                          <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {label}
                          </Typography>
                          <Typography variant="caption" fontWeight={600}>
                            {formatMoneyPrice({ amount: pPrice, currency: normalizeCurrency(isTase ? 'ILA' : (displayData?.currency || 'USD')) }, t)}
                          </Typography>
                          {pChange !== undefined && (
                            <Typography variant="caption" sx={{ fontWeight: 600, color: pChange >= 0 ? 'success.main' : 'error.main' }}>
                              {formatPercent(pChange)}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
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
          <Tabs
            value={
              (activeTab === 'analysis') ||
                (activeTab === 'financials' && (!!(displayData as any)?.calendarEvents || !!(displayData as any)?.incomeStatementHistory || !!(displayData as any)?.incomeStatementHistoryQuarterly || !!(displayData as any)?.advancedStats)) ||
                (activeTab === 'holdings' && hasHolding) ||
                (activeTab === 'transactions' && hasHolding) ||
                (activeTab === 'grants' && hasGrants) ||
                (activeTab === 'dividends' && hasHolding) ||
                (activeTab === 'assets' && !!(displayData as any)?.meta?.underlyingAssets) ||
                (activeTab === 'ai')
                ? activeTab
                : false
            }
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            <Tab label={t('Analysis', 'ניתוח')} value="analysis" />
            {(!!(displayData as any)?.calendarEvents || !!(displayData as any)?.incomeStatementHistory || !!(displayData as any)?.incomeStatementHistoryQuarterly || !!(displayData as any)?.advancedStats) && <Tab label={t('Financials', 'פיננסי')} value="financials" />}
            {hasHolding && <Tab label={t('Holdings', 'החזקות')} value="holdings" />}
            {hasHolding && <Tab label={t('Transactions', 'עסקאות')} value="transactions" />}
            {hasGrants && <Tab label={t('Grants', 'מענקים')} value="grants" />}
            {hasHolding && <Tab label={t('Dividends', 'דיבידנדים')} value="dividends" />}
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
                              case '10Y': return 365 * 10;
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
                                  label={<><Typography variant="caption" color="text.secondary">{range === '1D' && data?.isStaleDayChange ? t('Last Trading Day', 'מסחר אחרון') : translateRange(range)}</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(item.val)}</Typography></>}
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
                                    minWidth: 90,
                                    py: 0.5,
                                    px: 0.75,
                                    height: 'auto',
                                    '& .MuiChip-label': { display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' },
                                    '& .MuiTypography-caption, & .MuiTypography-body2': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }
                                  }}
                                  label={
                                    <>
                                      <Typography variant="caption" color="text.secondary">{translateRange(range)}</Typography>
                                      <Typography variant="body2" sx={{ fontWeight: 600, color: textColor }}>{formatPercent(value)}</Typography>
                                      <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8 }}>{formatMoneyValue({ amount: info.amount, currency: normalizeCurrency(displayData?.currency || 'USD') as Currency })}</Typography>
                                      {totalQty > 0 && (
                                        <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'bold' }}>
                                          {t('Total:', 'סה״כ:')} {formatMoneyValue({ amount: info.amount * totalQty, currency: normalizeCurrency(displayData?.currency || 'USD') as Currency })}
                                        </Typography>
                                      )}
                                    </>
                                  }
                                />
                              );
                            })}
                          </Box>
                        </>
                      )}

                      {/* Advanced Stats Section */}
                      {/* Advanced Stats Section */}
                      {(() => {
                        const advStats: AdvancedStats | undefined = (displayData as any)?.advancedStats;
                        if (!advStats) return null;

                        const formatters = {
                          pct: (v: number | undefined) => v !== undefined ? formatPercent(v) : undefined,
                          num: (v: number | undefined) => v !== undefined ? v.toFixed(2) : undefined,
                          currency: (v: number | undefined, cur: Currency) => v !== undefined ? formatMoneyPrice({ amount: v, currency: cur }, t) : undefined,
                          compact: (v: number | undefined) => v !== undefined ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v) : undefined,
                          compactCurr: (v: number | undefined, cur: Currency) => v !== undefined ? formatCompactPrice(v, cur, t) : undefined,
                        };

                        const shortFloatRatio = advStats.sharesShort && advStats.floatShares ? (advStats.sharesShort / advStats.floatShares) : advStats.shortPercentOfFloat;

                        const groups = [
                          {
                            title: t('Valuation', 'הערכת שווי'),
                            items: [
                              { label: t('Forward P/E', 'מכפיל רווח עתידי'), value: formatters.num(advStats.forwardPE), tooltip: t('Estimated future price-to-earnings ratio.', 'הערכת מכפיל הרווח מבוסס על צפי הרווחים העתידי.') },
                              { label: t('PEG Ratio', 'יחס PEG'), value: formatters.num(advStats.pegRatio), tooltip: t('Price/Earnings to Growth ratio.', 'יחס מכפיל רווח לצמיחת החברה.') },
                              { label: t('Price to Book', 'מכפיל הון'), value: formatters.num(advStats.priceToBook), tooltip: t('Compares market value to book value.', 'היחס בין שווי השוק להון העצמי.') },
                              { label: t('Target High', 'יעד גבוה'), value: formatters.currency(advStats.targetHighPrice, (displayData?.currency || advStats.financialCurrency) as Currency), tooltip: t('Highest current price target from analysts.', 'מחיר היעד הגבוה ביותר לפי ממוצע אנליסטים.') },
                              { label: t('Target Mean', 'יעד ממוצע'), value: formatters.currency(advStats.targetMeanPrice, (displayData?.currency || advStats.financialCurrency) as Currency), tooltip: t('Average current price target.', 'מחיר היעד הממוצע.') },
                              { label: t('Target Median', 'יעד חציון'), value: formatters.currency(advStats.targetMedianPrice, (displayData?.currency || advStats.financialCurrency) as Currency), tooltip: t('Median current price target.', 'מחיר היעד החציוני.') },
                              { label: t('Target Low', 'יעד נמוך'), value: formatters.currency(advStats.targetLowPrice, (displayData?.currency || advStats.financialCurrency) as Currency), tooltip: t('Lowest current price target.', 'מחיר היעד הנמוך ביותר.') },
                            ]
                          },
                          {
                            title: t('Profitability', 'רווחיות'),
                            items: [
                              { label: t('Profit Margin', 'שולי רווח'), value: formatters.pct(advStats.profitMargins), tooltip: t('The percentage of revenue that remains as profit.', 'שיעור הרווח הנקי מתוך ההכנסות.') },
                              { label: t('Operating Margin', 'שולי תפעולי'), value: formatters.pct(advStats.operatingMargins), tooltip: t('Profits before interest and taxes relative to revenue.', 'רווח לפני ריבית ומסים ביחס להכנסות.') },
                              { label: t('Gross Margin', 'שולי גולמי'), value: formatters.pct(advStats.grossMargins), tooltip: t('Revenue left after COGS.', 'אחוז ההכנסה שנשאר לאחר עלות מכירות.') },
                              { label: t('ROE', 'תשואה להון'), value: formatters.pct(advStats.returnOnEquity), tooltip: t('Net income relative to shareholder equity.', 'המשקף את רווחיות החברה ביחס להון העצמי.') },
                              { label: t('ROA', 'תשואה לנכסים'), value: formatters.pct(advStats.returnOnAssets), tooltip: t('Net income relative to total assets.', 'הפעלת הנכסים ליצירת רווחים.') },
                            ]
                          },
                          {
                            title: t('Cash & Debt', 'מזומן וחוב'),
                            items: [
                              { label: t('Total Cash', 'סך המזומנים'), value: formatters.compactCurr(advStats.totalCash, advStats.financialCurrency as Currency), tooltip: t('Total cash on hand.', 'כמות המזומנים של החברה.') },
                              { label: t('Cash / Share', 'מזומן למניה'), value: formatters.currency(advStats.totalCashPerShare, advStats.financialCurrency as Currency), tooltip: t('Total cash per outstanding share.', 'סך המזומנים מחולק במספר המניות.') },
                              { label: t('Total Debt', 'סך החוב'), value: formatters.compactCurr(advStats.totalDebt, advStats.financialCurrency as Currency), tooltip: t('Total outstanding debt.', 'סך החובות מכל הסוגים.') },
                              { label: t('Debt / Equity', 'חוב להון'), value: formatters.pct(advStats.debtToEquity ? advStats.debtToEquity / 100 : undefined), tooltip: t('Total debt divided by shareholder equity.', 'היחס בין סך החוב להון העצמי.') },
                              { label: t('Free Cash Flow', 'תזרים חופשי'), value: formatters.compactCurr(advStats.freeCashflow, advStats.financialCurrency as Currency), tooltip: t('Cash left after paying operating expenses and capital expenditures.', 'המזומן הפנוי לאחר הוצאות הון.') },
                              { label: t('Operating Flow', 'תזרים תפעולי'), value: formatters.compactCurr(advStats.operatingCashflow, advStats.financialCurrency as Currency), tooltip: t('Cash generated by core business operations.', 'תזרים מפעילות הליבה.') },
                              { label: t('Current Ratio', 'יחס שוטף'), value: formatters.num(advStats.currentRatio), tooltip: t('Current assets divided by current liabilities.', 'יחס בין נכסים שוטפים להתחייבויות שוטפות.') },
                            ]
                          },
                          {
                            title: t('Growth & Income', 'צמיחה והכנסות'),
                            items: [
                              { label: t('Total Revenue', 'סך הכנסות'), value: formatters.compactCurr(advStats.totalRevenue, advStats.financialCurrency as Currency), tooltip: t('Total sales in the period.', 'סך כל המכירות.') },
                              { label: t('Revenue Q Grw.', 'צמיחת הכנסות Q'), value: formatters.pct(advStats.revenueQuarterlyGrowth ?? advStats.revenueGrowth), tooltip: t('Quarter-over-quarter revenue growth rate.', 'שיעור הצמיחה בהכנסות.') },
                              { label: t('Earnings Q Grw.', 'צמיחת רווחים Q'), value: formatters.pct(advStats.earningsQuarterlyGrowth ?? advStats.earningsGrowth), tooltip: t('Quarter-over-quarter earnings growth rate.', 'שיעור הצמיחה ברווחים.') },
                              { label: t('Trailing EPS', 'רווח עוקב למניה'), value: formatters.currency(advStats.trailingEps, advStats.financialCurrency as Currency), tooltip: t('Company\'s actual profit per outstanding share.', 'הרווח הנקי שיוחס לכל מניה השנה.') },
                              { label: t('Forward EPS', 'רווח למניה עתידי'), value: formatters.currency(advStats.forwardEps, advStats.financialCurrency as Currency), tooltip: t('Estimated earnings per share for the upcoming 12 months.', 'הרווח החזוי למניה לשנה הבאה.') },
                            ]
                          },
                          {
                            title: t('Market & Shares', 'שוק ומניות'),
                            items: [
                              { label: t('Beta', 'בטא'), value: formatters.num(advStats.beta), tooltip: t('Volatility compared to the overall market.', 'תנודתיות ביחס לשוק כולו.') },
                              { label: t('52W Change', 'שינוי שנתי'), value: formatters.pct(advStats.fiftyTwoWeekChange), tooltip: t('The stock\'s raw price performance over the last year.', 'תשואה מתחילת השנה.') },
                              { label: t('Shares Out.', 'מניות רשומות'), value: formatters.compact(advStats.sharesOutstanding), tooltip: t('Total number of shares outstanding.', 'סך המניות הרשומות.') },
                              { label: t('Float Shares', 'מניות סחירות'), value: formatters.compact(advStats.floatShares), tooltip: t('Number of shares manually floating publicly.', 'מספר המניות הזמינות ציבורית.') },
                              { label: t('Insiders Held', 'בעלי עניין'), value: formatters.pct(advStats.heldPercentInsiders), tooltip: t('Percentage of shares held by company insiders.', 'אחוז המניות שבידי נושאי משרה או מייסדים.') },
                              { label: t('Institutions', 'מוסדיים'), value: formatters.pct(advStats.heldPercentInstitutions), tooltip: t('Percentage held by large funds.', 'אחוז המניות שמשקיעים מוסדיים מחזיקים.') },
                            ]
                          },
                          {
                            title: t('Short Interest', 'שורט'),
                            items: [
                              { label: t('Shares Short', 'מניות שורט'), value: formatters.compact(advStats.sharesShort), tooltip: t('Total number of shares technically sold short in the open market.', 'סך המניות שנמכרו בחסר וטרם כוסו.') },
                              { label: t('Short / Float', 'שורט מסחירות'), value: formatters.pct(shortFloatRatio), tooltip: t('Percentage of available traded shares currently sold short.', 'שיעור המניות המצויות פוזיציית חסר.') },
                              { label: t('Short Ratio', 'ימי כיסוי לשורט'), value: formatters.num(advStats.shortRatio), tooltip: t('Days to cover short positions using average daily volume.', 'ימי כיסוי: משך הזמן המשוער לסגירת הפוזיציות.') },
                            ]
                          }
                        ];

                        return (
                          <Box sx={{ mt: 3, mb: 2 }}>
                            {advStats.recommendationTrend && advStats.recommendationTrend.length > 0 && (() => {
                              const currentTrend = advStats.recommendationTrend[0];
                              const total = currentTrend.strongBuy + currentTrend.buy + currentTrend.hold + currentTrend.sell + currentTrend.strongSell;
                              if (total === 0) return null;

                              const isDark = theme.palette.mode === 'dark';
                              const categories = [
                                { key: 'strongBuy', label: t('Strong Buy', 'קניה חזקה'), color: isDark ? '#1b5e20' : '#2e7d32' },
                                { key: 'buy', label: t('Buy', 'קניה'), color: isDark ? '#43a047' : '#4caf50' },
                                { key: 'hold', label: t('Hold', 'החזק'), color: isDark ? '#607d8b' : '#78909c' },
                                { key: 'sell', label: t('Sell', 'מכירה'), color: isDark ? '#ed6c02' : '#f57c00' },
                                { key: 'strongSell', label: t('Strong Sell', 'מכירה חזקה'), color: isDark ? '#c62828' : '#d32f2f' },
                              ] as const;

                              return (
                                <Box sx={{ mt: 4 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                                    {t('Analyst Recommendations', 'המלצות אנליסטים')}
                                  </Typography>

                                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 3, alignItems: 'flex-start', mb: 0 }}>
                                    {/* Current Trend Linear Pie */}
                                    <Box sx={{ flex: 1, width: '100%', mt: 1.5 }}>
                                      <Box sx={{ display: 'flex', width: '100%', height: 32, borderRadius: 1, overflow: 'hidden', boxShadow: 1 }}>
                                        {categories.map(cat => {
                                          const val = currentTrend[cat.key as keyof typeof currentTrend] as number;
                                          if (val === 0) return null;
                                          const pct = (val / total) * 100;

                                          return (
                                            <Tooltip key={cat.key} title={`${cat.label}: ${val} (${pct.toFixed(1)}%)`} placement="top" arrow>
                                              <Box sx={{ width: `${pct}%`, bgcolor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,0.2)' }}>
                                                {pct > 5 && (
                                                  <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap', textShadow: '0px 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {val}
                                                  </Typography>
                                                )}
                                              </Box>
                                            </Tooltip>
                                          );
                                        })}
                                      </Box>
                                    </Box>
                                    {/* Stacked Area Chart Sparkline for History */}
                                    {advStats.recommendationTrend.length > 1 && (() => {
                                      const chartData = [...advStats.recommendationTrend].reverse().map(trendObj => ({
                                        name: trendObj.period === '0m' ? t('Current', 'נוכחי') :
                                              trendObj.period === '-1m' ? t('1M ago', 'לפני חודש') :
                                              trendObj.period === '-2m' ? t('2M ago', 'לפני 2ח\'') :
                                              trendObj.period === '-3m' ? t('3M ago', 'לפני 3ח\'') : trendObj.period,
                                        strongBuy: trendObj.strongBuy,
                                        buy: trendObj.buy,
                                        hold: trendObj.hold,
                                        sell: trendObj.sell,
                                        strongSell: trendObj.strongSell
                                      }));

                                      return (
                                        <Tooltip title={t('Recommendation Trend Over Time', 'מגמת המלצות לאורך זמן')} arrow placement="top">
                                          {/* Slightly wider, taller, to give XAxis room. right offset so the last label doesn't clip */}
                                          <Box sx={{ width: { xs: '100%', sm: 160, md: 180 }, height: 70, flexShrink: 0 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                              <BarChart data={chartData} barCategoryGap={5} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: theme.palette.text.secondary }} axisLine={false} tickLine={false} dy={4} interval={0} />
                                                <RechartsTooltip
                                                  contentStyle={{ fontSize: '0.65rem', borderRadius: 4, padding: '2px 4px', backgroundColor: theme.palette.background.paper }}
                                                  itemStyle={{ padding: 0 }}
                                                  labelStyle={{ display: 'none' }}
                                                  formatter={(value: number | undefined, name: string | undefined, props: any) => {
                                                    const p = props.payload;
                                                    const tot = p.strongBuy + p.buy + p.hold + p.sell + p.strongSell;
                                                    const pctStr = (tot > 0 && value !== undefined) ? ((value / tot) * 100).toFixed(1) : '0.0';
                                                    return [`${value || 0} (${pctStr}%)`, name || ''];
                                                  }}
                                                  itemSorter={(item: any) => {
                                                    const order: Record<string, number> = { strongBuy: 0, buy: 1, hold: 2, sell: 3, strongSell: 4 };
                                                    return order[item.dataKey as string] ?? 99;
                                                  }}
                                                />
                                                <Bar dataKey="strongSell" stackId="1" fill={categories.find(c => c.key === 'strongSell')?.color} fillOpacity={0.8} name={t('Strong Sell', 'מכירה חזקה')}>
                                                  <LabelList dataKey="strongSell" position="inside" fontSize={8} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                                                </Bar>
                                                <Bar dataKey="sell" stackId="1" fill={categories.find(c => c.key === 'sell')?.color} fillOpacity={0.8} name={t('Sell', 'מכירה')}>
                                                  <LabelList dataKey="sell" position="inside" fontSize={8} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                                                </Bar>
                                                <Bar dataKey="hold" stackId="1" fill={categories.find(c => c.key === 'hold')?.color} fillOpacity={0.8} name={t('Hold', 'החזק')}>
                                                  <LabelList dataKey="hold" position="inside" fontSize={8} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                                                </Bar>
                                                <Bar dataKey="buy" stackId="1" fill={categories.find(c => c.key === 'buy')?.color} fillOpacity={0.8} name={t('Buy', 'קניה')}>
                                                  <LabelList dataKey="buy" position="inside" fontSize={8} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                                                </Bar>
                                                <Bar dataKey="strongBuy" stackId="1" fill={categories.find(c => c.key === 'strongBuy')?.color} fillOpacity={0.8} name={t('Strong Buy', 'קניה חזקה')}>
                                                  <LabelList dataKey="strongBuy" position="inside" fontSize={8} fill="#fff" formatter={(v: number) => v > 0 ? v : ''} />
                                                </Bar>
                                              </BarChart>
                                            </ResponsiveContainer>
                                          </Box>
                                        </Tooltip>
                                      );
                                    })()}
                                  </Box>

                                  {/* Legend */}
                                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1, justifyContent: 'center' }}>
                                    {categories.map(cat => (
                                      currentTrend[cat.key as keyof typeof currentTrend] && (
                                        <Box key={cat.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color }} />
                                          <Typography variant="caption" color="text.secondary">{cat.label}</Typography>
                                        </Box>
                                      )
                                    ))}
                                  </Box>
                                </Box>
                              );
                            })()}


                            {/* Price Targets Chart */}
                            {(advStats.targetHighPrice || advStats.targetMeanPrice || advStats.targetMedianPrice || advStats.targetLowPrice) && (() => {
                              const currentPrice = (holdingData as any)?.currentPrice || (displayData as any)?.regularMarketPrice || (displayData as any)?.price;
                              if (!currentPrice) return null;

                              const targets = [
                                { label: t('High', 'גבוה'), value: advStats.targetHighPrice, color: theme.palette.success.main },
                                { label: t('Mean', 'ממוצע'), value: advStats.targetMeanPrice, color: theme.palette.info.main },
                                { label: t('Median', 'חציון'), value: advStats.targetMedianPrice, color: theme.palette.primary.main },
                                { label: t('Low', 'נמוך'), value: advStats.targetLowPrice, color: theme.palette.error.main }
                              ].filter(t => t.value !== undefined) as { label: string, value: number, color: string }[];

                              if (targets.length === 0) return null;

                              const numAnalysts = advStats.numberOfAnalystOpinions || 0;

                              if (numAnalysts === 1) {
                                const targetPrice = advStats.targetMeanPrice || advStats.targetMedianPrice || targets[0]?.value;
                                const pctChange = ((targetPrice - currentPrice) / currentPrice) * 100;
                                return (
                                  <Box sx={{ mt: 3, mb: 4, px: 2 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                                      {t('Analyst Price Targets', 'יעדי מחיר אנליסטים')}
                                    </Typography>
                                    <Box display="flex" alignItems="center" bgcolor="action.hover" borderRadius={2} p={1.5} gap={1.5}>
                                      <Typography variant="body2" color="text.secondary">
                                        {t('Based on a single analyst target:', 'מבוסס על יעד אנליסט בודד:')}
                                      </Typography>
                                      <Typography variant="body2" fontWeight="bold" sx={{ color: targetPrice >= currentPrice ? 'success.main' : 'error.main' }}>
                                        {formatters.currency(targetPrice, (displayData?.currency || advStats.financialCurrency) as Currency)}
                                      </Typography>
                                      <Typography variant="body2" sx={{ color: pctChange >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                                        {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                                      </Typography>
                                    </Box>
                                  </Box>
                                );
                              } else if (numAnalysts === 2) {
                                const minTarget = advStats.targetLowPrice || advStats.targetLowPrice || 0;
                                const maxTarget = advStats.targetHighPrice || advStats.targetHighPrice || 0;
                                const minPct = ((minTarget - currentPrice) / currentPrice) * 100;
                                const maxPct = ((maxTarget - currentPrice) / currentPrice) * 100;

                                return (
                                  <Box sx={{ mt: 3, mb: 4, px: 2 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                                      {t('Analyst Price Targets', 'יעדי מחיר אנליסטים')}
                                    </Typography>
                                    <Box display="flex" alignItems="center" bgcolor="action.hover" borderRadius={2} p={1.5} gap={1.5} flexWrap="wrap">
                                      <Typography variant="body2" color="text.secondary">
                                        {t('Based on two analyst targets:', 'מבוסס על שני יעדי אנליסטים:')}
                                      </Typography>
                                      <Typography variant="body2" fontWeight="bold">
                                        <Box component="span" sx={{ color: minTarget >= currentPrice ? 'success.main' : 'error.main' }}>
                                          {formatters.currency(minTarget, (displayData?.currency || advStats.financialCurrency) as Currency)}
                                        </Box>
                                        {' - '}
                                        <Box component="span" sx={{ color: maxTarget >= currentPrice ? 'success.main' : 'error.main' }}>
                                          {formatters.currency(maxTarget, (displayData?.currency || advStats.financialCurrency) as Currency)}
                                        </Box>
                                      </Typography>
                                      <Typography variant="body2" fontWeight="bold">
                                        <Box component="span" sx={{ color: minPct >= 0 ? 'success.main' : 'error.main' }}>
                                          {minPct > 0 ? '+' : ''}{minPct.toFixed(1)}%
                                        </Box>
                                        {` ${t('to', 'עד')} `}
                                        <Box component="span" sx={{ color: maxPct >= 0 ? 'success.main' : 'error.main' }}>
                                          {maxPct > 0 ? '+' : ''}{maxPct.toFixed(1)}%
                                        </Box>
                                      </Typography>
                                    </Box>
                                  </Box>
                                );
                              }

                              const allVals = [...targets.map(t => t.value), currentPrice];
                              const minVal = Math.min(...allVals);
                              const maxVal = Math.max(...allVals);
                              const range = maxVal - minVal || 1;

                              // padding so dots and labels don't clip at boundaries
                              const padding = range * 0.15;
                              const paddedMin = minVal - padding;
                              const paddedMax = maxVal + padding;
                              const paddedRange = paddedMax - paddedMin;

                              const getPos = (val: number) => ((val - paddedMin) / paddedRange) * 100;

                              return (
                                <Box sx={{ mt: 3, mb: 5, px: 2 }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 6, fontWeight: 'bold' }}>
                                    {t('Analyst Price Targets', 'יעדי מחיר אנליסטים')}
                                  </Typography>

                                  <Box sx={{ position: 'relative', height: 6, bgcolor: 'action.hover', borderRadius: 3, mb: 8, opacity: 0.9 }}>
                                    {/* Background Bell Curve */}
                                    {advStats.targetLowPrice && advStats.targetHighPrice && advStats.targetMedianPrice && (() => {
                                      const lowX = getPos(advStats.targetLowPrice);
                                      const highX = getPos(advStats.targetHighPrice);
                                      const medianX = getPos(advStats.targetMedianPrice);
                                      return (
                                        <Box sx={{ position: 'absolute', bottom: '100%', left: 0, right: 0, height: 40, pointerEvents: 'none', overflow: 'visible' }}>
                                          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                                            <defs>
                                              <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.25} />
                                                <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.0} />
                                              </linearGradient>
                                            </defs>
                                            <path d={`
                                               M ${lowX} 100
                                               C ${lowX + (medianX - lowX) * 0.5} 100,
                                                 ${medianX - (medianX - lowX) * 0.4} 0,
                                                 ${medianX} 0
                                               C ${medianX + (highX - medianX) * 0.4} 0,
                                                 ${highX - (highX - medianX) * 0.5} 100,
                                                 ${highX} 100
                                             `} fill="url(#bellGrad)" stroke={theme.palette.primary.main} strokeOpacity={0.3} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                          </svg>
                                        </Box>
                                      );
                                    })()}

                                    {/* colored range from Low to High if both exist */}
                                    {advStats.targetLowPrice && advStats.targetHighPrice && (
                                      <Box style={{
                                        position: 'absolute',
                                        left: `${getPos(advStats.targetLowPrice)}%`,
                                        right: `${100 - getPos(advStats.targetHighPrice)}%`,
                                        top: 0, bottom: 0,
                                      }} sx={{ bgcolor: 'action.selected', borderRadius: 3 }} />
                                    )}

                                    {/* Target Markers */}
                                    {targets.map(tgt => {
                                      const pctChange = ((tgt.value - currentPrice) / currentPrice) * 100;
                                      const isPositive = pctChange > 0;

                                      // Check if this is the median and it overlaps with the mean
                                      const meanT = targets.find(x => x.label === t('Mean', 'ממוצע') || x.color === theme.palette.info.main);
                                      const isMedian = tgt.label === t('Median', 'חציון') || tgt.color === theme.palette.primary.main;
                                      const isOverlap = isMedian && meanT && Math.abs(getPos(tgt.value) - getPos(meanT.value)) < 15;

                                      return (
                                        <Box key={tgt.label} style={{ position: 'absolute', left: `${getPos(tgt.value)}%`, top: 0, transform: 'translateX(-50%)' }} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: tgt.color, border: '2px solid', borderColor: 'background.paper', mt: -0.4, zIndex: 2 }} />
                                          <Box sx={{
                                            position: isOverlap ? 'absolute' : 'relative',
                                            bottom: isOverlap ? '100%' : 'auto',
                                            mb: isOverlap ? 1.5 : 0,
                                            mt: isOverlap ? 0 : 0.5,
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'background.paper', px: 0.5, borderRadius: 1, zIndex: 1, boxShadow: 1
                                          }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{tgt.label}</Typography>
                                            <Typography variant="caption" fontWeight="bold" sx={{ color: tgt.color, fontSize: '0.75rem', lineHeight: 1.1 }}>
                                              {isPositive ? '+' : ''}{pctChange.toFixed(1)}%
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                              {formatters.currency(tgt.value, (displayData?.currency || advStats.financialCurrency) as Currency)}
                                            </Typography>
                                          </Box>
                                        </Box>
                                      );
                                    })}



                                    {/* Current Price Marker */}
                                    <Box style={{ position: 'absolute', left: `${getPos(currentPrice)}%`, top: -38, transform: 'translateX(-50%)' }} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
                                      <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5, bgcolor: theme.palette.mode === 'dark' ? '#333' : '#eee', px: 1, py: 0.25, borderRadius: 1, border: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap', boxShadow: 1 }}>
                                        {t('Current', 'נוכחי')}: {formatters.currency(currentPrice, (displayData?.currency || advStats.financialCurrency) as Currency)}
                                      </Typography>
                                      <Box sx={{ width: 2, height: 38, bgcolor: 'text.primary', borderRadius: 1 }} />
                                    </Box>
                                  </Box>
                                </Box>
                              );
                            })()}

                            <Accordion variant="outlined" sx={{ borderRadius: 1, '&:before': { display: 'none' } }}>
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography variant="subtitle2">{t('Advanced Statistics', 'נתונים מתקדמים')}</Typography>
                              </AccordionSummary>
                              <AccordionDetails sx={{ pt: 0, pb: 2, px: 2 }}>
                                <Grid container spacing={2}>
                                  {groups.map((g, idx) => {
                                    const validItems = g.items.filter(i => i.value !== undefined);
                                    if (validItems.length === 0) return null;
                                    return (
                                      <Grid item xs={12} sm={6} md={4} key={idx}>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
                                          {g.title}
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                          {validItems.map((item, i) => (
                                            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}>
                                              {item.tooltip ? (
                                                <Tooltip title={item.tooltip} placement="top" arrow>
                                                  <Typography variant="body2" color="text.secondary" sx={{ textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'help' }}>
                                                    {item.label}
                                                  </Typography>
                                                </Tooltip>
                                              ) : (
                                                <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                                              )}
                                              <Typography variant="body2" fontWeight="medium">{item.value}</Typography>
                                            </Box>
                                          ))}
                                        </Box>
                                      </Grid>
                                    );
                                  })}
                                </Grid>

                              </AccordionDetails>
                            </Accordion>
                          </Box>
                        );
                      })()}

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

                {activeTab === 'financials' && ((displayData as any)?.incomeStatementHistory || (displayData as any)?.incomeStatementHistoryQuarterly || (displayData as any)?.calendarEvents || (displayData as any)?.advancedStats) && (
                  <TabPanelWithShadows theme={theme}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(displayData as any)?.calendarEvents && <CalendarEventsView events={(displayData as any).calendarEvents} currency={(displayData as any).currency || (displayData as any).stockCurrency || 'USD'} expectedDivTotal={totalQty && (displayData as any).calendarEvents?.dividendAmount ? totalQty * (displayData as any).calendarEvents.dividendAmount : undefined} t={t} />}
                      {((displayData as any)?.incomeStatementHistory || (displayData as any)?.incomeStatementHistoryQuarterly) && (
                        <IncomeStatementView
                          history={(displayData as any).incomeStatementHistory}
                          historyQuarterly={(displayData as any).incomeStatementHistoryQuarterly}
                          priceCurrency={((displayData as any).currency || 'USD') as Currency}
                          finanacialCurrency={((displayData as any)?.advancedStats?.financialCurrency || (displayData as any).currency || 'ILS') as Currency}
                          t={t}
                        />
                      )}

                      {/* Key Financials (from Advanced Stats) */}
                      {(() => {
                        const advStats: AdvancedStats | undefined = (displayData as any)?.advancedStats;
                      if (!advStats) return null;

                      const formatters = {
                          pct: (v: number | undefined) => v !== undefined ? formatPercent(v) : undefined,
                          num: (v: number | undefined) => v !== undefined ? v.toFixed(2) : undefined,
                          currency: (v: number | undefined, curr: Currency) => v !== undefined ? formatMoneyPrice({ amount: v, currency: curr}, t) : undefined,
                      };

                      const keyStats = [
                          { label: t('P/E (Fwd)', 'מכפיל עתידי'), value: formatters.num(advStats.forwardPE) },
                          { label: t('PEG Ratio', 'יחס PEG'), value: formatters.num(advStats.pegRatio) },
                          { label: t('Trailing 1y EPS', 'EPS עוקב שנתי'), value: formatters.currency(advStats.trailingEps, advStats.financialCurrency as Currency) },
                          { label: t('Forward 1y EPS', 'EPS צפי שנתי'), value: formatters.currency(advStats.forwardEps, advStats.financialCurrency as Currency) },
                          { label: t('Earnings Q Grw.', 'צמיחת רווחים'), value: formatters.pct(advStats.earningsQuarterlyGrowth ?? advStats.earningsGrowth) },
                          { label: t('Revenue Q Grw.', 'צמיחת הכנסות'), value: formatters.pct(advStats.revenueQuarterlyGrowth ?? advStats.revenueGrowth) },
                          { label: t('Profit Margin', 'שולי רווח'), value: formatters.pct(advStats.profitMargins) },
                          { label: t('ROE', 'תשואה להון'), value: formatters.pct(advStats.returnOnEquity) },
                        ].filter(s => s.value !== undefined);

                        if (keyStats.length === 0) return null;

                        return (
                          <Box sx={{ mt: 2, pt: 1, mx: { xs: 1, sm: 3 } }}>
                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>{t('Key Financials', 'נתונים פיננסיים עיקריים')}</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, columnGap: 4, rowGap: 1.5 }}>
                              {keyStats.map((stat, idx) => (
                                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted', borderColor: 'divider', pb: 0.5 }}>
                                  <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                                  <Typography variant="body2" fontWeight="medium">{stat.value}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        );
                      })()}
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
          <Button onClick={handleOpenChat} color="primary" variant="outlined" sx={{ textTransform: 'none', borderRadius: 2, minWidth: { xs: 0, md: 64 }, px: { xs: 1.5, md: 2 }, '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } } }} startIcon={<SmartToyIcon fontSize="small" />}>
            <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{t('AI Assistant', 'עוזר AI')}</Box>
          </Button>
          <Button variant="contained" onClick={handleAddTransaction} startIcon={isMobile ? undefined : <AddIcon />} sx={{ borderRadius: 2, textTransform: 'none', px: isMobile ? 1.5 : 2, minWidth: isMobile ? 0 : 64 }}>
            {isMobile ? t('Add Transaction', 'הוסף עסקה') : t('Add Transaction', 'הוסף עסקה')}
          </Button>
          <Button onClick={handleClose} color="inherit" sx={{ textTransform: 'none' }}>{t('Close', 'סגור')}</Button>
        </DialogActions>
      </Dialog>
      <TickerAiChat
        open={chatOpen}
        apiKey={apiKey}
        sheetId={sheetId}
        tickerData={(displayData && 'exchange' in displayData) ? (displayData as any) : undefined}
        advancedStats={(displayData as any)?.advStats || (displayData as any)?.advancedStats || (data?.advancedStats as any)}
        onClose={() => {
          setChatOpen(false);
          navigate({ hash: activeTab }, { replace: true });
        }}
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
        currency={(data?.currency || 'USD') as Currency}
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

const CalendarEventsView = ({ events, currency, t, expectedDivTotal }: { events: any, currency?: string, t: any, expectedDivTotal?: number }) => {
  const earningsCallDays = events.earningsCallDate ? getDaysDiff(events.earningsCallDate) : undefined;
  const showEarningsCall = earningsCallDays !== undefined && earningsCallDays >= -30;

  const divExDays = events.exDividendDate ? getDaysDiff(events.exDividendDate) : undefined;
  const divPayDays = events.dividendDate ? getDaysDiff(events.dividendDate) : undefined;
  const showDiv = (divExDays !== undefined && divExDays >= -30) || (divPayDays !== undefined && divPayDays >= -30);

  return (
    <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.5 }}>
      {events.earningsDate && (
        <EventCard
          title={t('Earnings Date', 'תאריך דיווח רווחים')}
          value={formatDateWithRelative(events.earningsDate, t)}
          subValue={events.isEarningsDateEstimate ? t('Estimate', 'הערכה') : undefined}
          icon={<AssignmentIcon fontSize="small" />}
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
          title={t('Quarterly EPS Estimate', 'הערכת רווחים רבעונית למניה')}
          value={`${events.earningsAnalystEstimate.avg}`}
          subValue={`${t('Low', 'נמוך')}: ${events.earningsAnalystEstimate.low} | ${t('High', 'גבוה')}: ${events.earningsAnalystEstimate.high}`}
          icon={<TrendingUpIcon fontSize="small" />}
        />
      )}
      {events.revenueEstimate?.avg != null && (
        <EventCard
          title={t('Revenue Estimate', 'הערכת הכנסות')}
          value={formatMoneyCompactValue({ amount: events.revenueEstimate.avg, currency: (events.revenueEstimate.currency || 'USD') as any })}
          subValue={`${t('Low', 'נמוך')}: ${formatMoneyCompactValue({ amount: events.revenueEstimate.low, currency: (events.revenueEstimate.currency || 'USD') as any })} | ${t('High', 'גבוה')}: ${formatMoneyCompactValue({ amount: events.revenueEstimate.high, currency: (events.revenueEstimate.currency || 'USD') as any })}`}
          icon={<AssessmentIconOutlined fontSize="small" />}
        />
      )}
      {showDiv && (
        <EventCard
          title={t('Dividends', 'דיבידנדים')}
          value={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {events.dividendAmount && <Typography variant="body2" sx={{ fontSize: '0.8rem', mb: 0.5 }}>{typeof events.dividendAmount === 'number' ? formatMoneyValue({ amount: events.dividendAmount, currency: (events.dividendCurrency || currency || 'USD') as any }, undefined, 2) : events.dividendAmount} {t('PS', 'למניה')}{expectedDivTotal ? ` • ${formatMoneyValue({ amount: expectedDivTotal, currency: (events.dividendCurrency || currency || 'USD') as any }, undefined, 0)} ${t('Total', 'סה״כ')}` : ''}</Typography>}
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

const IncomeStatementView = ({ history, historyQuarterly, finanacialCurrency, t }: { history?: any[], historyQuarterly?: any[], priceCurrency: Currency, finanacialCurrency: Currency, t: any }) => {
  const theme = useTheme();
  const [period, setPeriod] = useState<'Quarterly' | 'Annual'>('Quarterly');

  const activeHistory = period === 'Quarterly' && historyQuarterly?.length ? historyQuarterly : history;
  if (!activeHistory || activeHistory.length === 0) return null;

  const sanitizeZero = (val: any) => (val === 0 ? undefined : val);

  // Format data for chart (reverse to chronological order for chart)
  const chartData = [...activeHistory].reverse().map(item => {
    const d = new Date(item.endDate);
    return {
      periodName: period === 'Quarterly' ? `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}` : d.getFullYear().toString(),
      Revenue: sanitizeZero(item.totalRevenue),
      GrossProfit: sanitizeZero(item.grossProfit),
      NetIncome: sanitizeZero(item.netIncome),
      OperatingIncome: sanitizeZero(item.operatingIncome)
    };
  });

  const formatValue = (val: number | undefined, curr: Currency) => val !== undefined && val !== null && val !== 0 ? formatMoneyValue({ amount: val, currency: curr }) : '-';
  const formatCompactVal = (val: number | undefined, curr: Currency) => val !== undefined && val !== null && val !== 0 ? formatCompactValue(val, curr) : '-';

  const hasRevenue = activeHistory.some(row => row.totalRevenue !== undefined && row.totalRevenue !== null && row.totalRevenue !== 0);
  const hasGrossProfit = activeHistory.some(row => row.grossProfit !== undefined && row.grossProfit !== null && row.grossProfit !== 0);
  const hasOperatingIncome = activeHistory.some(row => row.operatingIncome !== undefined && row.operatingIncome !== null && row.operatingIncome !== 0);
  const hasNetIncome = activeHistory.some(row => row.netIncome !== undefined && row.netIncome !== null && row.netIncome !== 0);

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
          <BarChart data={chartData} margin={{ top: 10, right: 0, left: 10, bottom: -10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="periodName" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(val) => formatCompactVal(val, finanacialCurrency)} tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} axisLine={false} tickLine={false} />
            <RechartsTooltip formatter={(val: any) => formatValue(val, finanacialCurrency)} cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8, color: theme.palette.text.primary }} />
            <Legend wrapperStyle={{ paddingTop: 0, paddingBottom: 20 }} />
            <Bar dataKey="Revenue" fill={theme.palette.text.disabled} fillOpacity={0.4} name={t('Revenue', 'הכנסות')} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="Revenue" position="top" formatter={(val: any) => formatCompactVal(val, finanacialCurrency)} fill={theme.palette.text.secondary} fontSize={10} />
            </Bar>
            <Bar dataKey="NetIncome" fill={theme.palette.primary.main} fillOpacity={0.6} name={t('Net Income', 'רווח נקי')} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="NetIncome" position="top" formatter={(val: any) => formatCompactVal(val, finanacialCurrency)} fill={theme.palette.text.secondary} fontSize={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><b>{t('Period Ends', 'סוף תקופה')}</b></TableCell>
              {hasRevenue && <TableCell align="right"><b>{t('Revenue', 'הכנסות')}</b></TableCell>}
              {hasGrossProfit && <TableCell align="right"><b>{t('Gross Profit', 'רווח גולמי')}</b></TableCell>}
              {hasOperatingIncome && <TableCell align="right"><b>{t('Operating Income', 'רווח תפעולי')}</b></TableCell>}
              {hasNetIncome && <TableCell align="right"><b>{t('Net Income', 'רווח נקי')}</b></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {activeHistory.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{new Date(row.endDate).toLocaleDateString()}</TableCell>
                {hasRevenue && <TableCell align="right">{formatCompactVal(row.totalRevenue, finanacialCurrency)}</TableCell>}
                {hasGrossProfit && <TableCell align="right">{formatCompactVal(row.grossProfit, finanacialCurrency)}</TableCell>}
                {hasOperatingIncome && <TableCell align="right">{formatCompactVal(row.operatingIncome, finanacialCurrency)}</TableCell>}
                {hasNetIncome && <TableCell align="right">{formatCompactVal(row.netIncome, finanacialCurrency)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};