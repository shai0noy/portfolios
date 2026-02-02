import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box, Typography, ToggleButton, ToggleButtonGroup, Tooltip, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';
import { useMemo, useState, useEffect } from 'react';
import { synchronizeSeries, synchronizeThreeSeries, computeAnalysisMetrics, normalizeToStart, calculateReturns, type AnalysisMetrics } from '../lib/utils/analysis';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { fetchTickerHistory } from '../lib/fetching';
import { Exchange } from '../lib/types';
import { useTheme } from '@mui/material/styles';
import { DARK_COLORS, LIGHT_COLORS } from '../lib/hooks/useChartComparison';

interface AnalysisDialogProps {
    open: boolean;
    onClose: () => void;
    mainSeries: ChartSeries | null;
    comparisonSeries: ChartSeries[];
    title?: string;
    subjectName?: string;
}

const DEFAULT_BENCHMARKS = [
    { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
    { ticker: '137', exchange: Exchange.TASE, name: 'Tel Aviv 125' }
];

const RISK_FREE_TICKERS = {
    US: { ticker: '^IRX', exchange: Exchange.NYSE, name: 'US T-Bills (13W Yield)' },
    IL: { ticker: 'TCH-F91.TA', exchange: Exchange.TASE, name: 'IL Makam (Treasury Bill)' }
};

function filterDataByRange(data: { date: Date, price: number }[], range: string, minDate?: Date) {
    if (!data || data.length === 0) return [];
    
    let startDate: Date;
    const now = new Date();

    if (range === 'ALL') {
        if (!minDate) return data;
        startDate = new Date(minDate);
    } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        switch (range) {
            case '1M': startDate.setMonth(now.getMonth() - 1); break;
            case '3M': startDate.setMonth(now.getMonth() - 3); break;
            case '6M': startDate.setMonth(now.getMonth() - 6); break;
            case 'YTD': startDate.setFullYear(now.getFullYear(), 0, 1); break;
            case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
            case '3Y': startDate.setFullYear(now.getFullYear() - 3); break;
            case '5Y': startDate.setFullYear(now.getFullYear() - 5); break;
            default: return data;
        }
    }
    
    return data.filter(d => d.date.getTime() >= startDate.getTime());
}

interface ExtendedAnalysisMetrics extends AnalysisMetrics {
    activeReturn: number;
}

export function AnalysisDialog({ open, onClose, mainSeries, comparisonSeries, title }: AnalysisDialogProps) {
    const { t } = useLanguage();
    const theme = useTheme();
    const [range, setRange] = useState('1Y');
    const [extraSeries, setExtraSeries] = useState<ChartSeries[]>([]);
    const [riskFreeType, setRiskFreeType] = useState<'US' | 'IL'>('US');
    const [riskFreeSeries, setRiskFreeSeries] = useState<ChartSeries | null>(null);

    const EXTRA_COLORS = useMemo(() => {
        return theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    }, [theme.palette.mode]);

    // Fetch Risk Free Series
    useEffect(() => {
        if (!open) return;
        const fetchRF = async () => {
            const rf = RISK_FREE_TICKERS[riskFreeType];
            try {
                const historyResponse = await fetchTickerHistory(rf.ticker, rf.exchange);
                if (historyResponse?.historical) {
                    setRiskFreeSeries({
                        name: rf.name,
                        data: historyResponse.historical,
                        color: '#000000' // Unused
                    });
                }
            } catch (e) {
                console.warn('Failed to fetch Risk Free', e);
            }
        };
        fetchRF();
    }, [open, riskFreeType]);

    useEffect(() => {
        if (!open) return;

        const loadDefaults = async () => {
            const newExtras: ChartSeries[] = [];
            const existingNames = new Set(comparisonSeries.map(s => s.name));
            const loadedNames = new Set(extraSeries.map(s => s.name));

            for (const bench of DEFAULT_BENCHMARKS) {
                if (!existingNames.has(bench.name) && !loadedNames.has(bench.name)) {
                    try {
                        const historyResponse = await fetchTickerHistory(bench.ticker, bench.exchange);
                        if (historyResponse?.historical) {
                            const usedColors = new Set(comparisonSeries.map(s => s.color).filter(Boolean));
                            newExtras.forEach(s => { if (s.color) usedColors.add(s.color); });
                            extraSeries.forEach(s => { if (s.color) usedColors.add(s.color); });

                            let color = EXTRA_COLORS.find(c => !usedColors.has(c));
                            if (!color) {
                                const totalCount = comparisonSeries.length + extraSeries.length + newExtras.length;
                                color = EXTRA_COLORS[totalCount % EXTRA_COLORS.length];
                            }

                            newExtras.push({
                                name: bench.name,
                                data: historyResponse.historical,
                                color: color
                            });
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch default benchmark ${bench.name}`, e);
                    }
                }
            }
            if (newExtras.length > 0) setExtraSeries(prev => [...prev, ...newExtras]);
        };

        loadDefaults();
    }, [open, comparisonSeries, EXTRA_COLORS, extraSeries]);

    const allSeries = useMemo(() => {
        const combined = [...comparisonSeries];
        extraSeries.forEach(s => {
            if (!combined.some(c => c.name === s.name)) combined.push(s);
        });
        return combined;
    }, [comparisonSeries, extraSeries]);

    const oldestDate = mainSeries?.data?.[0]?.date;
    
    const availableRanges = useMemo(() => {
        if (!oldestDate) return ['ALL'];
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - oldestDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffMonths = diffDays / 30;
        const diffYears = diffDays / 365;

        const ranges: string[] = [];
        if (diffMonths >= 1) ranges.push('1M');
        if (diffMonths >= 3) ranges.push('3M');
        if (diffMonths >= 6) ranges.push('6M');
        if (oldestDate.getFullYear() < now.getFullYear()) ranges.push('YTD');
        if (diffYears >= 1) ranges.push('1Y');
        if (diffYears >= 3) ranges.push('3Y');
        if (diffYears >= 5) ranges.push('5Y');
        ranges.push('ALL');
        return ranges;
    }, [oldestDate]);

    const { results, subjectStdDev } = useMemo(() => {
        const resultsMap = new Map<string, ExtendedAnalysisMetrics>();
        if (!mainSeries || mainSeries.data.length < 2) {
            return { results: resultsMap, subjectStdDev: null };
        }

        const mainFiltered = filterDataByRange(mainSeries.data, range);
        if (mainFiltered.length < 2) {
            return { results: resultsMap, subjectStdDev: null };
        }

        // Calculate std dev for the main series
        const mainPricePoints = normalizeToStart(mainFiltered);
        const mainReturnPairs = calculateReturns(mainPricePoints.map(p => ({ x: p.value, y: p.value, timestamp: p.timestamp })));
        const mainReturns = mainReturnPairs.map(p => p.y);
        let calculatedStdDev: number | null = null;
        if (mainReturns.length >= 2) {
            const n = mainReturns.length;
            const mean = mainReturns.reduce((a, b) => a + b, 0) / n;
            const variance = mainReturns.reduce((acc, val) => acc + (val - mean) ** 2, 0) / (n - 1);
            const dailyStdDev = Math.sqrt(variance);
            calculatedStdDev = dailyStdDev * Math.sqrt(252);
        }

        if (allSeries.length === 0) {
            return { results: resultsMap, subjectStdDev: calculatedStdDev };
        }

        const analysisStartDate = mainFiltered[0].date;
        const mainPoints = normalizeToStart(mainFiltered);

        // Risk Free Setup
        let riskFreePoints: { timestamp: number, value: number }[] = [];
        if (riskFreeSeries) {
             const rfFiltered = filterDataByRange(riskFreeSeries.data, 'ALL', analysisStartDate);
             if (rfFiltered.length > 1) {
                 if (riskFreeType === 'IL') {
                     riskFreePoints = normalizeToStart(rfFiltered);
                 } else {
                     // US ^IRX is yield, don't normalize
                     riskFreePoints = rfFiltered.map(p => ({ timestamp: p.date.getTime(), value: p.price }));
                 }
             }
        }

        allSeries.forEach(s => {
            const benchFiltered = filterDataByRange(s.data, 'ALL', analysisStartDate);
            if (benchFiltered.length < 2) return;

            const benchPoints = normalizeToStart(benchFiltered);
            let pricePairs: { x: number; y: number; timestamp?: number }[] = [];

            if (riskFreePoints.length > 0) {
                // 3-Way Sync
                const triples = synchronizeThreeSeries(benchPoints, mainPoints, riskFreePoints);
                if (triples.length < 2) return;

                // Calc Returns for all 3
                // x=Bench, y=Main, z=RiskFree
                const tempReturns: { x: number; y: number }[] = [];
                const tempRfReturns: number[] = [];

                for (let i = 1; i < triples.length; i++) {
                    const prev = triples[i - 1];
                    const curr = triples[i];
                    
                    if (prev.x === 0 || prev.y === 0) continue;
                    const rx = (curr.x - prev.x) / prev.x;
                    const ry = (curr.y - prev.y) / prev.y;
                    
                    let rz = 0;
                    if (riskFreeType === 'IL') {
                        if (prev.z !== 0) rz = (curr.z - prev.z) / prev.z;
                    } else {
                        // US ^IRX is yield. Daily return approx = yield / 100 / 365
                        rz = curr.z / 100 / 365;
                    }
                    
                    tempReturns.push({ x: rx, y: ry });
                    tempRfReturns.push(rz);
                }
                
                if (tempReturns.length < 2) return;
                
                // For Active Return (Total), use the synchronized End/Start from triples
                const startPair = triples[0];
                const endPair = triples[triples.length - 1];
                const benchTotalReturn = (endPair.x / startPair.x) - 1;
                const mainTotalReturn = (endPair.y / startPair.y) - 1;
                
                // Pass to compute
                const metrics = computeAnalysisMetrics(tempReturns, tempRfReturns);
                if (metrics) {
                    resultsMap.set(s.name, {
                        ...metrics,
                        alpha: metrics.alpha * tempReturns.length, // Cumulative Alpha
                        downsideAlpha: metrics.downsideAlpha * tempReturns.length,
                        activeReturn: mainTotalReturn - benchTotalReturn
                    });
                }
                return; // Done for this series (using RF path)
            }

            // Fallback (No RF)
            pricePairs = synchronizeSeries(benchPoints, mainPoints);
            if (pricePairs.length < 2) return;

            const startPair = pricePairs[0];
            const endPair = pricePairs[pricePairs.length - 1];
            const benchTotalReturn = (endPair.x / startPair.x) - 1;
            const mainTotalReturn = (endPair.y / startPair.y) - 1;
            const returnPairs = calculateReturns(pricePairs);
            const metrics = computeAnalysisMetrics(returnPairs);
            
            if (metrics) {
                resultsMap.set(s.name, {
                    ...metrics,
                    alpha: metrics.alpha * returnPairs.length,
                    downsideAlpha: metrics.downsideAlpha * returnPairs.length,
                    activeReturn: mainTotalReturn - benchTotalReturn
                });
            }
        });
        return { results: resultsMap, subjectStdDev: calculatedStdDev };
    }, [mainSeries, allSeries, range, riskFreeSeries]);

    const formatNum = (val: number | undefined, dec = 2) => {
        if (val === undefined || isNaN(val)) return '-';
        return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    const formatPct = (val: number | undefined, dec = 1) => {
        if (val === undefined || isNaN(val)) return '-';
        return (val * 100).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
    };

    const getMetricStyle = (val: number | undefined, type: 'alpha' | 'beta' | 'downsideBeta' | 'rSquared' | 'correlation' | 'activeReturn') => {
        if (val === undefined || isNaN(val)) return { color: 'text.primary', fontWeight: 'normal' };
        
        let color = 'text.primary';
        let fontWeight = 'normal';

        switch (type) {
            case 'activeReturn':
            case 'alpha':
                // Treat downsideAlpha same as alpha for styling purposes if passed as 'alpha' type, 
                // but caller should use 'alpha' for it or we add a case. 
                // Let's rely on caller passing 'alpha' for downsideAlpha too or add case.
                // Adding case below.
            case 'downsideAlpha' as any: 
                if (val > 0.001) color = 'success.main';
                else if (val < -0.001) color = 'error.main';
                
                if (Math.abs(val) > 0.02) fontWeight = 'bold';
                break;

            case 'beta':
                if (val < 0.95) color = 'success.main';
                else if (val > 1.05) color = 'error.main';
                
                if (val < 0.6 || val > 1.4) fontWeight = 'bold';
                break;

            case 'downsideBeta':
                if (val < 0.95) color = 'success.main';
                else if (val > 1.05) color = 'error.main';
                
                if (val < 0.8 || val > 1.2) fontWeight = 'bold';
                break;

            case 'rSquared':
                if (val > 0.8) fontWeight = 'bold';
                break;

            case 'correlation':
                if (val > 0.8 || val < 0.2) fontWeight = 'bold';
                break;
        }

        return { color, fontWeight };
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    {title || t('Portfolio Analysis', 'ניתוח תיק')}
                    <Tooltip title={t("Metrics calculated based on daily returns relative to the benchmark.", "המדדים מחושבים על בסיס תשואות יומיות ביחס למדד הייחוס.")}>
                        <InfoOutlinedIcon color="action" fontSize="small" />
                    </Tooltip>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ pt: 1 }}>
                    <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small" sx={{ height: 26 }}>
                        {availableRanges.map(r => (
                            <ToggleButton key={r} value={r} sx={{ px: 1, fontSize: '0.7rem' }}>
                                {r === 'ALL' ? 'Max' : r}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    
                    <FormControl size="small" sx={{ minWidth: 150, mt: 1 }}>
                        <InputLabel>{t('Risk-Free Rate', 'ריבית חסרת סיכון')}</InputLabel>
                        <Select
                            value={riskFreeType}
                            label={t('Risk-Free Rate', 'ריבית חסרת סיכון')}
                            onChange={(e) => setRiskFreeType(e.target.value as 'US' | 'IL')}
                            sx={{ height: 32 }}
                        >
                            <MenuItem value="US">US T-Bills</MenuItem>
                            <MenuItem value="IL">IL Gov Bonds</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
                {subjectStdDev !== null && (
                    <Typography variant="caption" display="block" align="left" sx={{ mb: 1, ml: 1 }}>
                        {t('Annualized St. Dev', 'סטיית תקן שנתית')}: <strong>{formatPct(subjectStdDev)}</strong>
                    </Typography>
                )}
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('Benchmark', 'מדד יחוס')}</TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("The simple difference between the portfolio's total return and the benchmark's total return over the period. A positive value indicates the portfolio beat the benchmark.", "ההפרש הפשוט בין התשואה הכוללת של התיק לתשואת המדד לאורך התקופה. ערך חיובי מציין שהתיק הכה את המדד.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Active Ret.</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("Jensen's Alpha represents the portfolio's excess return over what would be expected given its risk (Beta) relative to the market. A positive alpha indicates value added by active management.", "אלפא של ג'נסן מייצגת את התשואה העודפת של התיק מעבר למצופה בהינתן הסיכון (בטא) שלו ביחס לשוק. אלפא חיובית מצביעה על ערך מוסף בניהול אקטיבי.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>α<sub style={{ fontSize: '0.7em' }}>J</sub></Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("Measures the volatility of the portfolio in relation to the benchmark. A beta > 1.0 implies higher volatility than the market, while < 1.0 implies lower volatility.", "מודד את תנודתיות התיק ביחס למדד. בטא גדולה מ-1.0 מצביעה על תנודתיות גבוהה מהשוק, בעוד שמתחת ל-1.0 מצביעה על תנודתיות נמוכה יותר.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("A variation of Jensen's Alpha that uses Downside Beta instead of the standard Beta. It measures the portfolio's performance on a risk-adjusted basis, where the 'risk' is defined only by the asset's volatility during market downturns.", "וריאציה של אלפא של ג'נסן המשתמשת בבטא לתקופות ירידה במקום בבטא הרגילה. היא מודדת את ביצועי התיק בהתאמה לסיכון, כאשר 'הסיכון' מוגדר רק על ידי תנודתיות הנכס בתקופות של ירידות שוק.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside α<sub style={{ fontSize: '0.7em' }}>J</sub></Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 120 }}>
                                <Tooltip title={t("Measures the portfolio's downside volatility relative to the benchmark during market declines. A value < 1.0 indicates the portfolio tends to lose less than the market when the market falls.", "מודד את תנודתיות התיק כלפי מטה ביחס למדד בזמן ירידות שוק. ערך נמוך מ-1.0 מצביע על כך שהתיק נוטה להפסיד פחות מהשוק כשהשוק יורד.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t("Indicates the percentage of the portfolio's movements that can be explained by movements in the benchmark. A high R² (85-100%) means the portfolio's performance patterns are closely aligned with the index.", "מציין את אחוז תנועות התיק שניתן להסביר על ידי תנועות במדד הייחוס. R² גבוה (85-100%) פירושו שדפוסי הביצועים של התיק תואמים בקירוב למדד.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>R²</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t("Measures the strength and direction of the linear relationship between the portfolio and the benchmark. 1.0 is perfect positive correlation, 0 is no correlation, and -1.0 is perfect negative correlation.", "מודד את העוצמה והכיוון של הקשר הליניארי בין התיק למדד. 1.0 הוא מתאם חיובי מושלם, 0 הוא חוסר מתאם, ו-1.0- הוא מתאם שלילי מושלם.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Corr</Box>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {allSeries.map((s) => {
                            const m = results.get(s.name);
                            const alphaStyle = getMetricStyle(m?.alpha, 'alpha');
                            const dsBetaStyle = getMetricStyle(m?.downsideBeta, 'downsideBeta');
                            const dsAlphaStyle = getMetricStyle(m?.downsideAlpha, 'downsideAlpha' as any);
                            const actRetStyle = getMetricStyle(m?.activeReturn, 'activeReturn');
                            const betaStyle = getMetricStyle(m?.beta, 'beta');
                            const r2Style = getMetricStyle(m?.rSquared, 'rSquared');
                            const corrStyle = getMetricStyle(m?.correlation, 'correlation');

                            return (
                                <TableRow key={s.name}>
                                    <TableCell component="th" scope="row">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>{s.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...actRetStyle }}>
                                        {formatPct(m?.activeReturn)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...alphaStyle }}>
                                        {formatNum(m?.alpha, 3)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...betaStyle }}>
                                        {formatNum(m?.beta, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...dsAlphaStyle }}>
                                        {formatNum(m?.downsideAlpha, 3)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...dsBetaStyle }}>
                                        {formatNum(m?.downsideBeta, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...r2Style }}>
                                        {formatNum(m?.rSquared, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ ...corrStyle }}>
                                        {formatNum(m?.correlation, 2)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                {allSeries.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                        {t('Add benchmarks to see comparative analysis.', 'הוסף מדדי ייחוס כדי לראות ניתוח השוואתי.')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Close', 'סגור')}</Button>
            </DialogActions>
        </Dialog>
    );
}