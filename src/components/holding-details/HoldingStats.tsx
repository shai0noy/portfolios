import { Box, Typography, Paper, Divider, Stack, Grid, Tooltip } from '@mui/material';
import { formatValue, formatNumber, formatPrice, formatPercent } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';
import type { HoldingValues } from './types';
import type { HoldingWeight } from '../../lib/data/holding_utils';

interface HoldingStatsProps {
    vals: HoldingValues;
    displayCurrency: string;
    holdingsWeights: HoldingWeight[];
    hasGrants: boolean;
    vestedValDisplay: number;
    unvestedValDisplay: number;
    unvestedGainDisplay: number;
    unvestedGain: number;
    totalQty: number;
    totalFeesDisplay: number;
    isFeeExempt?: boolean;
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
    isFeeExempt
}: HoldingStatsProps) {
    const { t } = useLanguage();

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 6 }}>
            <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />} justifyContent="space-around" sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>
                        {t(hasGrants ? 'Vested Value' : 'Value', hasGrants ? 'שווי מובשל' : 'שווי')}
                    </Typography>
                    <Typography variant="h6" fontWeight="700">{formatValue(vestedValDisplay, displayCurrency)}</Typography>
                    <Tooltip title={t('Value After Tax', 'שווי לאחר מס')}>
                        <Typography variant="caption" sx={{ display: 'block', mt: -0.5, cursor: 'help' }} color="text.secondary">
                            {t('Net:', 'נטו:')} {formatValue(vals.valueAfterTax, displayCurrency)}
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
                    <Typography variant="h6" fontWeight="700" color={vals.totalGain >= 0 ? 'success.main' : 'error.main'}>
                        {formatValue(vals.totalGain, displayCurrency)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.totalGain >= 0 ? 'success.main' : 'error.main'}>
                        {vals.totalGainPct > 0 ? '+' : ''}{formatPercent(vals.totalGainPct)}
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Realized', 'מימוש')}</Typography>
                    <Typography variant="h6" fontWeight="700" color={vals.realizedGain >= 0 ? 'success.main' : 'error.main'}>
                        {formatValue(vals.realizedGain, displayCurrency)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.realizedGain >= 0 ? 'success.main' : 'error.main'}>
                        {formatPercent(vals.realizedGainPct)}
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Unrealized', 'לא ממומש')}</Typography>
                    <Typography variant="h6" fontWeight="700" color={vals.unrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                        {formatValue(vals.unrealizedGain, displayCurrency)}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.unrealizedGain >= 0 ? 'success.main' : 'error.main'}>
                        {vals.unrealizedGainPct > 0 ? '+' : ''}{formatPercent(vals.unrealizedGainPct)}
                    </Typography>
                </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={1}>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Weight in Holdings', 'משקל בתיק')}</Typography>
                    <Typography variant="body2" fontWeight="500">{formatPercent(holdingsWeights.reduce((s, h) => s + h.weightInGlobal, 0))}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Avg Cost', 'מחיר ממוצע')}</Typography>
                    <Typography variant="body2" fontWeight="500">{formatPrice(vals.avgCost, displayCurrency)}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Quantity', 'כמות')}</Typography>
                    <Typography variant="body1" fontWeight="500">{formatNumber(totalQty)}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary">{t('Total Cost', 'עלות מקורית')}</Typography>
                    <Box>
                        <Typography variant="body2" fontWeight="500">{formatValue(vals.costBasis, displayCurrency)}</Typography>
                    </Box>
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
                    <Typography variant="body2" fontWeight="500">{formatValue(vals.realizedTax, displayCurrency)}</Typography>
                </Grid>
                <Grid item xs={6} sm>
                    <Typography variant="caption" color="text.secondary" noWrap>{t('Net Realized', 'מימוש נטו')}</Typography>
                    <Typography variant="body2" fontWeight="500" color={vals.realizedGainNet >= 0 ? 'success.main' : 'error.main'}>
                        {formatValue(vals.realizedGainNet, displayCurrency)}
                    </Typography>
                </Grid>
            </Grid>
        </Paper>
    );
}
