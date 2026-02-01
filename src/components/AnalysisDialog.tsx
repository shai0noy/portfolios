import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box, Typography, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';
import { useMemo, useState, useEffect } from 'react';
import { synchronizeSeries, computeAnalysisMetrics, normalizeToStart, calculateReturns, type AnalysisMetrics } from '../lib/utils/analysis';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { fetchTickerHistory } from '../lib/fetching';
import { Exchange } from '../lib/types';
import { EXTRA_COLORS } from '../lib/hooks/useChartComparison';

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
    const [range, setRange] = useState('1Y');
    const [extraSeries, setExtraSeries] = useState<ChartSeries[]>([]);

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
    }, [open, comparisonSeries]);

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

    const results = useMemo(() => {
        if (!mainSeries || mainSeries.data.length < 2 || allSeries.length === 0) return new Map<string, ExtendedAnalysisMetrics>();
        
        const mainFiltered = filterDataByRange(mainSeries.data, range);
        if (mainFiltered.length < 2) return new Map<string, ExtendedAnalysisMetrics>();

        const analysisStartDate = mainFiltered[0].date;
        const mainPoints = normalizeToStart(mainFiltered);
        const metricsMap = new Map<string, ExtendedAnalysisMetrics>();

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
                metricsMap.set(s.name, {
                    ...metrics,
                    alpha: metrics.alpha * returnPairs.length,
                    activeReturn: mainTotalReturn - benchTotalReturn
                });
            }
        });
        return metricsMap;
    }, [mainSeries, allSeries, range]);

    const formatNum = (val: number | undefined, dec = 2) => {
        if (val === undefined || isNaN(val)) return '-';
        return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    const formatPct = (val: number | undefined, dec = 1) => {
        if (val === undefined || isNaN(val)) return '-';
        return (val * 100).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
    };

    const getMetricColor = (val: number | undefined, type: 'alpha' | 'beta' | 'downsideBeta' | 'activeReturn') => {
        if (val === undefined || isNaN(val)) return 'text.primary';
        if (type === 'alpha' || type === 'activeReturn') {
            if (val > -0.001) return 'success.main';
            return 'error.main';
        }
        if (type === 'downsideBeta') {
             if (val > 1.05) return 'error.main';
             if (val < 0) return 'error.main';
             if (val < 0.95) return 'success.main';
             return 'text.primary';
        }
        return 'text.primary';
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
                <Box display="flex" justifyContent="center" mb={2}>
                    <ToggleButtonGroup value={range} exclusive onChange={(_, v) => v && setRange(v)} size="small" sx={{ height: 26 }}>
                        {availableRanges.map(r => (
                            <ToggleButton key={r} value={r} sx={{ px: 1, fontSize: '0.7rem' }}>
                                {r === 'ALL' ? 'Max' : r}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Box>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('Benchmark', 'מדד יחוס')}</TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t(`Difference in total return (${effectiveSubjectName} - Benchmark).`, `הפרש בתשואה הכוללת (${effectiveSubjectName} - מדד).`)}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Active Ret.</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t(`Cumulative risk-adjusted excess return for the selected period.`, `תשואה עודפת מתוקננת סיכון מצטברת לתקופה שנבחרה.`)}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Alpha</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t(`Volatility vs Benchmark (1.0 = Match).`, `תנודתיות מול המדד (1.0 = תואם).`)}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Beta</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 120 }}>
                                <Tooltip title={t(`Sensitivity to Drops (< 1.0 = Defensive).`, `רגישות לירידות (קטן מ-1.0 = דפנסיבי).`)}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t(`Percentage of ${effectiveSubjectName} movement explained by the benchmark (0-1).`, `אחוז תנודת ה-${effectiveSubjectName} המוסבר על ידי המדד (0-1).`)}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>R²</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t("Correlation direction (-1 to 1).", "כיוון הקורלציה (-1 עד 1).")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Corr</Box>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {allSeries.map((s) => {
                            const m = results.get(s.name);
                            const alphaColor = getMetricColor(m?.alpha, 'alpha');
                            const downsideColor = getMetricColor(m?.downsideBeta, 'downsideBeta');
                            const activeReturnColor = getMetricColor(m?.activeReturn, 'activeReturn');
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
                                    <TableCell align="left" sx={{ color: downsideColor, fontWeight: downsideColor !== 'text.primary' ? 'bold' : 'normal' }}>
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