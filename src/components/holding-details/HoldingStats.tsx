import { Box, Typography, Paper, Divider, Stack, Grid, Tooltip, useTheme } from '@mui/material';
import { formatValue, formatMoneyValue, formatMoneyPrice, formatPercent, formatNumber, convertCurrency } from '../../lib/currency';
import { formatYears } from '../../lib/utils';
import { useLanguage } from '../../lib/i18n';
import type { HoldingValues } from './types';
import type { HoldingWeight } from '../../lib/data/holding_utils';
import type { SimpleMoney } from '../../lib/types';
import { useScrollShadows, ScrollShadows } from '../../lib/ui-utils';

interface HoldingStatsProps {
    vals: HoldingValues;
    displayCurrency: string;
    holdingsWeights: HoldingWeight[];
    hasGrants: boolean;
    vestedValDisplay: SimpleMoney;
    unvestedValDisplay: number;
    unvestedGainDisplay: number;
    unvestedGain: number;
    totalQty: number;
    totalFeesDisplay: number;
    isFeeExempt?: boolean;
    stockCurrency?: string;
    exchangeRates?: any;
}

export function HoldingStats({
    vals,
    displayCurrency,
    holdingsWeights,
    hasGrants,
    vestedValDisplay,
    unvestedValDisplay,
    unvestedGainDisplay,
    unvestedGain,
    totalQty,
    totalFeesDisplay,
    isFeeExempt,
    stockCurrency,
    exchangeRates
}: HoldingStatsProps) {
    const { t } = useLanguage();
    const theme = useTheme();
    const { containerRef, showTop, showBottom, showLeft, showRight } = useScrollShadows('both');

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 6 }}>
            <Box sx={{ position: 'relative' }}>
                <Stack ref={containerRef} direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />} justifyContent="space-around" sx={{ mb: 2, overflowX: 'auto', pb: 1 }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>
                            {t(hasGrants ? 'Vested Value' : 'Value', hasGrants ? 'שווי מובשל' : 'שווי')}
                        </Typography>
                        <Typography variant="h6" fontWeight="700">{formatMoneyValue(vestedValDisplay)}</Typography>
                        <Tooltip title={t('Value After Tax', 'שווי לאחר מס')}>
                            <Typography variant="caption" sx={{ display: 'block', mt: -0.5, cursor: 'help' }} color="text.secondary">
                                {t('Net:', 'נטו:')} {formatMoneyValue(vals.valueAfterTax)}
                            </Typography>
                        </Tooltip>
                    </Box>
                    {hasGrants && (
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Unvested Value', 'שווי לא מובשל')}</Typography>
                            <Typography variant="h6" fontWeight="700">{formatValue(unvestedValDisplay, displayCurrency)}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={unvestedGain >= 0 ? 'success.main' : 'error.main'}>
                                {formatValue(unvestedGainDisplay, displayCurrency)} {t('unvested gains', 'רווח לא מובשל')}
                            </Typography>
                        </Box>
                    )}
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Total Gain', 'רווח כולל')}</Typography>
                        <Typography variant="h6" fontWeight="700" color={vals.totalGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {formatMoneyValue(vals.totalGain)}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.totalGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {vals.totalGainPct > 0 ? '+' : ''}{formatPercent(vals.totalGainPct)}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Realized', 'מימוש')}</Typography>
                        <Typography variant="h6" fontWeight="700" color={vals.realizedGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {formatMoneyValue(vals.realizedGain)}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.realizedGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {formatPercent(vals.realizedGainPct)}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Unrealized', 'לא ממומש')}</Typography>
                        <Typography variant="h6" fontWeight="700" color={vals.unrealizedGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {formatMoneyValue(vals.unrealizedGain)}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.unrealizedGain.amount >= 0 ? 'success.main' : 'error.main'}>
                            {vals.unrealizedGainPct > 0 ? '+' : ''}{formatPercent(vals.unrealizedGainPct)}
                        </Typography>
                    </Box>
                </Stack>
                <ScrollShadows top={showTop} bottom={showBottom} left={showLeft} right={showRight} theme={theme} />
            </Box>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={1}>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Weight in Holdings', 'משקל בתיק')}</Typography>
                    <Typography variant="body2" fontWeight="500">{formatPercent(holdingsWeights.reduce((s, h) => s + h.weightInGlobal, 0))}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Avg Cost', 'מחיר ממוצע')}</Typography>
                    <Box>
                        <Typography variant="body2" fontWeight="500" sx={{ display: 'inline-block' }}>
                            {stockCurrency && exchangeRates
                                ? formatMoneyPrice({
                                    amount: convertCurrency(vals.avgCost.amount, displayCurrency, stockCurrency as any, exchangeRates),
                                    currency: stockCurrency as any
                                }, t)
                                : formatMoneyPrice(vals.avgCost, t)
                            }
                        </Typography>
                    </Box>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Quantity', 'כמות')}</Typography>
                    <Typography variant="body1" fontWeight="500">{formatNumber(totalQty)}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Total Cost', 'עלות מקורית')}</Typography>
                    <Box>
                        <Tooltip title={t('Book Cost (Tax Basis)', 'עלות ספרים (בסיס מס)')}>
                            <Typography variant="body2" fontWeight="500" sx={{ borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                {formatMoneyValue(vals.costBasis)}
                            </Typography>
                        </Tooltip>
                        {Math.abs(vals.realCost.amount - vals.costBasis.amount) > 1 && (
                            <Tooltip title={t('Real Cost (Inflation/Forex Adj.)', 'עלות ריאלית (מתואמת)')}>
                                <Typography variant="caption" display="block" color="text.secondary" sx={{ borderBottom: '1px dotted', borderColor: 'text.secondary', width: 'fit-content' }}>
                                    {formatMoneyValue(vals.realCost)} {t('Real', 'ריאלי')}
                                </Typography>
                            </Tooltip>
                        )}
                    </Box>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Avg Holding Time', 'זמן אחזקה ממוצע')}</Typography>
                    <Typography variant="body2" fontWeight="500">{vals.avgHoldingTimeYears && vals.avgHoldingTimeYears > 0 ? formatYears(vals.avgHoldingTimeYears, t) : '-'}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Avg Yearly Return', 'תשואה שנתית ממוצעת')}</Typography>
                    <Typography variant="body2" fontWeight="500" color={(vals.avgYearlyReturn || -1) >= 0 ? 'success.main' : 'error.main'}>{vals.avgYearlyReturn !== undefined ? formatPercent(vals.avgYearlyReturn) : '-'}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Total Fees', 'סה"כ עמלות')}</Typography>
                    <Typography variant="body2" fontWeight="500">
                        {isFeeExempt
                            ? <Typography component="span" color="success.main" sx={{ fontWeight: 'bold', fontSize: '0.9em' }}>{t('Exempt', 'פטור')}</Typography>
                            : formatValue(totalFeesDisplay, displayCurrency)
                        }
                    </Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Taxes Paid', 'מס ששולם')}</Typography>
                    <Typography variant="body2" fontWeight="500">{formatMoneyValue(vals.realizedTax)}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary" noWrap>{t('Realized Profit (Net)', 'רווח ממומש (נטו)')}</Typography>
                    <Tooltip title={
                        <Box sx={{ p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5 }}>
                                {t('Realized Profit Breakdown', 'פירוט רווח ממומש')}
                            </Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                <Typography variant="caption">{t('Gross Realized Gain:', 'רווח ממומש ברוטו:')}</Typography>
                                <Typography variant="caption">{formatMoneyValue(vals.realizedGainGross)}</Typography>
                            </Box>
                            {Math.max(0, vals.realizedGainGross.amount - vals.realizedGainNet.amount - vals.realizedTax.amount) > 0.01 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                    <Typography variant="caption" color="error.light">{t('Fees Paid:', 'עמלות ששולמו:')}</Typography>
                                    <Typography variant="caption" color="error.light">-{formatValue(Math.max(0, vals.realizedGainGross.amount - vals.realizedGainNet.amount - vals.realizedTax.amount), vals.realizedGainNet.currency)}</Typography>
                                </Box>
                            )}
                            {vals.realizedTax.amount > 0.01 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                    <Typography variant="caption" color="error.light">{t('Taxes Paid:', 'מס ששולם:')}</Typography>
                                    <Typography variant="caption" color="error.light">-{formatMoneyValue(vals.realizedTax)}</Typography>
                                </Box>
                            )}
                            <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{t('Net Realized Gain:', 'רווח נטו:')}</Typography>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{formatMoneyValue(vals.realizedGainNet)}</Typography>
                            </Box>
                        </Box>
                    }>
                        <Typography variant="body2" fontWeight="500" color={vals.realizedGainNet.amount >= 0 ? 'success.main' : 'error.main'} sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                            {formatMoneyValue(vals.realizedGainNet)}
                        </Typography>
                    </Tooltip>
                </Grid>
                {vals.dividends.amount > 0 && (
                    <Grid item xs={6} sm>
                        <Typography variant="caption" color="text.secondary" noWrap>{t('Total Dividends (Net)', 'סה״כ דיבידנדים (נטו)')}</Typography>
                        <Tooltip title={
                            <Box sx={{ p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5 }}>
                                    {t('Dividends Breakdown', 'פירוט דיבידנדים')}
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                    <Typography variant="caption">{t('Gross Dividends:', 'דיבידנדים ברוטו:')}</Typography>
                                    <Typography variant="caption">{vals.dividendsGross ? formatMoneyValue(vals.dividendsGross) : formatMoneyValue(vals.dividends)}</Typography>
                                </Box>
                                {(vals.dividendsGross?.amount || 0) - vals.dividends.amount > 0.01 && (
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                        <Typography variant="caption" color="error.light">{t('Taxes Withheld:', 'מס שנוכה:')}</Typography>
                                        <Typography variant="caption" color="error.light">-{formatValue((vals.dividendsGross?.amount || 0) - vals.dividends.amount, vals.dividends.currency)}</Typography>
                                    </Box>
                                )}
                                <Divider sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.3)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{t('Net Dividends:', 'נטו:')}</Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{formatMoneyValue(vals.dividends)}</Typography>
                                </Box>
                            </Box>
                        }>
                            <Typography variant="body2" fontWeight="500" color="success.main" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                {formatMoneyValue(vals.dividends)}
                            </Typography>
                        </Tooltip>
                    </Grid>
                )}
            </Grid>
        </Paper>
    );
}
