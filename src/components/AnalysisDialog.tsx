import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box, Typography, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';
import { useMemo, useState, useEffect } from 'react';
import { synchronizeSeries, computeAnalysisMetrics, normalizeToStart, calculateReturns, type AnalysisMetrics } from '../lib/utils/analysis';
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

export function AnalysisDialog({ open, onClose, mainSeries, comparisonSeries, title, subjectName }: AnalysisDialogProps) {
    const { t } = useLanguage();
    const theme = useTheme();
    const [range, setRange] = useState('1Y');
    const [extraSeries, setExtraSeries] = useState<ChartSeries[]>([]);

    const EXTRA_COLORS = useMemo(() => {
        return theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    }, [theme.palette.mode]);

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

    const effectiveSubjectName = subjectName || t('Portfolio', 'תיק');
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
        const mainReturnPairs = calculateReturns(mainPricePoints.map(p => ({ x: p.value, y: p.value })));
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

        allSeries.forEach(s => {
            const benchFiltered = filterDataByRange(s.data, 'ALL', analysisStartDate);
            if (benchFiltered.length < 2) return;

            const benchPoints = normalizeToStart(benchFiltered);
            const pricePairs = synchronizeSeries(benchPoints, mainPoints);
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
    }, [mainSeries, allSeries, range]);

    const formatNum = (val: number | undefined, dec = 2) => {
        if (val === undefined || isNaN(val)) return '-';
        return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    const formatPct = (val: number | undefined, dec = 1) => {
        if (val === undefined || isNaN(val)) return '-';
        return (val * 100).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
    };

    const getMetricColor = (val: number | undefined, posIsGood: boolean) => {
        if (val === undefined || isNaN(val)) return 'text.primary';

        if (val < 0.01 && val > -0.01) return 'text.primary';
        if (posIsGood) {
            if (val > 0.0) return 'success.main';
            return 'error.main';
        } else {
            if (val < 0) return 'success.main';
            return 'error.main';
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    {title || t('Analysis', 'ניתוח')}
                    <Tooltip title={t("Metrics calculated based on daily returns relative to the benchmark.", "המדדים מחושבים על בסיס תשואות יומיות ביחס למדד הייחוס.")}>
                        <InfoOutlinedIcon color="action" fontSize="small" />
                    </Tooltip>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box display="flex" justifyContent="center" mb={2}>
                    <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small" sx={{ height: 26 }}>
                        {availableRanges.map(r => (
                            <ToggleButton key={r} value={r} sx={{ px: 1, fontSize: '0.7rem' }}>
                                {r === 'ALL' ? 'Max' : r}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
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
                                <Tooltip title={t('The simple difference between the portfolio\'s total return and the benchmark\'s total return over the period.', 'ההפרש בתשואה הכוללת בין התיק למדד הייחוס לאורך התקופה.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Active Ret.</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t('Jensen\'s Alpha represents the portfolio\'s return over what would be expected based on its beta and the benchmark\'s return. A positive alpha suggests outperformance on a risk-adjusted basis.', 'אלפא של ג\'נסן מייצגת את תשואת התיק מעבר למצופה בהתבסס על הבטא שלו ותשואת המדד. אלפא חיובית מצביעה על ביצועי יתר בהתאמה לסיכון.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>α<sub style={{ fontSize: '0.7em' }}>J</sub></Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t('Measures the portfolio\'s volatility in relation to the benchmark. A beta above 1.0 indicates higher volatility than the benchmark, while below 1.0 indicates lower volatility.', 'מודד את תנודתיות התיק ביחס למדד. בטא מעל 1.0 מצביעה על תנודתיות גבוהה יותר מהמדד, ומתחת ל-1.0 על תנודתיות נמוכה יותר.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("A variation of Jensen's Alpha that uses Downside Beta instead of the standard Beta. It measures the portfolio's performance on a risk-adjusted basis, where the 'risk' is defined only by the asset's volatility during market downturns.", "וריאציה של אלפא של ג'נסן המשתמשת בבטא לתקופות ירידה במקום בבטא הרגילה. היא מודדת את ביצועי התיק בהתאמה לסיכון, כאשר 'הסיכון' מוגדר רק על ידי תנודתיות הנכס בתקופות של ירידות שוק.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside α<sub style={{ fontSize: '0.7em' }}>J</sub></Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 120 }}>
                                <Tooltip title={t('Measures the portfolio\'s volatility only during periods where the benchmark had a negative return. A downside beta below 1.0 suggests the portfolio has been defensive and captured less of the market\'s losses.', 'מודד את תנודתיות התיק רק בתקופות בהן המדד הציג תשואה שלילית. בטא ירידות מתחת ל-1.0 מצביעה על כך שהתיק היה דפנסיבי וספג פחות מהפסדי השוק.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t('R-Squared indicates the percentage of the portfolio\'s price movements that can be explained by movements in the benchmark index. A higher value means a closer correlation.', 'R-Squared מציין את אחוז תנועות המחירים של התיק שניתן להסביר על ידי תנועות במדד הייחוס. ערך גבוה יותר פירושו מתאם קרוב יותר.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>R²</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t('The correlation coefficient measures the strength and direction of a linear relationship between the portfolio and the benchmark. 1 is a perfect positive correlation, -1 is a perfect negative correlation, and 0 is no linear correlation.', 'מקדם המתאם מודד את העוצמה והכיוון של הקשר הליניארי בין התיק למדד. 1 הוא מתאם חיובי מושלם, -1 הוא מתאם שלילי מושלם, ו-0 הוא חוסר קשר ליניארי.')}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Corr</Box>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {allSeries.map((s) => {
                            const m = results.get(s.name);
                            const alphaColor = getMetricColor(m?.alpha, /*posIsGood=*/true);
                            const downsideBColor = getMetricColor(m?.downsideBeta, /*posIsGood=*/false);
                            const downsideAColor = getMetricColor(m?.downsideAlpha, /*posIsGood=*/true);
                            const activeReturnColor = getMetricColor(m?.activeReturn, /*posIsGood=*/true);
                            return (
                                <TableRow key={s.name}>
                                    <TableCell component="th" scope="row">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>{s.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: activeReturnColor, fontWeight: activeReturnColor !== 'text.primary' ? 'bold' : 'normal' }}>
                                        {formatPct(m?.activeReturn)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: alphaColor, fontWeight: alphaColor !== 'text.primary' ? 'bold' : 'normal' }}>
                                        {formatNum(m?.alpha, 3)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: 'text.primary', fontWeight: 'normal' }}>
                                        {formatNum(m?.beta, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: downsideAColor, fontWeight: downsideAColor !== 'text.primary' ? 'bold' : 'normal' }}>
                                        {formatNum(m?.downsideAlpha, 3)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: downsideBColor, fontWeight: downsideBColor !== 'text.primary' ? 'bold' : 'normal' }}>
                                        {formatNum(m?.downsideBeta, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: 'text.primary', fontWeight: 'normal' }}>
                                        {formatNum(m?.rSquared, 2)}
                                    </TableCell>
                                    <TableCell align="left" sx={{ color: 'text.primary', fontWeight: 'normal' }}>
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