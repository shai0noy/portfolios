import { Box, Paper, Typography, Grid, Tooltip, ToggleButton, ToggleButtonGroup, IconButton, CircularProgress, Button, Menu, MenuItem, Chip, ListItemIcon, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { formatMoneyValue, normalizeCurrency } from '../../lib/currencyUtils';
import { logIfFalsy } from '../../lib/utils';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import PieChartIcon from '@mui/icons-material/PieChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { type ExchangeRates, type DashboardHolding, type Portfolio, type Transaction } from '../../lib/types';
import { useLanguage } from '../../lib/i18n';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { TickerChart, type ChartSeries } from '../TickerChart';
import { calculatePortfolioPerformance, calculatePeriodReturns, type PerformancePoint, type PeriodReturns } from '../../lib/performance';
import { useChartComparison, getAvailableRanges, getMaxLabel, type ComparisonOption } from '../../lib/hooks/useChartComparison';
import { TickerSearch } from '../TickerSearch';
import type { TickerProfile } from '../../lib/types/ticker';
import { AnalysisDialog } from '../AnalysisDialog';
import type { DashboardSummaryData } from '../../lib/dashboard';
import { SummaryStat } from './SummaryStat';
import { PerformanceStat } from './PerformanceStat';
import { TopMovers } from './TopMovers';

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
}

/**
 * Main Dashboard Summary Component.
 * Displays:
 * 1. High-level Portfolio Stats (Value, Gains, etc.)
 * 2. Performance Chart (Holdings, TWR, Gains)
 * 3. Top Movers (Daily, Weekly, Monthly)
 * 
 * Supports "Stepping" through these 3 views automatically or manually.
 */
export function DashboardSummary({ summary, holdings, displayCurrency, exchangeRates, selectedPortfolio, portfolios, isPortfoliosLoading, transactions }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  const { t } = useLanguage();

  const [activeStep, setActiveStep] = useState(0);
  const [perfData, setPerfData] = useState<PerformancePoint[]>([]);
  const [simplePeriodReturns, setSimplePeriodReturns] = useState<PeriodReturns | null>(null);
  const [isPerfLoading, setIsPerfLoading] = useState(false);
  // Merged: Included 'twr' from Incoming
  const [chartView, setChartView] = useState<'holdings' | 'twr' | 'gains'>('holdings');
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
    // Trigger if we don't have perf data yet, regardless of activeStep (needed for summary stats now)
    if (holdings.length > 0 && perfData.length === 0 && !isPerfLoading && transactions && transactions.length > 0) {
      setIsPerfLoading(true);

      // Use passed transactions directly
      calculatePortfolioPerformance(holdings, transactions, displayCurrency, exchangeRates)
        .then(({ points }) => {
          setPerfData(points);

          // Calculate period returns directly from the performance points (consistent with chart)
          const periodReturns = calculatePeriodReturns(points);
          setSimplePeriodReturns(periodReturns);

          setIsPerfLoading(false);
        })
        .catch(e => {
          console.error("Perf Load Error", e);
          setIsPerfLoading(false);
        });
    }
  }, [holdings, displayCurrency, exchangeRates, transactions]);

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

    const clampedData = getClampedDataCallback(perfData, chartRange);
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
                <Typography variant="h4" fontWeight="bold" color="primary">{formatMoneyValue({ amount: summary.aum, currency: normalizeCurrency(displayCurrency) }, undefined)}</Typography>
              </Grid>
              <Grid item xs={12} md={9}>
                <Box display="flex" flexDirection="column" gap={2} alignItems="flex-end">
                  {/* Main Stats Row */}
                  <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <SummaryStat
                      label={t("Value After Tax", "שווי אחרי מס")}
                      value={summary.valueAfterTax}
                      pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
                      displayCurrency={displayCurrency}
                      showSign={false}
                    />
                    <SummaryStat
                      label={t("Unrealized Gain", "רווח לא ממומש")}
                      value={summary.totalUnrealized}
                      pct={summary.totalUnrealizedGainPct}
                      color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
                      displayCurrency={displayCurrency}
                    />
                    <SummaryStat
                      label={t("Realized Gain", "רווח ממומש")}
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
                        value={summary.totalUnvestedValue}
                        pct={summary.totalUnvestedGainPct}
                        gainValue={summary.totalUnvestedGain}
                        gainLabel={t("Unvested Gain", "רווח לא מובשל")}
                        displayCurrency={displayCurrency}
                      />
                    )}
                  </Box>

                  {/* Performance / Detail Row */}
                  <Box display="flex" gap={2} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <SummaryStat
                      label={t("1D", "יומי")}
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
                            percentage={simplePeriodReturns ? (simplePeriodReturns as any)[cfg.keyPct] : (summary as any)[cfg.keyPct]}
                            gainValue={simplePeriodReturns ? (simplePeriodReturns as any)[cfg.keyGain] : (cfg.fallbackGain ? (summary as any)[cfg.fallbackGain] : undefined)}
                            isLoading={isPortfoliosLoading && !simplePeriodReturns && (summary as any)[cfg.keyPct] === 0}
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
                        onChange={(_, val) => {
                          if (val) {
                            setChartView(val);
                            if (val === 'gains') {
                              setComparisonSeries([]);
                            }
                          }
                        }}
                        size="small"
                        sx={{ height: 26 }}
                      >
                        <ToggleButton value="holdings" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Holdings', 'החזקות')}</ToggleButton>
                        <ToggleButton value="twr" sx={{ px: 1, fontSize: '0.65rem' }}>{t('TWR', 'TWR')}</ToggleButton>
                        <ToggleButton value="gains" sx={{ px: 1, fontSize: '0.65rem' }}>{t('Gains', 'רווחים')}</ToggleButton>
                      </ToggleButtonGroup>

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
                        disabled={isComparisonDisabled}
                      >
                        {t('Compare', 'השווה')}
                      </Button>
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
                                      <SearchIcon fontSize="small" sx={{ fontSize: '1.1rem' }} />
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
                      <TickerChart
                        series={portfolioSeries}
                        currency={displayCurrency}
                        mode={effectiveChartMetric}
                        height="100%"
                        hideCurrentPrice={chartView === 'twr'}
                      />
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
