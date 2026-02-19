import { Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Tooltip, CircularProgress } from '@mui/material';
import { formatValue, formatNumber, formatPrice } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';

// We might need to import explicit types if we want strict typing for divHistory
// For now, using any[] or defining a local interface if simpler, but better to use real types.
// divHistory in HoldingDetails is enriched with portfolioCurrency.
interface EnrichedDividend {
    date: Date;
    unitsHeld: number;
    pricePerUnit: number;
    grossAmount: { amount: number; currency: string };
    grossAmountDisplay: number;
    cashedAmountDisplay: number;
    cashedGrossDisplay: number;
    cashedTaxDisplay: number;
    cashedFeeDisplay: number;
    reinvestedAmount: number;
    reinvestedAmountDisplay: number;
    reinvestedGrossDisplay: number;
    reinvestedTaxDisplay: number;
    reinvestedFeeDisplay: number;
    count?: number;
    [key: string]: any;
}

interface HoldingDividendsProps {
    divHistory: EnrichedDividend[];
    loading: boolean;
    displayCurrency: string;
    formatDate: (d: string | Date | number) => string;
}

export function HoldingDividends({ divHistory, loading, displayCurrency, formatDate }: HoldingDividendsProps) {
    const { t } = useLanguage();

    return (
        <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Dividends Received', 'דיבידנדים שהתקבלו')}</Typography>
            <Paper variant="outlined">
                {loading ? (
                    <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Units', 'יחידות')}</TableCell>
                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Amount', 'סכום ליחידה')}</TableCell>
                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total Value', 'שווי כולל')}</TableCell>
                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Cashed', 'נפדה')}</TableCell>
                                {divHistory.some(d => d.reinvestedAmount > 0) && (
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Reinvested', 'הושקע מחדש')}</TableCell>
                                )}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {divHistory.map((div, i) => (
                                <TableRow key={i} hover>
                                    <TableCell>
                                        {formatDate(div.date)}
                                        {(div.count || 0) > 1 && (
                                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                ({div.count} {t('records', 'רשומות')})
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">{formatNumber(div.unitsHeld || 0)}</TableCell>
                                    <TableCell align="right">{formatPrice(div.pricePerUnit || 0, div.grossAmount.currency)}</TableCell>
                                    <TableCell align="right">
                                        {/* Total Value is now Gross Amount */}
                                        {formatValue(div.grossAmountDisplay, displayCurrency)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary' }}>
                                        {div.cashedAmountDisplay ? (
                                            <Tooltip
                                                title={
                                                    <Box sx={{ p: 1 }}>
                                                        <Typography variant="subtitle2" sx={{ mb: 1, textDecoration: 'underline' }}>{t('Cashed Breakdown', 'פירוט פדיון')}</Typography>
                                                        <Box display="grid" gridTemplateColumns="1fr auto" gap={1} sx={{ fontSize: '0.8rem' }}>
                                                            <Typography variant="body2">{t('Gross Amount:', 'סכום ברוטו:')}</Typography>
                                                            <Typography variant="body2">{formatValue(div.cashedGrossDisplay, displayCurrency)}</Typography>

                                                            <Typography variant="body2">{t('Tax:', 'מס:')}</Typography>
                                                            <Typography variant="body2" color="error.main">-{formatValue(div.cashedTaxDisplay, displayCurrency)}</Typography>

                                                            <Typography variant="body2">{t('Fees:', 'עמלות:')}</Typography>
                                                            <Typography variant="body2" color="error.main">-{formatValue(div.cashedFeeDisplay, displayCurrency)}</Typography>

                                                            <Box sx={{ gridColumn: '1 / -1', borderTop: '1px dashed', borderColor: 'divider', my: 0.5 }} />

                                                            <Typography variant="body2" fontWeight="bold">{t('Net:', 'נטו:')}</Typography>
                                                            <Typography variant="body2" fontWeight="bold">{formatValue(div.cashedAmountDisplay, displayCurrency)}</Typography>
                                                        </Box>
                                                    </Box>
                                                }
                                            >
                                                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main', cursor: 'help', textDecoration: 'underline dotted' }}>
                                                    {formatValue(div.cashedAmountDisplay, displayCurrency)}
                                                </Typography>
                                            </Tooltip>
                                        ) : '-'}
                                    </TableCell>
                                    {divHistory.some(d => d.reinvestedAmount > 0) && (
                                        <TableCell align="right">
                                            {div.reinvestedAmountDisplay ? (
                                                <Tooltip
                                                    title={
                                                        <Box sx={{ p: 1 }}>
                                                            <Typography variant="subtitle2" sx={{ mb: 1, textDecoration: 'underline' }}>{t('Reinvested Breakdown', 'פירוט השקעה מחדש')}</Typography>
                                                            <Box display="grid" gridTemplateColumns="1fr auto" gap={1} sx={{ fontSize: '0.8rem' }}>
                                                                <Typography variant="body2">{t('Gross Amount:', 'סכום ברוטו:')}</Typography>
                                                                <Typography variant="body2">{formatValue(div.reinvestedGrossDisplay, displayCurrency)}</Typography>

                                                                <Typography variant="body2">{t('Tax:', 'מס:')}</Typography>
                                                                <Typography variant="body2" color="error.main">-{formatValue(div.reinvestedTaxDisplay, displayCurrency)}</Typography>

                                                                <Typography variant="body2">{t('Fees:', 'עמלות:')}</Typography>
                                                                <Typography variant="body2" color="error.main">-{formatValue(div.reinvestedFeeDisplay, displayCurrency)}</Typography>

                                                                <Box sx={{ gridColumn: '1 / -1', borderTop: '1px dashed', borderColor: 'divider', my: 0.5 }} />

                                                                <Typography variant="body2" fontWeight="bold">{t('Net:', 'נטו:')}</Typography>
                                                                <Typography variant="body2" fontWeight="bold">{formatValue(div.reinvestedAmountDisplay, displayCurrency)}</Typography>
                                                            </Box>
                                                        </Box>
                                                    }
                                                >
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main', cursor: 'help', textDecoration: 'underline dotted' }}>
                                                        {formatValue(div.reinvestedAmountDisplay, displayCurrency)}
                                                    </Typography>
                                                </Tooltip>
                                            ) : '-'}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {divHistory.length === 0 && (
                                <TableRow><TableCell colSpan={divHistory.some(d => d.reinvestedAmount > 0) ? 6 : 5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No dividends found.', 'לא נמצאו דיבידנדים.')}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </Paper>
        </Box>
    );
}
