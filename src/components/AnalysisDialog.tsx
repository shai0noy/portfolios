import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box, Typography } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';
import { useMemo } from 'react';
import { synchronizeSeries, computeAnalysisMetrics, normalizeToStart, type AnalysisMetrics } from '../lib/utils/analysis';

interface AnalysisDialogProps {
    open: boolean;
    onClose: () => void;
    mainSeries: ChartSeries | null;
    comparisonSeries: ChartSeries[];
}

export function AnalysisDialog({ open, onClose, mainSeries, comparisonSeries }: AnalysisDialogProps) {
    const { t } = useLanguage();

    const results = useMemo(() => {
        if (!mainSeries || mainSeries.data.length < 2 || comparisonSeries.length === 0) return new Map<string, AnalysisMetrics>();
        
        const mainNormalized = normalizeToStart(mainSeries.data);
        const metricsMap = new Map<string, AnalysisMetrics>();

        comparisonSeries.forEach(s => {
            const benchNormalized = normalizeToStart(s.data);
            // X = Benchmark (Independent), Y = Portfolio (Dependent)
            const pairs = synchronizeSeries(benchNormalized, mainNormalized);
            const metrics = computeAnalysisMetrics(pairs);
            if (metrics) {
                metricsMap.set(s.name, metrics);
            }
        });

        return metricsMap;
    }, [mainSeries, comparisonSeries]);

    const formatNum = (val: number | undefined, dec = 2) => {
        if (val === undefined || isNaN(val)) return '-';
        return val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('Portfolio Analysis', 'ניתוח תיק')}</DialogTitle>
            <DialogContent>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('Benchmark', 'מדד יחוס')}</TableCell>
                            <TableCell align="right">Alpha</TableCell>
                            <TableCell align="right">Beta</TableCell>
                            <TableCell align="right">R²</TableCell>
                            <TableCell align="right">Corr</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {comparisonSeries.map((s) => {
                            const m = results.get(s.name);
                            return (
                                <TableRow key={s.name}>
                                    <TableCell component="th" scope="row">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                            <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>{s.name}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right">{formatNum(m?.alpha, 3)}</TableCell>
                                    <TableCell align="right">{formatNum(m?.beta, 2)}</TableCell>
                                    <TableCell align="right">{formatNum(m?.rSquared, 2)}</TableCell>
                                    <TableCell align="right">{formatNum(m?.correlation, 2)}</TableCell>
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
