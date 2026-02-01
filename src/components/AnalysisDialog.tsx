import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box, Typography, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';
import { useMemo, useState } from 'react';
import { synchronizeSeries, computeAnalysisMetrics, normalizeToStart, calculateReturns, type AnalysisMetrics } from '../lib/utils/analysis';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface AnalysisDialogProps {
    open: boolean;
    onClose: () => void;
    mainSeries: ChartSeries | null;
    comparisonSeries: ChartSeries[];
    title?: string;
}

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

export function AnalysisDialog({ open, onClose, mainSeries, comparisonSeries, title }: AnalysisDialogProps) {
    const { t } = useLanguage();
    const [range, setRange] = useState('1Y');

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
        if (!mainSeries || mainSeries.data.length < 2 || comparisonSeries.length === 0) return new Map<string, AnalysisMetrics>();
        
        // Filter main series by range.
        const mainFiltered = filterDataByRange(mainSeries.data, range);
        if (mainFiltered.length < 2) return new Map<string, AnalysisMetrics>();

        // For comparison series, we MUST clamp them to the main series start date
        const analysisStartDate = mainFiltered[0].date;

        // Use normalizeToStart to convert to DataPoint[] (timestamp, value). 
        // Normalization doesn't affect returns calculation (ratio preserved).
        const mainPoints = normalizeToStart(mainFiltered);
        const metricsMap = new Map<string, AnalysisMetrics>();

        comparisonSeries.forEach(s => {
            const benchFiltered = filterDataByRange(s.data, 'ALL', analysisStartDate);
            const benchPoints = normalizeToStart(benchFiltered);
            
            // X = Benchmark (Independent), Y = Portfolio (Dependent)
            // 1. Sync Prices
            const pricePairs = synchronizeSeries(benchPoints, mainPoints);
            
            // 2. Calc Returns
            const returnPairs = calculateReturns(pricePairs);

            // 3. Compute Metrics on Returns
            const metrics = computeAnalysisMetrics(returnPairs);
            
            if (metrics) {
                // Annualize Alpha (Daily Alpha * 252)
                // Note: This assumes daily data. If data is sparse, 252 might be high, but standard convention.
                metricsMap.set(s.name, {
                    ...metrics,
                    alpha: metrics.alpha * 252
                });
            }
        });

        return metricsMap;
    }, [mainSeries, comparisonSeries, range]);

    const formatNum = (val: number | undefined, dec = 2) => {
        if (val === undefined || isNaN(val)) return '-';
        return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    const getMetricColor = (val: number | undefined, type: 'alpha' | 'beta' | 'downsideBeta') => {
        if (val === undefined || isNaN(val)) return 'text.primary';
        if (type === 'alpha') {
            if (val > 0.001) return 'success.main';
            if (val < -0.001) return 'error.main';
            return 'text.primary';
        }
        if (type === 'downsideBeta') {
             if (val > 1.05) return 'error.main'; // Significant crash sensitivity
             if (val < 0.95) return 'success.main'; // Significant defensive quality
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
                    <ToggleButtonGroup
                        value={range}
                        exclusive
                        onChange={(_, v) => v && setRange(v)}
                        size="small"
                        sx={{ height: 26 }}
                    >
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
                                <Tooltip title={t("Excess return relative to the benchmark.", "תשואה עודפת ביחס למדד הייחוס.")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Alpha</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 90 }}>
                                <Tooltip title={t("Volatility vs Benchmark (1.0 = Match).", "תנודתיות מול המדד (1.0 = תואם).")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Beta</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 120 }}>
                                <Tooltip title={t("Sensitivity to Drops (< 1.0 = Defensive).", "רגישות לירידות (קטן מ-1.0 = דפנסיבי).")}>
                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>Downside β</Box>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="left" sx={{ width: 80 }}>
                                <Tooltip title={t("Percentage of portfolio movement explained by the benchmark (0-1).", "אחוז תנודת התיק המוסבר על ידי המדד (0-1).")}>
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
                        {comparisonSeries.map((s) => {
                            const m = results.get(s.name);
                            const alphaColor = getMetricColor(m?.alpha, 'alpha');
                            const downsideColor = getMetricColor(m?.downsideBeta, 'downsideBeta');

                            return (
                                <TableRow key={s.name}>
                                    <TableCell component="th" scope="row">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>{s.name}</Typography>
                                        </Box>
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
                {comparisonSeries.length === 0 && (
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
