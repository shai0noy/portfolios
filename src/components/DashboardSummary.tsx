import { Box, Paper, Typography, Grid, Tooltip, ToggleButton, ToggleButtonGroup, IconButton, CircularProgress, Button, Menu, MenuItem, Chip, ListItemIcon, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { formatPercent, formatMoneyValue, normalizeCurrency, calculatePerformanceInDisplayCurrency, convertCurrency } from '../lib/currencyUtils';
import { MultiCurrencyValue } from '../lib/data/multiCurrency';
import { logIfFalsy, getValueColor } from '../lib/utils';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { type ExchangeRates, type DashboardHolding, type Portfolio, Currency, type Transaction } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TickerChart, type ChartSeries } from './TickerChart';
import { calculatePortfolioPerformance, type PerformancePoint, type PeriodReturns } from '../lib/performance';
import { useChartComparison, getAvailableRanges, getMaxLabel } from '../lib/hooks/useChartComparison';
import { TickerSearch } from './TickerSearch';
import type { TickerProfile } from '../lib/types/ticker';
import { AnalysisDialog } from './AnalysisDialog';
import type { DashboardSummaryData } from '../lib/dashboard';

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

interface StatProps {
    label: string;
    value: number;
    pct?: number;
    gainValue?: number; // Added
    gainLabel?: string; // Added
    color?: string;
    tooltip?: ReactNode;
    isMain?: boolean;
    size?: 'normal' | 'small';
    displayCurrency: string;
    showSign?: boolean;
}

const Stat = ({ label, value, pct, gainValue, gainLabel, color, tooltip, isMain = false, size = 'normal', displayCurrency, showSign = true }: StatProps) => {
    const isSmall = size === 'small';

    return (
        <Box textAlign="left" minWidth={isSmall ? 'auto' : 120}>
            <Box display="flex" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: isSmall ? '0.7rem' : '0.75rem' }}>{label}</Typography>
                {tooltip && (
                    <Tooltip title={tooltip} enterTouchDelay={0} leaveTouchDelay={3000}>
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
                {formatMoneyValue({ amount: value, currency: normalizeCurrency(displayCurrency) }, undefined)}
            </Typography>
            {(pct !== undefined && !isNaN(pct)) && (
                <Typography
                    variant="caption"
                    color={color || 'text.secondary'}
                    sx={{ opacity: color ? 1 : 0.7, fontSize: isSmall ? '0.7rem' : '0.75rem' }}
                >
                    {gainValue !== undefined ? (
                        <>
                            {gainLabel && <span>{gainLabel}: </span>}
                            {formatMoneyValue({ amount: gainValue, currency: normalizeCurrency(displayCurrency) }, undefined)} ({showSign && pct > 0 ? '+' : ''}{formatPercent(pct)})
                        </>
                    ) : (
                        <>{showSign && pct > 0 ? '+' : ''}{formatPercent(pct)}</>
                    )}
                </Typography>
            )}
        </Box>
    );
};

interface PerfStatProps {
    label: string;
    percentage?: number;
    gainValue?: number; // Added
    isIncomplete?: boolean;
    isLoading?: boolean;
    aum: number;
    displayCurrency: string;
    size?: 'normal' | 'small';
}

const PerfStat = ({ label, percentage, gainValue, isIncomplete, isLoading, aum, displayCurrency, size = 'normal' }: PerfStatProps) => {
    const { t } = useLanguage();

    if (isLoading) {
        return (
            <Box sx={{ p: size === 'small' ? 1 : 1.5, minWidth: size === 'small' ? 90 : 120 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                    {label}
                </Typography>
                <Box display="flex" justifyContent="flex-end">
                    <CircularProgress size={14} />
                </Box>
            </Box>
        );
    }

    const effectivePercentage = percentage || 0;

    // If percentage is undefined (and not loading), it implies no data
    if (percentage === undefined || isNaN(percentage)) {
        return <Stat label={label} value={0} pct={0} displayCurrency={displayCurrency} size={size} />;
    }

    let absoluteChange = 0;
    if (gainValue !== undefined) {
        absoluteChange = gainValue;
    } else {
    // Fallback to TWR derivation (only if gainValue not provided)
        const previousAUM = aum / (1 + effectivePercentage);
        absoluteChange = aum - previousAUM;
    }

    const color = getValueColor(effectivePercentage);

    return <Stat label={label} value={absoluteChange} pct={effectivePercentage} color={color} tooltip={isIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined} displayCurrency={displayCurrency} size={size} />;
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

        if (!holdings) {
            console.log('TopMovers: No holdings provided');
            return result;
        }

        console.log('TopMovers: Calculating movers for', holdings.length, 'holdings');
        if (holdings.length > 0) {
            console.log('TopMovers: Sample holding[0]:', {
                ticker: holdings[0].ticker,
                dayChangePct: holdings[0].dayChangePct,
                perf1w: holdings[0].perf1w,
                perf1m: holdings[0].perf1m,
                currentPrice: holdings[0].currentPrice,
                stockCurrency: holdings[0].stockCurrency,
                qtyTotal: holdings[0].qtyTotal,
                exchangeRatesKeys: Object.keys(exchangeRates || {}),
                displayCurrency
            });
        }

        const getChange = (h: DashboardHolding, period: TimePeriod) => {
            const perf = (() => {
                switch (period) {
                    case '1d': return h.dayChangePct;
                    case '1w': return h.perf1w;
                    case '1m': return h.perf1m;
                    default: return 0;
                }
            })();

            // Detailed log for first holding only for 1d
            if (h.ticker === holdings[0]?.ticker && period === '1d') {
                console.log('TopMovers: Calc for', h.ticker, period, { perf });
            }

            if (isNaN(perf) || perf === 0) return 0;

            const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, exchangeRates);

            if (h.ticker === holdings[0]?.ticker && period === '1d') {
                console.log('TopMovers: Result for', h.ticker, { changeVal, qtyTotal: h.qtyTotal, final: changeVal * h.qtyTotal });
            }

            return changeVal * h.qtyTotal;
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

    useEffect(() => {
        console.log('TopMovers result:', Object.keys(allMovers).map(k => `${k}: ${allMovers[k as TimePeriod].length}`));
    }, [allMovers]);

    const periodLabels = {
        '1d': t('Daily', 'יומי'),
        '1w': t('Weekly', 'שבועי'),
        '1m': t('Monthly', 'חודשי')
    };

    const MoverItem = ({ mover }: { mover: Mover }) => (
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
            <Tooltip title={mover.name} enterTouchDelay={0} leaveTouchDelay={3000}>
                <Typography variant="body2" fontWeight="500" noWrap>
                    {mover.ticker}
                </Typography>
            </Tooltip>
            <Box textAlign="right" sx={{ ml: 1 }}>
                <Typography variant="body2" color={mover.change >= 0 ? 'success.main' : 'error.main'} noWrap>
                    {formatMoneyValue({ amount: mover.change, currency: normalizeCurrency(displayCurrency) }, undefined)}
                    <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8 }}>
                        ({mover.pct > 0 ? '+' : ''}{formatPercent(mover.pct)})
                    </span>
                </Typography>
            </Box>
        </Box>
    );

    const MoversRow = ({ period, isLast }: { period: TimePeriod, isLast: boolean }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', py: 0.25, borderBottom: isLast ? 'none' : '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', textTransform: 'uppercase', minWidth: 60, mr: 0.5 }}>{periodLabels[period]}</Typography>
            {allMovers[period].length === 0 ? (
                <Box sx={{ textAlign: 'left', color: 'text.secondary', pl: 1 }}>
                    <Typography variant="caption">{t('No significant movers.', 'אין תנודות משמעותיות.')}</Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', overflowX: 'auto', py: 0.5, flex: 1 }}>
                        {allMovers[period].map(mover => <MoverItem key={`${mover.key}-${mover.holding.portfolioId}`} mover={mover} />)}
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

export function DashboardSummary({ summary, holdings, displayCurrency, exchangeRates, selectedPortfolio, portfolios, isPortfoliosLoading, transactions }: SummaryProps) {
    logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
    const { t } = useLanguage();

    const [activeStep, setActiveStep] = useState(0);
    const [perfData, setPerfData] = useState<PerformancePoint[]>([]);
    // periodReturns removed as unused
    const [simplePeriodReturns, setSimplePeriodReturns] = useState<PeriodReturns | null>(null);
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
        // Trigger if we don't have perf data yet, regardless of activeStep (needed for summary stats now)
        if (holdings.length > 0 && perfData.length === 0 && !isPerfLoading && transactions && transactions.length > 0) {
            setIsPerfLoading(true);

            // Use passed transactions directly
            calculatePortfolioPerformance(holdings, transactions, displayCurrency, exchangeRates)
                .then(({ points, historyMap }) => {
                    setPerfData(points);

                    // Helper to aggregate simple gain
                    const calcSimple = (period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y' | 'all') => {
                        let startDate = new Date();
                        switch (period) {
                            case '1w': startDate.setDate(startDate.getDate() - 7); break;
                            case '1m': startDate.setMonth(startDate.getMonth() - 1); break;
                            case '3m': startDate.setMonth(startDate.getMonth() - 3); break;
                            case 'ytd': startDate = new Date(new Date().getFullYear(), 0, 1); break;
                            case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break;
                            case '5y': startDate.setFullYear(startDate.getFullYear() - 5); break;
                            case 'all': startDate = new Date(0); break;
                        }

                        const aggGain = new MultiCurrencyValue(0, 0);
                        const aggInitial = new MultiCurrencyValue(0, 0);

                        holdings.forEach(h => {
                            // We need a history provider wrapper for the map
                            const provider = (ticker: string) => historyMap.get(`${h.exchange}:${ticker}`);
                            // We need Exchange Rates
                            if (h.generateGainForPeriod) {
                                const res = h.generateGainForPeriod(startDate, provider, exchangeRates);
                                aggGain.valUSD += res.gain.valUSD;
                                aggGain.valILS += res.gain.valILS;
                                aggInitial.valUSD += res.initialValue.valUSD;
                                aggInitial.valILS += res.initialValue.valILS;
                            }
                        });

                        // Convert final agg to display currency for percentage
                        // Gain Pct = Gain / Initial
                        const gainDisplay = convertCurrency(aggGain.valUSD, Currency.USD, displayCurrency, exchangeRates);
                        const initialDisplay = convertCurrency(aggInitial.valUSD, Currency.USD, displayCurrency, exchangeRates);

                        const perf = initialDisplay !== 0 ? gainDisplay / initialDisplay : 0;
                        const gainVal = gainDisplay;

                        return { perf, gain: gainVal };
                    };

                    const s1w = calcSimple('1w');
                    const s1m = calcSimple('1m');
                    const s3m = calcSimple('3m');
                    const sYtd = calcSimple('ytd');
                    const s1y = calcSimple('1y');
                    const s5y = calcSimple('5y');
                    const sAll = calcSimple('all');

                    setSimplePeriodReturns({
                        perf1w: s1w.perf, gain1w: s1w.gain,
                        perf1m: s1m.perf, gain1m: s1m.gain,
                        perf3m: s3m.perf, gain3m: s3m.gain,
                        perfYtd: sYtd.perf, gainYtd: sYtd.gain,
                        perf1y: s1y.perf, gain1y: s1y.gain,
                        perf5y: s5y.perf, gain5y: s5y.gain,
                        perfAll: sAll.perf, gainAll: sAll.gain
                    });

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
                                <Typography variant="h4" fontWeight="bold" color="primary">{formatMoneyValue({ amount: summary.aum, currency: normalizeCurrency(displayCurrency) }, undefined)}</Typography>
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
                                            showSign={false}
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
                                            <Stat
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
                                        <Stat
                                            label={t("1D", "יומי")}
                                            value={summary.totalDayChange}
                                            pct={summary.totalDayChangePct}
                                            color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}
                                            tooltip={summary.totalDayChangeIsIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined}
                                            displayCurrency={displayCurrency}
                                            size="small"
                                        />

                                        <PerfStat label={t("1W", "שבוע")} percentage={simplePeriodReturns ? simplePeriodReturns.perf1w : summary.perf1w} gainValue={simplePeriodReturns ? simplePeriodReturns.gain1w : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perf1w === 0} isIncomplete={summary.perf1w_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("1M", "חודש")} percentage={simplePeriodReturns ? simplePeriodReturns.perf1m : summary.perf1m} gainValue={simplePeriodReturns ? simplePeriodReturns.gain1m : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perf1m === 0} isIncomplete={summary.perf1m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("3M", "3 חודשים")} percentage={simplePeriodReturns ? simplePeriodReturns.perf3m : summary.perf3m} gainValue={simplePeriodReturns ? simplePeriodReturns.gain3m : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perf3m === 0} isIncomplete={summary.perf3m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("YTD", "מתחילת שנה")} percentage={simplePeriodReturns ? simplePeriodReturns.perfYtd : summary.perfYtd} gainValue={simplePeriodReturns ? simplePeriodReturns.gainYtd : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perfYtd === 0} isIncomplete={summary.perfYtd_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("1Y", "שנה")} percentage={simplePeriodReturns ? simplePeriodReturns.perf1y : summary.perf1y} gainValue={simplePeriodReturns ? simplePeriodReturns.gain1y : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perf1y === 0} isIncomplete={summary.perf1y_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("5Y", "5 שנים")} percentage={simplePeriodReturns ? simplePeriodReturns.perf5y : summary.perf5y} gainValue={simplePeriodReturns ? simplePeriodReturns.gain5y : undefined} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perf5y === 0} isIncomplete={summary.perf5y_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                                        <PerfStat label={t("ALL", "הכל")} percentage={simplePeriodReturns ? simplePeriodReturns.perfAll : summary.perfAll} gainValue={simplePeriodReturns ? simplePeriodReturns.gainAll : summary.totalReturn} isLoading={isPortfoliosLoading && !simplePeriodReturns && summary.perfAll === 0} isIncomplete={summary.perfAll_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
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

                                            <Tooltip
                                                enterTouchDelay={0}
                                                leaveTouchDelay={3000}
                                                title={chartView === 'holdings'
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
