import { Box, Paper, Typography, Grid, Tooltip, ToggleButton, ToggleButtonGroup, IconButton, CircularProgress, Button, Menu, MenuItem, Chip, ListItemIcon, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { formatPercent, formatValue, calculatePerformanceInDisplayCurrency } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import type { ExchangeRates, DashboardHolding, Portfolio } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TickerChart, type ChartSeries } from './TickerChart';
import { calculatePortfolioPerformance, type PerformancePoint } from '../lib/performance';
import { fetchTransactions } from '../lib/sheets';
import { useChartComparison, getAvailableRanges, getMaxLabel } from '../lib/hooks/useChartComparison';
import { TickerSearch } from './TickerSearch';
import type { TickerProfile } from '../lib/types/ticker';
import { AnalysisDialog } from './AnalysisDialog';

// Time constants for auto-stepping
const AUTO_STEP_DELAY = 2 * 60 * 1000; // 2 minutes
const INTERACTION_STEP_DELAY = 8 * 60 * 1000; // 8 minutes

interface SummaryProps {
  summary: {
    aum: number;
    totalUnrealized: number;
    totalUnrealizedGainPct: number;
    totalRealized: number;
    totalRealizedGainPct: number;
    totalCostOfSold: number;
    totalDividends: number;
    totalReturn: number;
    realizedGainAfterTax: number;
    valueAfterTax: number;

    totalDayChange: number;
    totalDayChangePct: number;
    totalDayChangeIsIncomplete: boolean;
    perf1w: number;
    perf1w_incomplete: boolean;
    perf1m: number;
    perf1m_incomplete: boolean;
    perf3m: number;
    perf3m_incomplete: boolean;
    perf1y: number;
    perf1y_incomplete: boolean;
    perf3y: number;
    perf3y_incomplete: boolean;
    perf5y: number;
    perf5y_incomplete: boolean;
    perfYtd: number;
    perfYtd_incomplete: boolean;
  };
  holdings: DashboardHolding[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  selectedPortfolio: string | null;
  sheetId: string;
  portfolios: Portfolio[];
  isPortfoliosLoading: boolean;
}

interface StatProps {
  label: string;
  value: number;
  pct?: number;
  color?: string;
  tooltip?: string;
  isMain?: boolean;
  size?: 'normal' | 'small';
  displayCurrency: string;
}

const Stat = ({ label, value, pct, color, tooltip, isMain = false, size = 'normal', displayCurrency }: StatProps) => {
  const isSmall = size === 'small';
  
  return (
      <Box textAlign="left" minWidth={isSmall ? 'auto' : 120}>
          <Box display="flex" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: isSmall ? '0.7rem' : '0.75rem' }}>{label}</Typography>
              {tooltip && (
                  <Tooltip title={tooltip}>
                      <InfoOutlinedIcon sx={{ fontSize: '0.9rem', ml: 0.5, color: 'text.secondary' }} />
                  </Tooltip>
              )}
          </Box>
          <Typography 
              variant={isMain ? "h4" : (isSmall ? "body2" : "h6")} 
              fontWeight={isMain ? "bold" : "medium"} 
              color={color || 'text.primary'}
              lineHeight={isSmall ? 1.2 : undefined}
          >
              {formatValue(value, displayCurrency, isMain ? 0 : 2)}
          </Typography>
          {(pct !== undefined && !isNaN(pct)) && (
              <Typography 
                  variant="caption" 
                  color={color || 'text.secondary'} 
                  sx={{ opacity: color ? 1 : 0.7, fontSize: isSmall ? '0.7rem' : '0.75rem' }}
              >
                  {pct > 0 ? '+' : ''}{formatPercent(pct)}
              </Typography>
          )}
      </Box>
  );
};

interface PerfStatProps {
  label: string;
  percentage: number;
  isIncomplete: boolean;
  aum: number;
  displayCurrency: string;
  size?: 'normal' | 'small';
}

const PerfStat = ({ label, percentage, isIncomplete, aum, displayCurrency, size = 'normal' }: PerfStatProps) => {
  const { t } = useLanguage(); // Hook for translation
  if (percentage === 0 || isNaN(percentage)) {
      return <Stat label={label} value={0} pct={0} displayCurrency={displayCurrency} size={size} />;
  }

  const previousAUM = aum / (1 + percentage);
  const absoluteChange = aum - previousAUM;
  const color = percentage >= 0 ? 'success.main' : 'error.main';
  
  return <Stat label={label} value={absoluteChange} pct={percentage} color={color} tooltip={isIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined} displayCurrency={displayCurrency} size={size} />;
}

type TimePeriod = '1d' | '1w' | '1m';

interface Mover {
  key: string;
  name: string;
  ticker: string;
  change: number;
  pct: number;
  exchange: string;
  holding: DashboardHolding;
}

const TopMovers = ({ holdings, displayCurrency, exchangeRates }: { holdings: DashboardHolding[], displayCurrency: string, exchangeRates: ExchangeRates }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'change' | 'pct'>('change');

  const allMovers = useMemo(() => {
    const periods: TimePeriod[] = ['1d', '1w', '1m'];
    const result: Record<TimePeriod, Mover[]> = { '1d': [], '1w': [], '1m': [] };

    if (!holdings) return result;

    const getChange = (h: DashboardHolding, period: TimePeriod) => {
      const perf = (() => {
        switch (period) {
          case '1d': return h.dayChangePct;
          case '1w': return h.perf1w;
          case '1m': return h.perf1m;
          default: return 0;
        }
      })();

      if (isNaN(perf) || perf === 0) return 0;
      
      const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, exchangeRates);
      return changeVal * h.totalQty;
    };
    
    const getPct = (h: DashboardHolding, period: TimePeriod) => {
        switch (period) {
            case '1d': return h.dayChangePct;
            case '1w': return h.perf1w;
            case '1m': return h.perf1m;
            default: return 0;
        }
    }

    for (const period of periods) {
        result[period] = holdings
            .map(h => ({
                key: h.key,
                name: h.displayName,
                ticker: h.ticker,
                change: getChange(h, period),
                pct: getPct(h, period),
                exchange: h.exchange,
                holding: h
            }))
            .filter(h => h.change !== 0 && !isNaN(h.change))
            .sort((a, b) => {
                if (sortBy === 'pct') {
                    return Math.abs(b.pct) - Math.abs(a.pct);
                }
                return Math.abs(b.change) - Math.abs(a.change);
            })
            .slice(0, 6);
    }
    return result;

  }, [holdings, displayCurrency, exchangeRates, t, sortBy]);

  const periodLabels = {
    '1d': t('Daily', 'יומי'),
    '1w': t('Weekly', 'שבועי'),
    '1m': t('Monthly', 'חודשי')
  };

  const MoverItem = ({mover}: {mover: Mover}) => (
    <Box 
      onClick={() => navigate(`/ticker/${mover.exchange.toUpperCase()}/${mover.ticker}`, { state: { holding: mover.holding, from: '/dashboard' } })}
      sx={{ 
        px: 1, py: 0.25, 
        border: '1px solid', borderColor: 'divider', borderRadius: 2, 
        mr: 0.5, 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        '&:hover': { bgcolor: 'action.hover' }
      }}
    >
        <Tooltip title={mover.name}>
            <Typography variant="body2" fontWeight="500" noWrap>
                {mover.ticker}
            </Typography>
        </Tooltip>
        <Box textAlign="right" sx={{ ml: 1 }}>
            <Typography variant="body2" color={mover.change >= 0 ? 'success.main' : 'error.main'} noWrap>
                {formatValue(mover.change, displayCurrency, 0)}
                <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8 }}>
                    ({mover.pct > 0 ? '+' : ''}{formatPercent(mover.pct)})
                </span>
            </Typography>
        </Box>
    </Box>
  );

  const MoversRow = ({period, isLast}: {period: TimePeriod, isLast: boolean}) => (
      <Box sx={{ display: 'flex', alignItems: 'center', py: 0.25, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase', minWidth: 60, mr: 0.5 }}>{periodLabels[period]}</Typography>
          {allMovers[period].length === 0 ? (
              <Box sx={{textAlign: 'left', color: 'text.secondary', pl: 1}}>
                   <Typography variant="caption">{t('No significant movers.', 'אין תנודות משמעותיות.')}</Typography>
              </Box>
          ) : (
            <Box sx={{ display: 'flex', overflowX: 'auto', py: 0.5, flex: 1 }}>
                {allMovers[period].map(mover => <MoverItem key={mover.key} mover={mover} />)}
            </Box>
          )}
      </Box>
  );

  return (
    <Box sx={{ p: 0.5 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5} px={0.5}>
        <Typography variant="subtitle2" color="text.secondary">{t('Top Movers', 'המניות הבולטות')}</Typography>
        <Box display="flex" alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}>{t('Sort by:', 'מיין לפי:')}</Typography>
          <ToggleButtonGroup
            value={sortBy}
            exclusive
            size="small"
            onChange={(_, newSortBy) => { if (newSortBy) setSortBy(newSortBy as 'change' | 'pct'); }}
            aria-label="Sort by"
          >
            <ToggleButton value="change" sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }} aria-label="Sort by value">{t('Value', 'ערך')}</ToggleButton>
            <ToggleButton value="pct" sx={{ px: 1, fontSize: '0.7rem', textTransform: 'none' }} aria-label="Sort by percentage">{t('%', '%')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
      <Box>
        {(['1d', '1w', '1m'] as TimePeriod[]).map((period, index, arr) => (
            <MoversRow key={period} period={period} isLast={index === arr.length - 1} />
        ))}
      </Box>
    </Box>
  );
};

export function DashboardSummary({ summary, holdings, displayCurrency, exchangeRates, selectedPortfolio, sheetId, portfolios, isPortfoliosLoading }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  const { t } = useLanguage();
  
  const [activeStep, setActiveStep] = useState(0);
  const [perfData, setPerfData] = useState<PerformancePoint[]>([]);
  const [isPerfLoading, setIsPerfLoading] = useState(false);
  const [chartView, setChartView] = useState<'holdings' | 'gains'>('holdings');
  const [chartMetric, setChartMetric] = useState<'price' | 'percent'>('price');
  
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

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRef = useRef(false);

  // Timer logic
  const startTimer = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
        setActiveStep(prev => (prev + 1) % 3);
    }, delay);
  }, []);

  const handleTickerSearchSelect = (ticker: TickerProfile) => {
    handleSelectComparison({
      ticker: ticker.symbol,
      exchange: ticker.exchange,
      name: ticker.name,
    });
    setIsSearchOpen(false);
  };

  useEffect(() => {
    const delay = isManualRef.current ? INTERACTION_STEP_DELAY : AUTO_STEP_DELAY;
    isManualRef.current = false;
    startTimer(delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeStep, startTimer]);

  useEffect(() => {
      if (activeStep === 1 && perfData.length === 0 && !isPerfLoading) {
          setIsPerfLoading(true);
          fetchTransactions(sheetId).then(txns => {
              calculatePortfolioPerformance(holdings, txns, displayCurrency, exchangeRates)
                  .then(data => {
                      setPerfData(data);
                      setIsPerfLoading(false);
                  });
          }).catch(() => setIsPerfLoading(false));
      }
  }, [activeStep, holdings, displayCurrency, exchangeRates, sheetId]);

  const handleManualStep = (direction: 'next' | 'prev') => {
    isManualRef.current = true;
    setActiveStep(prev => {
        if (direction === 'next') return (prev + 1) % 3;
        return (prev - 1 + 3) % 3;
    });
  };

  const handleInteraction = () => {
    // Reset timer to long delay without changing step
    startTimer(INTERACTION_STEP_DELAY);
  };

  const getClampedDataCallback = useCallback((data: any[] | null, range: string) => {
      // Use the hook's logic but adapt for performance points
      return getClampedData(data, range);
  }, [getClampedData]);

  const isComparison = comparisonSeries.length > 0;
  const effectiveChartMetric = isComparison ? 'percent' : chartMetric;
  
  const oldestDate = useMemo(() => perfData.length > 0 ? perfData[0].date : undefined, [perfData]);
  const availableRanges = useMemo(() => getAvailableRanges(oldestDate), [oldestDate]);
  const maxLabel = useMemo(() => getMaxLabel(oldestDate), [oldestDate]);

  const portfolioSeries = useMemo<ChartSeries[]>(() => {
      if (perfData.length === 0) return [];
      
      const clampedData = getClampedDataCallback(perfData, chartRange);
      if (clampedData.length === 0) return [];

      const mainData = clampedData.map(p => {
          let val = 0;
          if (chartView === 'holdings') {
              val = p.holdingsValue;
          } else {
              // For Gains view:
              // If metric is percent (effectiveChartMetric), use TWR index.
              // TickerChart in percent mode normalizes relative to start, so TWR works perfectly.
              // If metric is price ($), use absolute gainsValue.
              val = effectiveChartMetric === 'percent' ? p.twr : p.gainsValue;
          }
          return {
              date: p.date,
              price: val
          };
      });

      const series: ChartSeries[] = [{
          name: chartView === 'holdings' ? t('Total Holdings', 'שווי החזקות') : t('Total Gains', 'רווח מצטבר'),
          data: mainData
      }];

      comparisonSeries.forEach(s => {
          series.push({
              ...s,
              data: getClampedData(s.data, chartRange, oldestDate)
          });
      });

      return series;
  }, [perfData, chartView, chartRange, comparisonSeries, getClampedDataCallback, getClampedData, t, effectiveChartMetric, oldestDate]);

  const fullPortfolioSeries = useMemo<ChartSeries | null>(() => {
      if (perfData.length === 0) return null;
      const data = perfData.map(p => {
          let val = 0;
          if (chartView === 'holdings') {
              val = p.holdingsValue;
          } else {
              // For Gains analysis, we usually care about the return, so TWR is appropriate if we want to compare performance.
              // However, user might be in Price mode.
              // But for "Analysis" (Alpha/Beta), we generally compare % returns, so TWR is the correct metric to compare against a benchmark index.
              val = p.twr;
          }
          return { date: p.date, price: val };
      });
      return {
          name: chartView === 'holdings' ? t('Total Holdings', 'שווי החזקות') : t('Total Gains', 'רווח מצטבר'),
          data
      };
  }, [perfData, chartView, t]);

  return (
    <>
    <Paper 
        variant="outlined" 
        sx={{ p: 3, mb: 4, position: 'relative' }} 
        onClick={handleInteraction}
    >
      {/* Navigation Buttons */}
      <IconButton 
         onClick={(e) => { e.stopPropagation(); handleManualStep('prev'); }}
         sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
         size="small"
      >
         <ChevronLeftIcon />
      </IconButton>
       
      <IconButton 
         onClick={(e) => { e.stopPropagation(); handleManualStep('next'); }}
         sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
         size="small"
      >
         <ChevronRightIcon />
      </IconButton>

      <Box sx={{ px: 4 }}>
        {activeStep === 0 && (
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              {!selectedPortfolio && (
                <Typography variant="subtitle2" color="text.secondary">{t('TOTAL VALUE', 'שווי כולל')}</Typography>
              )}
              {selectedPortfolio && (
                <Typography variant="h5" fontWeight="bold" color="primary">{selectedPortfolio}</Typography>
              )}
              <Typography variant="h4" fontWeight="bold" color="primary">{formatValue(summary.aum, displayCurrency, 0)}</Typography>
            </Grid>
            <Grid item xs={12} md={9}>
              <Box display="flex" flexDirection="column" gap={2} alignItems="flex-end">
                  {/* Main Stats Row */}
                  <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <Stat 
                        label={t("Value After Tax", "שווי אחרי מס")}
                        value={summary.valueAfterTax}
                        pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
                        displayCurrency={displayCurrency}
                    />
                    <Stat 
                        label={t("Unrealized Gain", "רווח לא ממומש")}
                        value={summary.totalUnrealized}
                        pct={summary.totalUnrealizedGainPct}
                        color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
                        displayCurrency={displayCurrency}
                    />
                    <Stat 
                        label={t("Realized Gain", "רווח ממומש")}
                        value={summary.totalRealized}
                        pct={summary.totalRealizedGainPct}
                        color={summary.totalRealized >= 0 ? 'success.main' : 'error.main'}
                        displayCurrency={displayCurrency}
                    />
                  </Box>

                  {/* Performance / Detail Row */}
                  <Box display="flex" gap={2} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <Stat
                        label={t("1D", "יומי")}
                        value={summary.totalDayChange}
                        pct={summary.totalDayChangePct}
                        color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}
                        tooltip={summary.totalDayChangeIsIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined}
                        displayCurrency={displayCurrency}
                        size="small"
                    />
                    
                    <PerfStat label={t("1W", "שבוע")} percentage={summary.perf1w} isIncomplete={summary.perf1w_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("1M", "חודש")} percentage={summary.perf1m} isIncomplete={summary.perf1m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("3M", "3 חודשים")} percentage={summary.perf3m} isIncomplete={summary.perf3m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("YTD", "מתחילת שנה")} percentage={summary.perfYtd} isIncomplete={summary.perfYtd_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("1Y", "שנה")} percentage={summary.perf1y} isIncomplete={summary.perf1y_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                  </Box>
              </Box>
            </Grid>
          </Grid>
        )}
        {activeStep === 1 && (
            <Box sx={{ height: 210, position: 'relative' }}>
                {isPerfLoading ? (
                    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={1}>
                        <CircularProgress size={30} />
                        <Typography variant="caption" color="text.secondary">{t('Calculating Portfolio Performance...', 'מחשב ביצועי תיק...')}</Typography>
                    </Box>
                ) : portfolioSeries.length > 0 ? (
                    <Box sx={{ height: '100%', mt: -1 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1, px: 2, flexWrap: 'wrap', gap: 1 }}>
                            <Box display="flex" gap={1} alignItems="center">
                                <ToggleButtonGroup
                                    value={chartView}
                                    exclusive
                                    onChange={(_, val) => val && setChartView(val)}
                                    size="small"
                                    sx={{ height: 26 }}
                                >
                                    <ToggleButton value="holdings" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Holdings', 'החזקות')}</ToggleButton>
                                    <ToggleButton value="gains" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Gains', 'רווחים')}</ToggleButton>
                                </ToggleButtonGroup>
                                
                                <Tooltip title={chartView === 'holdings' 
                                    ? t("Market Value over time. Tracks the total worth of your portfolio assets.", "שווי שוק לאורך זמן. עוקב אחר השווי הכולל של הנכסים בתיק.")
                                    : t("Total Return over time. Tracks Realized + Unrealized Gains, Dividends, and Fees. Uses TWR (Time-Weighted Return) for percentage mode to filter out deposits/withdrawals.", "תשואה כוללת לאורך זמן. עוקב אחר רווחים ממומשים + לא ממומשים, דיבידנדים ועמלות. משתמש ב-TWR (תשואה משוקללת זמן) במצב אחוזים לנטרול הפקדות/משיכות.")}
                                >
                                    <InfoOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.secondary', cursor: 'help' }} />
                                </Tooltip>

                                <ToggleButtonGroup
                                    value={effectiveChartMetric}
                                    exclusive
                                    onChange={(_, val) => val && setChartMetric(val)}
                                    size="small"
                                    sx={{ height: 26 }}
                                    disabled={isComparison}
                                >
                                    <ToggleButton value="price" sx={{ px: 1, fontSize: '0.65rem' }}>$</ToggleButton>
                                    <ToggleButton value="percent" sx={{ px: 1, fontSize: '0.65rem' }}>%</ToggleButton>
                                </ToggleButtonGroup>
                            </Box>

                            <ToggleButtonGroup
                                value={chartRange}
                                exclusive
                                onChange={(_, val) => val && setChartRange(val)}
                                size="small"
                                sx={{ height: 26 }}
                            >
                                {availableRanges.map(r => (
                                    <ToggleButton key={r} value={r} sx={{ px: 0.8, fontSize: '0.65rem' }}>{r === 'ALL' ? maxLabel : r}</ToggleButton>
                                ))}
                            </ToggleButtonGroup>

                            <Box>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon sx={{ fontSize: '1rem !important' }} />}
                                    onClick={(e) => setCompareMenuAnchor(e.currentTarget)}
                                    sx={{ height: 26, fontSize: '0.65rem', textTransform: 'none' }}
                                >
                                    {t('Compare', 'השווה')}
                                </Button>
                                <Menu
                                    anchorEl={compareMenuAnchor}
                                    open={Boolean(compareMenuAnchor)}
                                    onClose={() => setCompareMenuAnchor(null)}
                                >
                                    {comparisonOptions.map((opt) => (
                                        <MenuItem 
                                            key={opt.name} 
                                            onClick={() => {
                                                handleSelectComparison(opt);
                                                setCompareMenuAnchor(null);
                                            }}
                                            disabled={comparisonSeries.some(s => s.name === opt.name) || comparisonLoading[opt.name]}
                                            sx={{ fontSize: '0.8rem', minWidth: 120 }}
                                        >
                                            {opt.icon === 'search' && (
                                                <ListItemIcon>
                                                    <SearchIcon fontSize="small" />
                                                </ListItemIcon>
                                            )}
                                            {opt.name}
                                            {comparisonLoading[opt.name] && <CircularProgress size={12} sx={{ ml: 'auto', pl: 1 }} />}
                                        </MenuItem>
                                    ))}
                                </Menu>
                                <Button 
                                    onClick={() => setAnalysisOpen(true)} 
                                    size="small" 
                                    variant="outlined"
                                    sx={{ height: 26, fontSize: '0.65rem', textTransform: 'none', ml: 0.5 }}
                                >
                                    {t('Analysis', 'ניתוח')}
                                </Button>
                            </Box>
                        </Box>
                        
                        {isComparison && (
                            <Box display="flex" flexWrap="wrap" gap={0.5} sx={{ px: 2, mb: 1 }}>
                                {comparisonSeries.map(s => (
                                    <Chip 
                                        key={s.name} 
                                        label={s.name} 
                                        size="small" 
                                        onDelete={() => setComparisonSeries(prev => prev.filter(x => x.name !== s.name))}
                                        sx={{ fontSize: '0.65rem', color: s.color, borderColor: s.color }}
                                        variant="outlined"
                                    />
                                ))}
                            </Box>
                        )}

                        <Box sx={{ height: isComparison ? 120 : 140 }}>
                            <TickerChart series={portfolioSeries} currency={displayCurrency} mode={effectiveChartMetric} height="100%" />
                        </Box>
                    </Box>
                ) : (
                    <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                        <Typography variant="body2" color="text.secondary">{t('No historical data available for these holdings.', 'אין מידע היסטורי זמין עבור החזקות אלו.')}</Typography>
                    </Box>
                )}
            </Box>
        )}
        {activeStep === 2 && (
            <TopMovers holdings={holdings} displayCurrency={displayCurrency} exchangeRates={exchangeRates} />
        )}
      </Box>
    </Paper>
    <Dialog open={isSearchOpen} onClose={() => setIsSearchOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>{t('Search to Compare', 'חפש להשוואה')}</DialogTitle>
      <DialogContent>
        <TickerSearch
          portfolios={portfolios}
          isPortfoliosLoading={isPortfoliosLoading}
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
    />
    </>
  );
}
