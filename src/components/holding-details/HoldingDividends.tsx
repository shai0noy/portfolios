import { Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Tooltip, CircularProgress, useTheme } from '@mui/material';
import { useScrollShadows, ScrollShadows } from '../../lib/ui-utils';
import { formatValue, formatNumber, formatPrice } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';
import PaidIcon from '@mui/icons-material/Paid';
import { convertCurrency } from '../../lib/currency';
import type { CalendarEvents } from '../../lib/fetching';
import type { Currency } from '../../lib/types';

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
    calendarEvents?: CalendarEvents;
    totalQty?: number;
    stockCurrency?: Currency;
    exchangeRates?: any;
}

const getDaysDiff = (dateStr: string | number | Date) => {
    const diffTime = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
};
const formatDateWithRelative = (dateStr: string | number | Date, t: any, formatDateOrig: any) => {
    const dStr = formatDateOrig(dateStr);
    const days = getDaysDiff(dateStr);
    if (days === 0) return `${dStr} (${t('Today', 'היום')})`;
    if (days > 0) return `${dStr} (${t('in {days} days', 'בעוד {days} ימים').replace('{days}', String(days))})`;
    return `${dStr} (${t('{days} days ago', 'לפני {days} ימים').replace('{days}', String(Math.abs(days)))})`;
};


export function HoldingDividends({ divHistory, loading, displayCurrency, formatDate, calendarEvents, totalQty, stockCurrency, exchangeRates }: HoldingDividendsProps) {
    const { t } = useLanguage();

    const theme = useTheme();
    const { containerRef, showTop, showBottom, showLeft, showRight } = useScrollShadows('both');

    const divExDays = calendarEvents?.exDividendDate ? getDaysDiff(calendarEvents.exDividendDate) : undefined;
    const divPayDays = calendarEvents?.dividendDate ? getDaysDiff(calendarEvents.dividendDate) : undefined;
    const isUpcoming = (divExDays !== undefined && divExDays >= 0) || (divPayDays !== undefined && divPayDays >= 0);

    const calcTotalAmount = () => {
        if (!calendarEvents?.dividendAmount || !totalQty || !stockCurrency || !exchangeRates) return null;
        const divCurrency = calendarEvents.dividendCurrency || stockCurrency;
        const totalStockCurrency = calendarEvents.dividendAmount * totalQty;
        const totalDisplayCurrency = convertCurrency(totalStockCurrency, divCurrency, displayCurrency, exchangeRates);
        return formatPrice(totalDisplayCurrency, displayCurrency);
    };

    return (
        <Box>
            {isUpcoming && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Upcoming Dividend', 'דיבידנד צפוי')}</Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 1.5, borderRadius: 2, alignItems: 'center', bgcolor: 'background.paper', overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', bgcolor: theme.palette.mode === 'dark' ? 'rgba(74, 144, 226, 0.15)' : 'primary.light', color: 'primary.main', flexShrink: 0 }}>
                            <PaidIcon fontSize="small" />
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1, minWidth: 0 }}>
                            {calendarEvents?.dividendAmount && <Typography variant="body2" sx={{ fontSize: '0.8rem', mb: 0.5 }}>{formatPrice(calendarEvents.dividendAmount, calendarEvents.dividendCurrency || stockCurrency || 'USD')} {t('PS', 'למניה')}{totalQty ? ` • ${calcTotalAmount()} ${t('Total', 'סה״כ')}` : ''}</Typography>}
                            {calendarEvents?.dividendDate && <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{t('Pay', 'תשלום')}: <strong>{formatDateWithRelative(calendarEvents.dividendDate, t, formatDate)}</strong></Typography>}
                            {calendarEvents?.exDividendDate && <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>{t('Ex', 'אקס')}: <strong>{formatDateWithRelative(calendarEvents.exDividendDate, t, formatDate)}</strong></Typography>}
                        </Box>
                    </Paper>
                </Box>
            )}
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Dividends Received', 'דיבידנדים שהתקבלו')}</Typography>
            <Box sx={{ position: 'relative' }}>
                <Paper ref={containerRef} variant="outlined" sx={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
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
                <ScrollShadows top={showTop} bottom={showBottom} left={showLeft} right={showRight} theme={theme} />
            </Box>
        </Box>
    );
}
