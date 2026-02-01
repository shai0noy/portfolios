import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableHead, TableRow, Box } from '@mui/material';
import { useLanguage } from '../lib/i18n';
import type { ChartSeries } from './TickerChart';

interface AnalysisDialogProps {
    open: boolean;
    onClose: () => void;
    comparisonSeries: ChartSeries[];
}

export function AnalysisDialog({ open, onClose, comparisonSeries }: AnalysisDialogProps) {
    const { t } = useLanguage();

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
                        {comparisonSeries.map((s) => (
                            <TableRow key={s.name}>
                                <TableCell component="th" scope="row">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                        {s.name}
                                    </Box>
                                </TableCell>
                                <TableCell align="right">-</TableCell>
                                <TableCell align="right">-</TableCell>
                                <TableCell align="right">-</TableCell>
                                <TableCell align="right">-</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Close', 'סגור')}</Button>
            </DialogActions>
        </Dialog>
    );
}
