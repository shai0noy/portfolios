import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { formatPercent } from '../../lib/currencyUtils';
import { Box, Paper, Typography, Grid, Tooltip, ToggleButton, ToggleButtonGroup, IconButton, CircularProgress, Button, Menu, MenuItem, Chip, ListItemIcon, Dialog, DialogTitle, DialogContent, Fade, Alert, ListItemText, Divider, Link as MuiLink } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { formatMoneyValue, normalizeCurrency } from '../../lib/currencyUtils';
import { logIfFalsy } from '../../lib/utils';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PieChartIcon from '@mui/icons-material/PieChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
// import SearchIcon from '@mui/icons-material/Search';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import { type ExchangeRates, type DashboardHolding, type Portfolio, type Transaction } from '../../lib/types';
import { useLanguage } from '../../lib/i18n';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { TickerChart, type ChartSeries, type TrendType, TrendLineIcon } from '../TickerChart';
import { calculatePortfolioPerformance, type PerformancePoint } from '../../lib/performance';
import { useChartComparison, getAvailableRanges, getMaxLabel, type ComparisonOption } from '../../lib/hooks/useChartComparison';
import { TickerSearch } from '../TickerSearch';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { CustomRangeDialog } from '../CustomRangeDialog';
import type { TickerProfile } from '../../lib/types/ticker';
import { AnalysisDialog } from '../AnalysisDialog';
import type { DashboardSummaryData } from '../../lib/dashboard';
import { SummaryStat } from './SummaryStat';
import { PerformanceStat } from './PerformanceStat';
import { TopMovers } from './TopMovers';
import { MarketViewSummary } from './MarketViewSummary';
import { RecentEventsCard } from './RecentEventsCard';
import { hasRecentEvents } from './RecentEventsCard';

// Time constants for auto-stepping
const AUTO_STEP_DELAY = 2 * 60 * 1000; // 2 minutes
const INTERACTION_STEP_DELAY = 8 * 60 * 1000; // 8 minutes

interface SummaryProps {
  summary: DashboardSummaryData;
  holdings: DashboardHolding[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  selectedPortfolio: string | null;
  portfolios: Portfolio[];
  isPortfoliosLoading: boolean;
  transactions: Transaction[];
  dividendRecords?: any[];
  hasFutureTxns?: boolean;
  favoriteHoldings?: DashboardHolding[];
  showClosed?: boolean;
  boiTickerData?: { ticker: string, exchange: string, historical: { date: Date, price: number }[] };
  is1dStale?: boolean;
}

/**
 * Main Dashboard Summary Component.
 * Displays:
 * 1. High-level Portfolio Stats (Value, Gains, etc.)
 * 2. Performance Chart (Holdings, TWR, Gains)
 * 3. Top Movers (Daily, Weekly, Monthly)
 * 4. Market View Summary (Indices, Sectors, Top Movers)
 * 
 * Supports "Stepping" through these 4 views automatically or manually.
 */
const TruncatedCell = ({ text }: { text: string }) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const checkTruncation = () => {
    if (ref.current) {
      setIsTruncated(ref.current.scrollWidth > ref.current.clientWidth);
    }
  };

  return (
    <Tooltip title={text} disableHoverListener={!isTruncated} disableTouchListener={!isTruncated} enterTouchDelay={500}>
      <div
        ref={ref}
        onMouseEnter={checkTruncation}
        onTouchStart={checkTruncation}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </Tooltip>
  );
};

export function DashboardSummary({ summary, holdings, displayCurrency, exchangeRates, selectedPortfolio, portfolios, isPortfoliosLoading, transactions, dividendRecords = [], hasFutureTxns, favoriteHoldings, showClosed, boiTickerData }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  const { t, isRtl } = useLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [activeStep, setActiveStep] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'metricPct', direction: 'desc' });
  const [txnSortConfig, setTxnSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [popupStat, setPopupStat] = useState<{
    key: string;
    label: string;
  } | null>(null);

  const getPopupData = useMemo(() => {
    if (!popupStat || !holdings) return [];
    const grouped = new Map<string, any>();

    holdings.forEach(h => {
      if (!grouped.has(h.ticker)) {
        grouped.set(h.ticker, {
          ticker: h.ticker,
          exchange: h.exchange,
          displayName: h.displayName || h.ticker,
          display: {
            marketValue: 0,
            unrealizedGain: 0,
            realizedGain: 0,
            valueAfterTax: 0,
            dayChangeVal: 0,
          },
          aumForPerf1w: 0, perfSum1w: 0,
          aumForPerf1m: 0, perfSum1m: 0,
          aumForPerf3m: 0, perfSum3m: 0,
          aumForPerfYtd: 0, perfSumYtd: 0,
          aumForPerf1y: 0, perfSum1y: 0,
          aumForPerf5y: 0, perfSum5y: 0,
          aumForPerfAll: 0, perfSumAll: 0,
          unvestedValue: 0,
        });
      }
      const g = grouped.get(h.ticker)!;
      const disp = h.display || {} as any;
      const mv = disp.marketValue || 0;

      g.display.marketValue += mv;
      g.display.unrealizedGain += disp.unrealizedGain || 0;
      g.display.realizedGain += (disp.realizedGain || 0) + (disp.dividends || 0);
      g.display.valueAfterTax += disp.valueAfterTax || 0;
      g.display.dayChangeVal += disp.dayChangeVal || 0;
      g.unvestedValue += (h.marketValueUnvested?.amount || 0);

      if (h.perf1w !== undefined) { g.perfSum1w += h.perf1w * mv; g.aumForPerf1w += mv; }
      if (h.perf1m !== undefined) { g.perfSum1m += h.perf1m * mv; g.aumForPerf1m += mv; }
      if (h.perf3m !== undefined) { g.perfSum3m += h.perf3m * mv; g.aumForPerf3m += mv; }
      if (h.perfYtd !== undefined) { g.perfSumYtd += h.perfYtd * mv; g.aumForPerfYtd += mv; }
      if (h.perf1y !== undefined) { g.perfSum1y += h.perf1y * mv; g.aumForPerf1y += mv; }
      if (h.perf5y !== undefined) { g.perfSum5y += h.perf5y * mv; g.aumForPerf5y += mv; }
      if (h.perfAll !== undefined) { g.perfSumAll += h.perfAll * mv; g.aumForPerfAll += mv; }
    });

    return Array.from(grouped.values()).map(g => {
      const calcPerf = (sum: number, aum: number) => {
        const pct = aum > 0 ? sum / aum : 0;
        const val = pct === 0 ? 0 : aum - (aum / (1 + pct));
        return { pct, val };
      };

      const row = {
        ...g,
        unrealizedGainPct: (g.display.marketValue - g.display.unrealizedGain) > 0 ? g.display.unrealizedGain / (g.display.marketValue - g.display.unrealizedGain) : 0,
        perf1w: calcPerf(g.perfSum1w, g.aumForPerf1w),
        perf1m: calcPerf(g.perfSum1m, g.aumForPerf1m),
        perf3m: calcPerf(g.perfSum3m, g.aumForPerf3m),
        perfYtd: calcPerf(g.perfSumYtd, g.aumForPerfYtd),
        perf1y: calcPerf(g.perfSum1y, g.aumForPerf1y),
        perf5y: calcPerf(g.perfSum5y, g.aumForPerf5y),
        perfAll: calcPerf(g.perfSumAll, g.aumForPerfAll),
      };

      let metricValue = 0;
      let metricPct: number | undefined = undefined;

      if (popupStat?.key === 'valueAfterTax') { metricValue = row.display.valueAfterTax; }
      else if (popupStat?.key === 'totalUnrealized') { metricValue = row.display.unrealizedGain; metricPct = row.unrealizedGainPct; }
      else if (popupStat?.key === 'totalRealized') { metricValue = row.display.realizedGain; }
      else if (popupStat?.key === 'totalUnvestedValue') { metricValue = row.unvestedValue; }
      else if (popupStat?.key === 'totalDayChange') { metricValue = row.display.dayChangeVal; metricPct = row.display.marketValue > 0 ? row.display.dayChangeVal / (row.display.marketValue - row.display.dayChangeVal) : 0; }
      else if (['1W', '1M', '3M', 'YTD', '1Y', '5Y', 'ALL'].includes(popupStat?.key || '')) {
        const p = (row as any)[`perf${popupStat!.key === 'ALL' ? 'All' : popupStat!.key.toLowerCase()}`];
        metricValue = p.val;
        metricPct = p.pct;
      }
      return { ...row, metricValue, metricPct };
    }).sort((a, b) => {
      let sortKey = sortConfig.key;
      if (sortKey === 'metricPct' && a.metricPct === undefined && b.metricPct === undefined) {
        sortKey = 'metricValue';
      }

      let valA: any = a[sortKey as keyof typeof a];
      let valB: any = b[sortKey as keyof typeof b];
      if (sortKey === 'marketValue') {
        valA = a.display.marketValue; valB = b.display.marketValue;
      }
      valA = valA ?? 0;
      valB = valB ?? 0;

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [popupStat, holdings, sortConfig]);


  const hasRecent = hasRecentEvents(holdings, favoriteHoldings || [], transactions, dividendRecords, boiTickerData || undefined);
  const totalSteps = hasRecent ? 6 : 5;
  const idxRecent = 1;
  const idxPerf = hasRecent ? 2 : 1;
  const idxTop = hasRecent ? 3 : 2;
  const idxMarket = hasRecent ? 4 : 3;
  const idxTxns = hasRecent ? 5 : 4;
  
  const transactionsData = useMemo(() => {
    const allTxns: any[] = [];

    const getTickerName = (ticker: string) => {
      const h = holdings.find(x => x.ticker === ticker);
      return h ? (h.displayName || h.longName || h.nameHe || ticker) : ticker;
    };

    const grantGroups: Record<string, { date: string, ticker: string, qty: number, value: number, events: Transaction[] }> = {};

    transactions.forEach(txn => {
      const isGrant = !!txn.vestDate;
      
      if (isGrant) {
          const dateStr = new Date(txn.date).toISOString().split('T')[0];
          const key = `${dateStr}_${txn.ticker}`;
          const val = (txn.originalQty ?? txn.qty ?? 0) * (txn.originalPrice ?? txn.price ?? 0);
          
          if (!grantGroups[key]) {
              grantGroups[key] = { date: txn.date, ticker: txn.ticker, qty: 0, value: 0, events: [] };
          }
          grantGroups[key].qty += (txn.originalQty ?? txn.qty ?? 0);
          grantGroups[key].value += val;
          grantGroups[key].events.push(txn);
      } else {
          const val = (txn.originalQty ?? txn.qty ?? 0) * (txn.originalPrice ?? txn.price ?? 0);
          allTxns.push({
              date: txn.date,
              type: txn.type,
              ticker: txn.ticker,
              name: getTickerName(txn.ticker),
              qty: txn.originalQty ?? txn.qty ?? 0,
              value: val,
              original: txn
          });
      }
    });

    for (const key in grantGroups) {
        const g = grantGroups[key];
        allTxns.push({
            date: g.date,
            type: 'GRANT',
            ticker: g.ticker,
            name: getTickerName(g.ticker),
            qty: g.qty,
            value: g.value,
            original: g.events[0]
        });
    }

    (dividendRecords || []).forEach(div => {
        const val = (div.unitsHeld || 0) * (div.pricePerUnit || div.grossAmount.amount || 0);
        allTxns.push({
            date: div.date,
            type: 'DIVIDEND',
            ticker: div.ticker,
            name: getTickerName(div.ticker),
            qty: div.unitsHeld || 0,
            value: val,
            original: div
        });
    });

    return allTxns;
  }, [transactions, dividendRecords, holdings]);

  const sortedTransactionsData = useMemo(() => {
    const data = [...transactionsData];
    data.sort((a, b) => {
      let valA = a[txnSortConfig.key];
      let valB = b[txnSortConfig.key];

      if (txnSortConfig.key === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return txnSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return txnSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [transactionsData, txnSortConfig]);

  const [perfData, setPerfData] = useState<PerformancePoint[]>([]);
  const [isPerfLoading, setIsPerfLoading] = useState(false);
  // Merged: Included 'twr' from Incoming
  const [chartView, setChartView] = useState<'holdings' | 'twr' | 'gains'>('holdings');
  const [chartMetric, setChartMetric] = useState<'price' | 'percent'>('price');
  const [scaleType, setScaleType] = useState<'linear' | 'log'>('linear');
  const [trendType, setTrendType] = useState<TrendType>('none');
  const [trendMenuAnchor, setTrendMenuAnchor] = useState<null | HTMLElement>(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState<null | HTMLElement>(null);
  const [rangeMenuAnchor, setRangeMenuAnchor] = useState<null | HTMLElement>(null);

  const {
    chartRange, setChartRange,
    comparisonSeries, setComparisonSeries,
    comparisonOptions,
    comparisonLoading,
    handleSelectComparison,
    getClampedData,
    isSearchOpen, setIsSearchOpen
  } = useChartComparison();

  const [compareMenuAnchor, setCompareMenuAnchor] = useState<null | HTMLElement>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRef = useRef(false);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  // Timer logic
  const startTimer = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActiveStep(prev => (prev + 1) % totalSteps);
    }, delay);
  }, [totalSteps]);

  const handleTickerSearchSelect = (ticker: TickerProfile) => {
    handleSelectComparison({
      type: 'TICKER',
      ticker: ticker.symbol,
      exchange: ticker.exchange,
      name: ticker.name,
    } as ComparisonOption);
    setIsSearchOpen(false);
  };

  useEffect(() => {
    const delay = isManualRef.current ? INTERACTION_STEP_DELAY : AUTO_STEP_DELAY;
    isManualRef.current = false;
    startTimer(delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeStep, startTimer]);

  useEffect(() => {
    // Trigger if we have data, and we are not already loading.
    // Recalculates when displayCurrency or other dependencies change.
    if (holdings.length > 0 && !isPerfLoading && transactions && transactions.length > 0) {
      setIsPerfLoading(true);
      setPerfData([]); // Clear old data to avoid showing old currency values with new symbol

      // Use passed transactions directly
      const portfolioPolicies = new Map(portfolios.map(p => [p.id, { divPolicy: p.divPolicy as any }]));
      calculatePortfolioPerformance(holdings, transactions, displayCurrency, exchangeRates, portfolioPolicies)
        .then(({ points }) => {
          setPerfData(points);
          setIsPerfLoading(false);
        })
        .catch(e => {
          console.error("Perf Load Error", e);
          setIsPerfLoading(false);
        });
    }
  }, [holdings, displayCurrency, exchangeRates, transactions, portfolios]);

  const handleManualStep = (direction: 'next' | 'prev') => {
    isManualRef.current = true;
    setActiveStep(prev => {
      if (direction === 'next') return (prev + 1) % totalSteps;
      return (prev - 1 + totalSteps) % totalSteps;
    });
  };

  const handleInteraction = () => {
    // Reset timer to long delay without changing step
    startTimer(INTERACTION_STEP_DELAY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartRef.current = { x: e.touches[0].pageX, y: e.touches[0].pageY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || touchStartRef.current === null) return;

    const touchEnd = { x: e.changedTouches[0].pageX, y: e.changedTouches[0].pageY };
    const dx = touchStartRef.current.x - touchEnd.x;
    const dy = touchStartRef.current.y - touchEnd.y;
    const threshold = 30; // More sensitive

    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
      if (isRtl) {
        // RTL: Swipe Right (dx < 0) -> Next, Swipe Left (dx > 0) -> Prev
        if (dx < 0) handleManualStep('next');
        else handleManualStep('prev');
      } else {
        // LTR: Swipe Left (dx > 0) -> Next, Swipe Right (dx < 0) -> Prev
        if (dx > 0) handleManualStep('next');
        else handleManualStep('prev');
      }
    }
    touchStartRef.current = null;
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
  };

  const getClampedDataCallback = useCallback((data: any[] | null, range: string) => {
    // Use the hook's logic but adapt for performance points
    return getClampedData(data, range);
  }, [getClampedData]);

  const isComparison = comparisonSeries.length > 0;

  // Chart Metric Logic:
  // - Comparison active -> Forced to 'percent'
  // - TWR View -> Forced to 'percent' (TWR is a percentage metric)
  // - Gains View -> Forced to 'price' (Absolute Value)
  // - Holdings View -> User selectable ('price' or 'percent')
  const effectiveChartMetric = isComparison || chartView === 'twr' ? 'percent' : (chartView === 'gains' ? 'price' : chartMetric);

  // If we are in Gains mode, we disable comparison
  const isComparisonDisabled = chartView === 'gains';

  const oldestDate = useMemo(() => perfData.length > 0 ? perfData[0].date : undefined, [perfData]);
  const availableRanges = useMemo(() => getAvailableRanges(oldestDate), [oldestDate]);
  const maxLabel = useMemo(() => getMaxLabel(oldestDate), [oldestDate]);

  const portfolioSeries = useMemo<ChartSeries[]>(() => {
    if (perfData.length === 0) return [];

    let clampedData = [];
    if (chartRange === 'Custom') {
      const { start, end } = customDateRange;
      clampedData = perfData.filter(d => (!start || d.date >= start) && (!end || d.date <= end));
    } else {
      clampedData = getClampedDataCallback(perfData, chartRange);
    }

    if (clampedData.length === 0) return [];

    const initialGain = clampedData.length > 0 ? clampedData[0].gainsValue : 0;

    const mainData = clampedData.map(p => {
      let val = 0;
      if (chartView === 'holdings') {
        val = p.holdingsValue;
      } else if (chartView === 'twr') {
        // TWR View -> Always Percent
        val = p.twr;
      } else {
        // Gains View -> Always Price (Absolute Gains relative to start)
        val = p.gainsValue - initialGain;
      }
      return {
        date: p.date,
        price: val
      };
    });

    const series: ChartSeries[] = [{
      name: chartView === 'holdings' ? t('Total Holdings', 'שווי החזקות') : (chartView === 'twr' ? t('Cumulative TWR', 'TWR מצטבר') : t('Total Gains', 'רווח מצטבר')),
      data: mainData
    }];

    comparisonSeries.forEach(s => {
      series.push({
        ...s,
        data: chartRange === 'Custom'
          ? s.data.filter(d => (!customDateRange.start || d.date >= customDateRange.start) && (!customDateRange.end || d.date <= customDateRange.end))
          : getClampedData(s.data, chartRange, oldestDate)
      });
    });

    return series;
  }, [perfData, chartView, chartRange, comparisonSeries, getClampedDataCallback, getClampedData, t, effectiveChartMetric, oldestDate, customDateRange]);

  const fullPortfolioSeries = useMemo<ChartSeries | null>(() => {
    if (perfData.length === 0) return null;
    const data = perfData.map(p => {
      let val = 0;
      if (chartView === 'holdings') {
        val = p.holdingsValue;
      } else if (chartView === 'twr') {
        val = p.twr;
      } else {
        val = p.gainsValue;
      }
      return { date: p.date, price: val };
    });
    return {
      name: chartView === 'holdings' ? t('Total Holdings', 'שווי החזקות') : (chartView === 'twr' ? t('Cumulative TWR', 'TWR מצטבר') : t('Total Gains', 'רווח מצטבר')),
      data
    };

  }, [perfData, chartView, t]);


  return (
    <>
      <Paper
        variant="outlined"
        sx={{ p: isMobile ? 2 : 3, pb: isMobile ? 1.5 : 3, mb: 4, position: 'relative', touchAction: isMobile ? 'pan-y' : 'auto' }}
        onClick={handleInteraction}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Navigation Buttons (Desktop Only) */}
        {!isMobile && (
          <>
            <IconButton
              onClick={(e) => { e.stopPropagation(); handleManualStep('prev'); }}
              sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
              size="small"
            >
              <ChevronLeftIcon sx={{ transform: isRtl ? 'rotate(180deg)' : 'none' }} />
            </IconButton>

            <IconButton
              onClick={(e) => { e.stopPropagation(); handleManualStep('next'); }}
              sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
              size="small"
            >
              <ChevronRightIcon sx={{ transform: isRtl ? 'rotate(180deg)' : 'none' }} />
            </IconButton>
          </>
        )}

        <Box sx={{ px: isMobile ? 0 : 4 }}>
          {activeStep === 0 && (
            <Fade in={true} timeout={700}>
              <Box>
                <Grid container spacing={isMobile ? 3 : 2} alignItems="flex-start">
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {!selectedPortfolio && (
                        <Typography variant="subtitle2" color="text.secondary">{t('TOTAL VALUE', 'שווי כולל')}</Typography>
                      )}
                      {selectedPortfolio && (
                        <Typography variant="h5" fontWeight="bold" color="primary">{selectedPortfolio}</Typography>
                      )}
                    </Box>
                    <Typography variant="h4" fontWeight="bold" color="primary">{formatMoneyValue({ amount: summary.aum, currency: normalizeCurrency(displayCurrency) }, undefined)}</Typography>
                  </Grid>
                  <Grid item xs={12} md={9}>
                    <Box display="flex" flexDirection="column" gap={isMobile ? 3 : 2} alignItems={isMobile ? "stretch" : "flex-end"}>
                      {/* Main Stats Row */}
                      {isMobile ? (
                        <Grid container spacing={2}>
                          <Grid item xs={6}>
                            <SummaryStat
                              label={t("Value After Tax", "שווי אחרי מס")}
                              onClick={() => setPopupStat({ key: "valueAfterTax", label: t("Value After Tax", "שווי אחרי מס") })}
                              value={summary.valueAfterTax}
                              pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
                              displayCurrency={displayCurrency}
                              showSign={false}
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <SummaryStat
                              label={t("Unrealized Gain", "רווח לא ממומש")}
                              onClick={() => setPopupStat({ key: "totalUnrealized", label: t("Unrealized Gain", "רווח לא ממומש") })}
                              value={summary.totalUnrealized}
                              pct={summary.totalUnrealizedGainPct}
                              color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
                              displayCurrency={displayCurrency}
                              size="small"
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <SummaryStat
                              label={t("Realized Gain", "רווח ממומש")}
                              onClick={() => setPopupStat({ key: "totalRealized", label: t("Realized Gain", "רווח ממומש") })}
                              value={summary.totalRealized + summary.totalDividends}
                              pct={(summary.totalRealized + summary.totalDividends) / ((summary.totalCostOfSold + ((summary.aum - summary.totalUnvestedValue) - summary.totalUnrealized)) > 0 ? (summary.totalCostOfSold + ((summary.aum - summary.totalUnvestedValue) - summary.totalUnrealized)) : 1)}
                              color={(summary.totalRealized + summary.totalDividends) >= 0 ? 'success.main' : 'error.main'}
                              displayCurrency={displayCurrency}
                              size="small"
                            />
                          </Grid>
                          {summary.totalUnvestedValue > 0.01 && (
                            <Grid item xs={6}>
                              <SummaryStat
                                label={t("Unvested Value", "שווי לא מובשל")}
                                onClick={() => setPopupStat({ key: "totalUnvestedValue", label: t("Unvested Value", "שווי לא מובשל") })}
                                value={summary.totalUnvestedValue}
                                pct={summary.totalUnvestedGainPct}
                                gainValue={summary.totalUnvestedGain}
                                gainLabel={t("Unvested Gain", "רווח לא מובשל")}
                                displayCurrency={displayCurrency}
                                size="small"
                              />
                            </Grid>
                          )}
                        </Grid>
                      ) : (
                        <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                          <SummaryStat
                            label={t("Value After Tax", "שווי אחרי מס")}
                              onClick={() => setPopupStat({ key: "valueAfterTax", label: t("Value After Tax", "שווי אחרי מס") })}
                            value={summary.valueAfterTax}
                            pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
                            displayCurrency={displayCurrency}
                            showSign={false}
                          />
                          <SummaryStat
                            label={t("Unrealized Gain", "רווח לא ממומש")}
                              onClick={() => setPopupStat({ key: "totalUnrealized", label: t("Unrealized Gain", "רווח לא ממומש") })}
                            value={summary.totalUnrealized}
                            pct={summary.totalUnrealizedGainPct}
                            color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
                            displayCurrency={displayCurrency}
                          />
                          <SummaryStat
                            label={t("Realized Gain", "רווח ממומש")}
                              onClick={() => setPopupStat({ key: "totalRealized", label: t("Realized Gain", "רווח ממומש") })}
                            value={summary.totalRealized + summary.totalDividends}
                            pct={(summary.totalRealized + summary.totalDividends) / ((summary.totalCostOfSold + ((summary.aum - summary.totalUnvestedValue) - summary.totalUnrealized)) > 0 ? (summary.totalCostOfSold + ((summary.aum - summary.totalUnvestedValue) - summary.totalUnrealized)) : 1)}
                            color={(summary.totalRealized + summary.totalDividends) >= 0 ? 'success.main' : 'error.main'}
                            tooltip={
                              <>
                                {t("Trading", "מסחר")}: {formatMoneyValue({ amount: summary.totalRealized, currency: normalizeCurrency(displayCurrency) }, undefined)}<br />
                                {t("Dividends", "דיבידנדים")}: {formatMoneyValue({ amount: summary.totalDividends, currency: normalizeCurrency(displayCurrency) }, undefined)}<br />
                                {t("Realized gains after tax", "רווח ממומש לאחר מיסוי")}: {formatMoneyValue({ amount: summary.realizedGainAfterTax, currency: normalizeCurrency(displayCurrency) }, undefined)}<br />
                                {t("Total Tax Paid", "סה״כ מס ששולם")}: {formatMoneyValue({ amount: summary.totalTaxPaid, currency: normalizeCurrency(displayCurrency) }, undefined)}
                              </>
                            }
                            displayCurrency={displayCurrency}
                          />
                          {summary.totalUnvestedValue > 0.01 && (
                            <SummaryStat
                              label={t("Unvested Value", "שווי לא מובשל")}
                                onClick={() => setPopupStat({ key: "totalUnvestedValue", label: t("Unvested Value", "שווי לא מובשל") })}
                              value={summary.totalUnvestedValue}
                              pct={summary.totalUnvestedGainPct}
                              gainValue={summary.totalUnvestedGain}
                              gainLabel={t("Unvested Gain", "רווח לא מובשל")}
                              displayCurrency={displayCurrency}
                            />
                          )}
                        </Box>
                      )}

                      {/* Performance / Detail Row */}
                      <Box
                        display={isMobile ? "grid" : "flex"}
                        gap={isMobile ? 1.5 : 2}
                        gridTemplateColumns={isMobile ? "repeat(auto-fill, minmax(80px, 1fr))" : undefined}
                        justifyContent={isMobile ? "stretch" : "flex-end"}
                        alignItems="center"
                        flexWrap="wrap"
                      >
                        <SummaryStat
                          label={summary.totalDayChangeIsStale ? t("Last Trading Day", "מסחר אחרון") : t("1D", "יומי")}
                          onClick={() => setPopupStat({ key: "totalDayChange", label: summary.totalDayChangeIsStale ? t("Last Trading Day", "מסחר אחרון") : t("1D", "יומי") })}
                          value={summary.totalDayChange}
                          pct={summary.totalDayChangePct}
                          color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}
                          tooltip={summary.totalDayChangeIsIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined}
                          displayCurrency={displayCurrency}
                          size="small"
                        />

                        {(() => {
                          const getDuration = (p: string) => {
                            const now = new Date();
                            switch (p) {
                              case '1W': return 7;
                              case '1M': return 30;
                              case '3M': return 90;
                              case '6M': return 180;
                              case 'YTD':
                                const startOfYear = new Date(now.getFullYear(), 0, 1);
                                return (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
                              case '1Y': return 365;
                              case '5Y': return 365 * 5;
                              case 'ALL': return 36500;
                              default: return 99999;
                            }
                          };

                          const statsConfig = [
                            { label: '1W', labelVs: t("1W", "שבוע"), keyPct: 'perf1w', keyGain: 'gain1w', keyInc: 'perf1w_incomplete' },
                            { label: '1M', labelVs: t("1M", "חודש"), keyPct: 'perf1m', keyGain: 'gain1m', keyInc: 'perf1m_incomplete' },
                            { label: '3M', labelVs: t("3M", "3 חודשים"), keyPct: 'perf3m', keyGain: 'gain3m', keyInc: 'perf3m_incomplete' },
                            { label: 'YTD', labelVs: t("YTD", "מתחילת שנה"), keyPct: 'perfYtd', keyGain: 'gainYtd', keyInc: 'perfYtd_incomplete' },
                            { label: '1Y', labelVs: t("1Y", "שנה"), keyPct: 'perf1y', keyGain: 'gain1y', keyInc: 'perf1y_incomplete' },
                            { label: '5Y', labelVs: t("5Y", "5 שנים"), keyPct: 'perf5y', keyGain: 'gain5y', keyInc: 'perf5y_incomplete' },
                            { label: 'ALL', labelVs: t("ALL", "הכל"), keyPct: 'perfAll', keyGain: 'gainAll', keyInc: 'perfAll_incomplete', fallbackGain: 'totalReturn' },
                          ];

                          return statsConfig
                            .sort((a, b) => getDuration(a.label) - getDuration(b.label))
                            .map(cfg => (
                              <PerformanceStat
                                key={cfg.label}
                                label={cfg.labelVs}
                                onClick={() => setPopupStat({ key: cfg.label, label: cfg.labelVs })}
                                percentage={(summary as any)[cfg.keyPct]}
                                gainValue={cfg.fallbackGain ? (summary as any)[cfg.fallbackGain] : (summary as any)[cfg.keyGain]}
                                isLoading={isPortfoliosLoading && (summary as any)[cfg.keyPct] === 0}
                                isIncomplete={(summary as any)[cfg.keyInc]}
                                aum={summary.aum}
                                displayCurrency={displayCurrency}
                                size="small"
                              />
                            ));
                        })()}
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Fade>
          )}
          {activeStep === idxPerf && (
            <Fade in={true} timeout={700}>
              <Box sx={{ height: isComparison ? (chartView === 'holdings' ? 320 : 260) : 230, position: 'relative', minWidth: 0, minHeight: 0, transition: 'height 0.3s ease' }}>
                {isPerfLoading ? (
                  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={1}>
                    <CircularProgress size={30} />
                    <Typography variant="caption" color="text.secondary">{t('Calculating Portfolio Performance...', 'מחשב ביצועי תיק...')}</Typography>
                  </Box>
                ) : portfolioSeries.length > 0 ? (
                  <Box sx={{ height: '100%', mt: -1, minWidth: 0, minHeight: 0 }}>
                    <TickerChart
                      series={portfolioSeries}
                      currency={displayCurrency}
                      mode={effectiveChartMetric}
                      valueType={chartView === 'holdings' || chartView === 'gains' ? 'value' : 'price'}
                      height="100%"
                      hideCurrentPrice={chartView === 'twr'}
                      scaleType={scaleType}
                      onScaleTypeChange={setScaleType}
                      trendType={trendType}
                      onTrendTypeChange={setTrendType}
                      topControls={
                        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ width: '100%', flexWrap: 'wrap', gap: 1, mb: isComparison ? 1 : 0 }}>
                            <Box display="flex" gap={1} alignItems="center" flexWrap="nowrap" sx={{ overflowX: 'auto', scrollbarWidth: 'none', '::-webkit-scrollbar': { display: 'none' } }}>
                              <ToggleButtonGroup
                                value={chartView}
                                exclusive
                                onChange={(_, val) => {
                                  if (val) {
                                    setChartView(val);
                                    if (val === 'gains') {
                                      setComparisonSeries([]);
                                    }
                                  }
                                }}
                                size="small"
                                sx={{
                                  height: 28,
                                  bgcolor: 'action.hover',
                                  p: 0.5,
                                  borderRadius: 1.5,
                                  flexShrink: 0,
                                  '& .MuiToggleButton-root': {
                                    margin: 0,
                                    border: 0,
                                    borderRadius: '6px !important',
                                    px: 1,
                                    py: 0,
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    color: 'text.secondary',
                                  },
                                  '& .Mui-selected': {
                                    bgcolor: 'background.paper',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                    color: 'text.primary',
                                    '&:hover': { bgcolor: 'background.paper' },
                                  }
                                }}
                              >
                                <ToggleButton value="holdings" sx={{ px: 1, fontSize: '0.65rem' }}>{isMobile ? t('Holdings', 'החזקות') : t('Holdings', 'החזקות')}</ToggleButton>
                                <ToggleButton value="twr" sx={{ px: 1, fontSize: '0.65rem' }}>{t('TWR', 'TWR')}</ToggleButton>
                                <ToggleButton value="gains" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Gains', 'רווחים')}</ToggleButton>
                              </ToggleButtonGroup>

                              {!isMobile && (
                                <Tooltip
                                  enterTouchDelay={0}
                                  leaveTouchDelay={3000}
                                  title={
                                    chartView === 'holdings'
                                      ? t("Market Value over time. Tracks the total worth of your portfolio assets.", "שווי שוק לאורך זמן. עוקב אחר השווי הכולל של הנכסים בתיק.")
                                      : (chartView === 'twr'
                                        ? t("Time-Weighted Return. Tracks the performance of your portfolio filtering out deposits/withdrawals. Best for comparing against benchmarks.", "תשואה משוקללת זמן. עוקב אחר ביצועי התיק ללא השפעת הפקדות/משיכות. המדד הטוב ביותר להשוואה מול מדדים.")
                                        : t("Absolute Gains over time. (Market Value - Net Cost). Shows exactly how much money you made.", "רווח אבסולוטי לאורך זמן (שווי שוק פחות עלות נטו). מציג בדיוק כמה כסף הרווחת.")
                                      )
                                  }
                                >
                                  <InfoOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.secondary', cursor: 'help' }} />
                                </Tooltip>
                              )}

                              {isMobile ? (
                                <>
                                  <IconButton
                                    size="small"
                                    onClick={() => setChartMetric(chartMetric === 'price' ? 'percent' : 'price')}
                                    disabled={isComparison || chartView === 'twr' || chartView === 'gains'}
                                    sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.5, height: 26, width: 26, fontSize: '0.7rem', fontWeight: 'bold' }}
                                    color="primary"
                                  >
                                    {chartMetric === 'percent' ? '%' : '$'}
                                  </IconButton>

                                  <ToggleButtonGroup
                                    value={scaleType}
                                    exclusive
                                    onChange={(_, v) => v && setScaleType(v)}
                                    size="small"
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
                                      height: 26,
                                      width: 26,
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
                                    onClick={(e) => setCompareMenuAnchor(e.currentTarget)}
                                    sx={{
                                      borderRadius: 1,
                                      p: 0.5,
                                      height: 26,
                                      width: 26,
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
                                      height: 26,
                                      width: 26,
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
                                  <ToggleButtonGroup
                                    value={effectiveChartMetric}
                                    exclusive
                                    onChange={(_, val) => val && setChartMetric(val)}
                                    size="small"
                                    sx={{ height: 26 }}
                                    disabled={isComparison || chartView === 'twr' || chartView === 'gains'}
                                  >
                                    <ToggleButton value="price" sx={{ px: 1, fontSize: '0.65rem' }}>$</ToggleButton>
                                    <ToggleButton value="percent" sx={{ px: 1, fontSize: '0.65rem' }}>%</ToggleButton>
                                  </ToggleButtonGroup>

                                  <ToggleButtonGroup value={scaleType} exclusive onChange={(_, v) => v && setScaleType(v)} size="small" sx={{ height: 26 }}>
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

                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon sx={{ fontSize: '1rem !important' }} />}
                                    onClick={(e) => setCompareMenuAnchor(e.currentTarget)}
                                    sx={{ height: 26, fontSize: '0.65rem', textTransform: 'none' }}
                                    disabled={isComparisonDisabled}
                                  >
                                    {t('Compare', 'השווה')}
                                  </Button>
                                  <Button
                                    onClick={() => setAnalysisOpen(true)}
                                    size="small"
                                    variant="outlined"
                                    sx={{ height: 26, fontSize: '0.65rem', textTransform: 'none' }}
                                    disabled={isComparisonDisabled}
                                  >
                                    {t('Analysis', 'ניתוח')}
                                  </Button>
                                </>
                              )}
                            </Box>

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
                              <Box sx={{ overflowX: 'auto', maxWidth: '100%', scrollbarWidth: 'none', '::-webkit-scrollbar': { display: 'none' } }}>
                                <ToggleButtonGroup
                                  value={chartRange}
                                  exclusive
                                  onChange={(_, val) => {
                                    if (val === 'Custom') {
                                      setCustomRangeOpen(true);
                                    } else if (val) {
                                      setChartRange(val);
                                    }
                                  }}
                                  size="small"
                                  sx={{
                                    height: 28,
                                    bgcolor: 'action.hover',
                                    p: 0.5,
                                    borderRadius: 1.5,
                                    flexShrink: 0,
                                    '& .MuiToggleButton-root': {
                                      margin: 0,
                                      border: 0,
                                      borderRadius: '6px !important',
                                      px: 1,
                                      py: 0,
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      color: 'text.secondary',
                                    },
                                    '& .Mui-selected': {
                                      bgcolor: 'background.paper',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                      color: 'text.primary',
                                      '&:hover': { bgcolor: 'background.paper' },
                                    }
                                  }}
                                >
                                  {availableRanges.map(r => (
                                    <ToggleButton key={r} value={r}>
                                      {r === 'ALL' ? maxLabel : r}
                                    </ToggleButton>
                                  ))}
                                  <ToggleButton value="Custom" sx={{ px: 0.5 }}><DateRangeIcon sx={{ fontSize: '1rem' }} /></ToggleButton>
                                </ToggleButtonGroup>
                              </Box>
                            )}
                          </Box>
                          {chartView === 'holdings' && isComparison && (
                            <Alert severity="warning" variant="standard" sx={{ py: 0, px: 1, mb: 1, mt: 1, '& .MuiAlert-message': { py: 0.5, fontSize: '0.7rem' }, '& .MuiAlert-icon': { py: 0.5, fontSize: '1rem' } }}>
                              {t("Note: 'Holdings' view includes deposits/withdrawals which may skew analysis. Use 'TWR' for pure performance.", "שים לב: תצוגת 'החזקות' כוללת הפקדות/משיכות שעשויות לעוות את הניתוח. השתמש ב-'TWR' לביצועים נטו.")}
                            </Alert>
                          )}
                          {isComparison && (
                            <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ mb: 0 }}>
                              {comparisonSeries.map(s => (
                                <Chip
                                  key={s.name}
                                  label={s.name}
                                  size="small"
                                  onDelete={() => setComparisonSeries(prev => prev.filter(x => x.name !== s.name))}
                                  sx={{ fontSize: '0.65rem', color: s.color, borderColor: s.color, height: 20, '& .MuiChip-label': { paddingLeft: '6px', paddingRight: '6px', paddingTop: '2px' } }}
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      }
                    />
                    {/* Settings Menu for Mobile */}
                    <Menu anchorEl={settingsMenuAnchor} open={Boolean(settingsMenuAnchor)} onClose={() => setSettingsMenuAnchor(null)}>
                      {/* Unit Toggle */}
                      <MenuItem onClick={() => { setChartMetric(chartMetric === 'price' ? 'percent' : 'price'); setSettingsMenuAnchor(null); }} disabled={isComparison || chartView === 'twr' || chartView === 'gains'}>
                        <ListItemText primary={t('Show Percent', 'הצג אחוזים')} />
                        <Typography variant="caption" color="text.secondary">{chartMetric === 'percent' ? 'ON' : 'OFF'}</Typography>
                      </MenuItem>

                      {/* Scale Toggle */}
                      <MenuItem onClick={() => { setScaleType(scaleType === 'linear' ? 'log' : 'linear'); setSettingsMenuAnchor(null); }}>
                        <ListItemIcon><PieChartIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={t('Logarithmic Scale', 'סקאלה לוגריתמית')} secondary={scaleType === 'log' ? t('ON', 'פעיל') : t('OFF', 'כבוי')} />
                        {/* <Typography variant="caption" color="text.secondary">{scaleType === 'log' ? 'ON' : 'OFF'}</Typography> */}
                      </MenuItem>

                      <Divider />

                      {/* Trend Submenu Trigger or Simplified */}
                      <MenuItem onClick={(e) => { setTrendMenuAnchor(e.currentTarget); setSettingsMenuAnchor(null); }}>
                        <ListItemIcon><TrendLineIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={t('Trend Lines', 'קווי מגמה')} />
                      </MenuItem>

                      {/* Compare */}
                      <MenuItem onClick={(e) => { setCompareMenuAnchor(e.currentTarget); setSettingsMenuAnchor(null); }} disabled={isComparisonDisabled}>
                        <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
                        <ListItemText primary={t('Compare', 'השווה')} />
                      </MenuItem>

                      {/* Analysis */}
                      <MenuItem onClick={() => { setAnalysisOpen(true); setSettingsMenuAnchor(null); }} disabled={isComparisonDisabled}>
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

                    <Menu
                      anchorEl={compareMenuAnchor}
                      open={Boolean(compareMenuAnchor)}
                      onClose={() => setCompareMenuAnchor(null)}
                    >
                      {(() => {
                        let lastGroup = '';
                        return comparisonOptions.map((opt) => {
                          const showHeader = opt.group && opt.group !== lastGroup;
                          if (showHeader) lastGroup = opt.group!;

                          return [
                            showHeader && (
                              <Box key={`header - ${opt.group}`} sx={{ px: 2, py: 1, bgcolor: 'background.default', typography: 'caption', color: 'text.secondary', fontWeight: 'bold' }}>
                                {opt.group}
                              </Box>
                            ),
                            <MenuItem
                              key={opt.name}
                              onClick={() => {
                                handleSelectComparison(opt);
                                setCompareMenuAnchor(null);
                              }}
                              disabled={comparisonSeries.some(s => s.name === opt.name) || comparisonLoading[opt.name]}
                              sx={{ fontSize: '0.8125rem', minWidth: 120, pl: opt.group ? 3 : 2, minHeight: 32 }}
                              dense
                            >
                              {opt.icon === 'search' && (
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                  <QueryStatsIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
                                </ListItemIcon>
                              )}
                              {opt.icon && opt.icon !== 'search' && (
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                  {opt.icon === 'pie_chart' ? <PieChartIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /> :
                                    opt.icon === 'business_center' ? <BusinessCenterIcon fontSize="small" sx={{ fontSize: '1.1rem' }} /> :
                                      null}
                                </ListItemIcon>
                              )}
                              {opt.name}
                              {comparisonLoading[opt.name] && <CircularProgress size={12} sx={{ ml: 'auto', pl: 1 }} />}
                            </MenuItem>
                          ];
                        });
                      })()}
                    </Menu>
                  </Box>
                ) : (
                  <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                    <Typography variant="body2" color="text.secondary">{t('No historical data available for these holdings.', 'אין מידע היסטורי זמין עבור החזקות אלו.')}</Typography>
                  </Box>
                )}
              </Box>
            </Fade>
          )}
          <Box sx={{ display: activeStep === idxTop ? 'block' : 'none' }}>
            <Fade in={activeStep === idxTop} timeout={700}>
              <Box>
                <TopMovers holdings={[...holdings.filter(h => showClosed ? true : Math.abs(h.qtyTotal) > 1e-6), ...(favoriteHoldings || [])]} displayCurrency={displayCurrency} exchangeRates={exchangeRates} />
              </Box>
            </Fade>
          </Box>
          <Box sx={{ display: activeStep === idxMarket ? 'block' : 'none', height: isMobile ? 'auto' : '100%' }}>
            <Fade in={activeStep === idxMarket} timeout={700}>
              <Box>
                <MarketViewSummary isMobile={isMobile} isActive={activeStep === idxMarket} />
              </Box>
            </Fade>
          </Box>

          {hasRecent && (
            <Box sx={{ display: activeStep === idxRecent ? 'block' : 'none', height: isMobile ? 'auto' : '100%' }}>
              <Fade in={activeStep === idxRecent} timeout={700}>
                <Box sx={{ height: '100%' }}>
                  <RecentEventsCard
                    holdings={[...holdings, ...(favoriteHoldings || [])]}
                    transactions={transactions}
                    dividendRecords={dividendRecords}
                    boiTickerData={boiTickerData || undefined}
                  />
                </Box>
              </Fade>
            </Box>
          )}
          
          <Box sx={{ display: activeStep === idxTxns ? 'block' : 'none', height: isMobile ? 'auto' : '100%' }}>
            <Fade in={activeStep === idxTxns} timeout={700}>
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.5, color: 'text.secondary' }}>{t('All Transactions', 'כל הפעולות')}</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: '60vh', overflowY: 'auto', borderRadius: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <TableSortLabel active={txnSortConfig.key === 'date'} direction={txnSortConfig.key === 'date' ? txnSortConfig.direction : 'desc'} onClick={() => setTxnSortConfig({ key: 'date', direction: txnSortConfig.key === 'date' && txnSortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                            {t('Date', 'תאריך')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>{t('Type', 'סוג')}</TableCell>
                        <TableCell>{t('Ticker', 'סימול')}</TableCell>
                        <TableCell>
                          <TableSortLabel active={txnSortConfig.key === 'name'} direction={txnSortConfig.key === 'name' ? txnSortConfig.direction : 'desc'} onClick={() => setTxnSortConfig({ key: 'name', direction: txnSortConfig.key === 'name' && txnSortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                            {t('Name', 'שם')}
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">{t('Qty', 'כמות')}</TableCell>
                        <TableCell align="right">{t('Value', 'שווי')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedTransactionsData.map((row, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell>{row.ticker}</TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell align="right">{row.qty.toFixed(2)}</TableCell>
                          <TableCell align="right">{formatMoneyValue({ amount: row.value, currency: normalizeCurrency(displayCurrency) }, undefined)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Fade>
          </Box>
        </Box>

        {/* Mobile Pagination Indicator */}
        {isMobile && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 0.5, gap: 1 }}>
            {Array.from({ length: totalSteps }, (_, i) => i).map((step) => (
              <Box
                key={step}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveStep(step);
                  isManualRef.current = true;
                  startTimer(INTERACTION_STEP_DELAY);
                }}
                sx={{
                  width: activeStep === step ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  bgcolor: activeStep === step ? 'primary.main' : 'text.disabled',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                  opacity: activeStep === step ? 1 : 0.5
                }}
              />
            ))}
          </Box>
        )}

        {hasFutureTxns && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 1, mr: 2, mb: -1, fontSize: '0.7rem' }}>
            {t('Note: Some transactions with future dates exist and are not included in the calculations.', 'הערה: קיימות עסקאות עם תאריך עתידי שאינן נכללות בחישובים.')}
          </Typography>
        )}
      </Paper>
      <Dialog open={isSearchOpen} onClose={() => setIsSearchOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('Search to Compare', 'חפש להשוואה')}</DialogTitle>
        <DialogContent>
          <TickerSearch
            portfolios={portfolios}
            isPortfoliosLoading={isPortfoliosLoading}
            trackingLists={[]}
            onTickerSelect={handleTickerSearchSelect}
            sx={{ mt: 0, mb: 0 }}
          />
        </DialogContent>
      </Dialog>
      <AnalysisDialog
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        mainSeries={fullPortfolioSeries}
        comparisonSeries={comparisonSeries}
        title={`${t('Analysis', 'ניתוח')}: ${selectedPortfolio || t('Total Portfolio', 'כל התיקים')}`}
        initialRange={chartRange}
        currency={displayCurrency}
        subjectName={selectedPortfolio ? t('Portfolio', 'התיק') : t('All Portfolios', 'כל התיקים')}
        isHoldingsView={chartView === 'holdings'}
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

      <Dialog open={!!popupStat} onClose={() => setPopupStat(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {popupStat?.label}
          <IconButton
            aria-label="close"
            onClick={() => setPopupStat(null)}
            sx={{ color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === 'displayName'} direction={sortConfig.key === 'displayName' ? sortConfig.direction : 'desc'} onClick={() => setSortConfig({ key: 'displayName', direction: sortConfig.key === 'displayName' && sortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                      {t('Name', 'שם')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={sortConfig.key === 'ticker'} direction={sortConfig.key === 'ticker' ? sortConfig.direction : 'desc'} onClick={() => setSortConfig({ key: 'ticker', direction: sortConfig.key === 'ticker' && sortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                      {t('Ticker', 'סימול')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={sortConfig.key === 'marketValue'} direction={sortConfig.key === 'marketValue' ? sortConfig.direction : 'desc'} onClick={() => setSortConfig({ key: 'marketValue', direction: sortConfig.key === 'marketValue' && sortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                      {t('Value', 'שווי')}
                    </TableSortLabel>
                  </TableCell>
                  {getPopupData.some(r => r.metricPct !== undefined) && (
                    <TableCell align="right">
                      <TableSortLabel active={sortConfig.key === 'metricPct'} direction={sortConfig.key === 'metricPct' ? sortConfig.direction : 'desc'} onClick={() => setSortConfig({ key: 'metricPct', direction: sortConfig.key === 'metricPct' && sortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                        {popupStat?.label} %
                      </TableSortLabel>
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <TableSortLabel active={sortConfig.key === 'metricValue'} direction={sortConfig.key === 'metricValue' ? sortConfig.direction : 'desc'} onClick={() => setSortConfig({ key: 'metricValue', direction: sortConfig.key === 'metricValue' && sortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                      {popupStat?.label}
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getPopupData.map(row => (
                  <TableRow key={row.ticker} hover>
                    <TableCell>{row.displayName}</TableCell>
                    <TableCell>{row.ticker}</TableCell>
                    <TableCell align="right">{formatMoneyValue({ amount: row.display.marketValue, currency: normalizeCurrency(displayCurrency) }, undefined)}</TableCell>
                    {getPopupData.some(r => r.metricPct !== undefined) && (
                      <TableCell align="right">
                        {row.metricPct !== undefined && !isNaN(row.metricPct) && (
                          <Typography variant="body2" color={row.metricPct > 0 ? 'success.main' : row.metricPct < 0 ? 'error.main' : 'text.primary'}>
                            {row.metricPct > 0 ? '+' : ''}{formatPercent(row.metricPct)}
                          </Typography>
                        )}
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Typography variant="body2" color={row.metricValue > 0 ? 'success.main' : row.metricValue < 0 ? 'error.main' : 'text.primary'}>
                        {formatMoneyValue({ amount: row.metricValue, currency: normalizeCurrency(displayCurrency) }, undefined)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
      </Dialog>
    </>
  );
}
