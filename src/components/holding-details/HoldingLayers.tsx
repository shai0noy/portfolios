import { Box, Paper, Table, TableHead, TableRow, TableCell, TableBody, Typography, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatValue, formatNumber, formatPercent, convertCurrency, formatMoneyValue, formatMoneyPrice } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';
import { Currency } from '../../lib/types';
import type { Portfolio } from '../../lib/types';
import { getTaxRatesForDate } from '../../lib/portfolioUtils';
import type { PortfolioGroup } from './types';

interface HoldingLayersProps {
    groupedLayers: PortfolioGroup[];
    displayCurrency: string;
    portfolios: Portfolio[];
    exchangeRates: any; // Using exact type if possible or any
    formatDate: (d: string | Date | number) => string;
}

export function HoldingLayers({ groupedLayers, displayCurrency, portfolios, exchangeRates, formatDate }: HoldingLayersProps) {
    const { t } = useLanguage();

    return (
        <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Layers', 'שכבות')}</Typography>
            <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Remaining', 'נותר')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Unit Price', 'מחיר ליחידה')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Orig. Cost', 'עלות מקורית')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Cur. Value', 'שווי נוכחי')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Realized', 'מומש')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Adj. Cost', 'עלות מתואמת')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Unrealized Gain', 'רווח לא ממומש')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                    {t('Tax Liab.', 'חבות מס')}
                                    <Tooltip
                                        enterTouchDelay={0}
                                        leaveTouchDelay={3000}
                                        title={t("Estimated Tax Liability. Includes Capital Gains Tax (on Realized + Unrealized) and Wealth Tax/Income Tax where applicable. Fees are deducted from taxable gain.", "חבות מס משוערת. כולל מס רווח הון (על מומש + לא ממומש) ומס יסף/הכנסה היכן שרלוונטי. עמלות מנוכות מהרווח החייב.")}
                                    >
                                        <InfoOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary', cursor: 'help' }} />
                                    </Tooltip>
                                </Box>
                            </TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting', 'הבשלה')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {groupedLayers.length === 0 && (
                            <TableRow><TableCell colSpan={11} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No layers found.', 'לא נמצאו שכבות.')}</TableCell></TableRow>
                        )}
                        {groupedLayers.map((group) => (
                            <>
                                {/* Portfolio Header Row */}
                                <TableRow key={`header-${group.portfolioId}`} sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell colSpan={11} sx={{ py: 1, pl: 2 }}>
                                        <Typography variant="subtitle2" fontWeight="bold" color="primary">
                                            {group.portfolioName}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                                {/* Layers */}
                                {group.layers.map((layer, i) => {
                                    const vestDate = layer.vestingDate;
                                    const isVested = !vestDate || new Date(vestDate) <= new Date(); // Ensure Date comparison
                                    const vestColor = vestDate ? (isVested ? 'success.main' : 'text.secondary') : 'inherit';

                                    return (
                                        <TableRow key={layer.originalTxnId || `${group.portfolioId}-${i}`}>
                                            <TableCell>{formatDate(layer.date)}</TableCell>
                                            <TableCell align="right">{formatNumber(layer.originalQty)}</TableCell>
                                            <TableCell align="right">
                                                <Tooltip
                                                    title={
                                                        <Box>
                                                            {layer.soldQty > 0 && (
                                                                <Typography variant="body2">
                                                                    {t('Sold:', 'נמכר:')} {formatNumber(layer.soldQty)} ({formatPercent(layer.originalQty > 0 ? layer.soldQty / layer.originalQty : 0)})
                                                                </Typography>
                                                            )}
                                                            {layer.transferredQty && layer.transferredQty > 0 ? (
                                                                <Typography variant="body2">
                                                                    {t('Transferred:', 'הועבר:')} {formatNumber(layer.transferredQty!)} ({formatPercent(layer.originalQty > 0 ? layer.transferredQty! / layer.originalQty : 0)})
                                                                </Typography>
                                                            ) : null}
                                                            {layer.soldQty === 0 && (!layer.transferredQty || layer.transferredQty === 0) && (
                                                                <Typography variant="body2">{t('No sells', 'לא נרשמו מכירות')}</Typography>
                                                            )}
                                                        </Box>
                                                    }
                                                    enterTouchDelay={0}
                                                    leaveTouchDelay={3000}
                                                >
                                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                                        {formatNumber(layer.remainingQty)}
                                                    </Box>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="right">{formatMoneyPrice(layer.price)}</TableCell>
                                            <TableCell align="right">
                                                {displayCurrency !== Currency.ILS ? (
                                                    <Tooltip
                                                        enterTouchDelay={0}
                                                        leaveTouchDelay={3000}
                                                        title={
                                                            <Box sx={{ p: 1 }}>
                                                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Nominal Cost (ILS)', 'עלות נומינלית (ש"ח)')}</Typography>
                                                                <Typography variant="body2">{formatMoneyValue(layer.originalCostILS)}</Typography>
                                                                {layer.originalCost.amount > 0 && (
                                                                    <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                                        {t('Implied Rate:', 'שער רכישה:')} {formatNumber(layer.originalCostILS.amount / layer.originalCost.amount)}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        }
                                                    >
                                                        <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                                            {formatMoneyValue(layer.originalCost)}
                                                        </Box>
                                                    </Tooltip>
                                                ) : (
                                                        formatMoneyValue(layer.originalCost)
                                                )}
                                            </TableCell>

                                            <TableCell align="right">
                                                {(() => {
                                                    const isILS = displayCurrency === Currency.ILS;
                                                    const valContent = layer.remainingQty > 0 ? formatMoneyValue(layer.currentValue) : '-';

                                                    if (layer.remainingQty <= 0) return valContent;

                                                    // Nominal Gain
                                                    const nominalCostILS = layer.originalCostILS.amount;
                                                    const nominalGainILS = layer.currentValueILS.amount - nominalCostILS;
                                                    const nominalGainPct = nominalCostILS > 0 ? nominalGainILS / nominalCostILS : 0;

                                                    // Real Gain
                                                    const realCostILS = layer.realCostILS.amount || nominalCostILS;
                                                    const realGainILS = layer.currentValueILS.amount - realCostILS;
                                                    const realGainPct = realCostILS > 0 ? realGainILS / realCostILS : 0;

                                                    // Taxable Gain
                                                    const taxableGainILS = layer.unrealizedTaxableGainILS.amount;

                                                    return (
                                                        <Tooltip
                                                            enterTouchDelay={0}
                                                            leaveTouchDelay={3000}
                                                            title={
                                                                <Box sx={{ p: 1 }}>
                                                                    {!isILS && (
                                                                        <>
                                                                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Value (ILS)', 'שווי (ש"ח)')}</Typography>
                                                                            <Typography variant="body2" sx={{ mb: 1 }}>{formatMoneyValue(layer.currentValueILS)}</Typography>
                                                                        </>
                                                                    )}

                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Nominal Gain (ILS)', 'רווח נומינלי (ש"ח)')}</Typography>
                                                                    <Typography variant="body2" color={nominalGainILS >= 0 ? 'success.light' : 'error.light'} sx={{ mb: 1 }}>
                                                                        {formatValue(nominalGainILS, Currency.ILS)} ({formatPercent(nominalGainPct)})
                                                                    </Typography>

                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Real Gain (ILS)', 'רווח ריאלי (ש"ח)')}</Typography>
                                                                    <Typography variant="body2" color={realGainILS >= 0 ? 'success.light' : 'error.light'} sx={{ mb: 1 }}>
                                                                        {formatValue(realGainILS, Currency.ILS)} ({formatPercent(realGainPct)})
                                                                    </Typography>

                                                                    <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1, mt: 1 }}>
                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Taxable Gain', 'רווח חייב')}</Typography>
                                                                        <Typography variant="body2" color={taxableGainILS > 0 ? 'success.light' : taxableGainILS < 0 ? 'error.light' : 'text.primary'}>
                                                                            {formatValue(taxableGainILS, Currency.ILS)}
                                                                        </Typography>
                                                                    </Box>
                                                                </Box>
                                                            }
                                                        >
                                                            <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                                                {valContent}
                                                            </Box>
                                                        </Tooltip>
                                                    );
                                                })()}
                                            </TableCell>
                                            {/* Color Realized Gain: Green/Red if non-zero */}
                                            <TableCell align="right" sx={{ color: layer.realizedGain.amount > 0 ? 'success.main' : layer.realizedGain.amount < 0 ? 'error.main' : 'inherit' }}>
                                                {layer.soldQty > 0 || layer.realizedGain.amount !== 0 ? formatMoneyValue(layer.realizedGain) : '-'}
                                            </TableCell>
                                            <TableCell align="right">
                                                {(() => {
                                                    const p = portfolios.find(p => p.id === group.portfolioId);
                                                    if (p?.taxPolicy === 'IL_REAL_GAIN') {
                                                        return (
                                                            <Tooltip
                                                                enterTouchDelay={0}
                                                                leaveTouchDelay={3000}
                                                                title={
                                                                    <Box sx={{ p: 1 }}>
                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Adjusted Cost', 'עלות מתואמת')}</Typography>
                                                                        {layer.adjustmentDetails && (
                                                                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                                                                                {layer.adjustmentDetails.label}: {formatPercent(layer.adjustmentDetails.percentage)}
                                                                            </Typography>
                                                                        )}
                                                                        {!layer.adjustmentDetails && (
                                                                            <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                                                {t('No adjustment data available', 'אין נתוני התאמה')}
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
                                                                }
                                                            >
                                                                <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                                                    {formatMoneyValue(layer.adjustedCostILS)}
                                                                </Box>
                                                            </Tooltip>
                                                        );
                                                    }
                                                    return (
                                                        <Tooltip
                                                            title={t('Not applicable for this tax policy (Nominal Gain applies)', 'לא רלוונטי למדיניות מס זו (חלק רווח נומינלי)')}
                                                            enterTouchDelay={0}
                                                            leaveTouchDelay={3000}
                                                        >
                                                            <span style={{ cursor: 'help', color: 'text.disabled', borderBottom: '1px dotted', borderColor: 'text.disabled' }}>-</span>
                                                        </Tooltip>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: (layer.currentValue.amount - layer.remainingCost.amount) >= 0 ? 'success.main' : 'error.main' }}>
                                                {(() => {
                                                    if (displayCurrency === Currency.ILS && layer.remainingQty > 0) {
                                                        const curVal = layer.currentValueILS.amount || 0;
                                                        const cost = layer.originalCostILS.amount;
                                                        const gain = curVal - cost;
                                                        return formatValue(gain, Currency.ILS);
                                                    }
                                                    return layer.remainingQty > 0 ? formatValue(layer.currentValue.amount - layer.remainingCost.amount, displayCurrency) : '-';
                                                })()}
                                            </TableCell>

                                            <TableCell align="right">
                                                {(() => {
                                                    const p = portfolios.find(p => p.id === group.portfolioId);
                                                    const taxILS = convertCurrency(layer.unrealizedTax.amount, layer.unrealizedTax.currency, Currency.ILS, exchangeRates || undefined);
                                                    const totalTax = layer.realizedTax.amount + layer.unrealizedTax.amount;
                                                    const isNegativeTax = totalTax < -0.01; // tax credit

                                                    // Breakdown Calculation (Duplicated for Tooltip)
                                                    const { incTax } = p ? getTaxRatesForDate(p, new Date()) : { incTax: 0 };
                                                    let estimatedIncTaxILS = 0;
                                                    if (incTax > 0) {
                                                        const costILS = layer.originalCostILS.amount;
                                                        const feesILS = convertCurrency(layer.fees.amount, layer.fees.currency, Currency.ILS, exchangeRates || undefined);
                                                        estimatedIncTaxILS = (costILS + feesILS) * incTax;
                                                    }
                                                    const estimatedCapTaxILS = taxILS - estimatedIncTaxILS;

                                                    return (
                                                        <Tooltip
                                                            enterTouchDelay={0}
                                                            leaveTouchDelay={3000}
                                                            title={
                                                                <Box sx={{ p: 1 }}>
                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Unrealized Tax Liability', 'חבות מס לא ממומשת')}</Typography>

                                                                    <Box display="grid" gridTemplateColumns="1fr auto" gap={1} sx={{ fontSize: '0.8rem', mt: 1 }}>
                                                                        {(estimatedIncTaxILS > 0 || p?.taxOnBase) && (
                                                                            <>
                                                                                <Typography variant="body2">{t('Capital Tax:', 'מס רווח הון:')}</Typography>
                                                                                <Typography variant="body2">{formatValue(estimatedCapTaxILS, Currency.ILS)}</Typography>

                                                                                <Typography variant="body2">{t('Income Tax:', 'מס הכנסה:')}</Typography>
                                                                                <Typography variant="body2">{formatValue(estimatedIncTaxILS, Currency.ILS)}</Typography>

                                                                                <Box sx={{ gridColumn: '1 / -1', borderTop: '1px dashed', borderColor: 'divider', my: 0.5 }} />
                                                                            </>
                                                                        )}

                                                                        <Typography variant="body2" fontWeight="bold">{t('Total Tax:', 'סה"כ מס:')}</Typography>
                                                                        <Typography variant="body2" fontWeight="bold">{formatValue(taxILS, Currency.ILS)}</Typography>

                                                                        <Box sx={{ gridColumn: '1 / -1', borderTop: '1px dotted', borderColor: 'divider', my: 0.5, pt: 0.5 }}>
                                                                            <Typography variant="body2" color="text.secondary">{t('Realized Tax Paid:', 'מס ששולם:')} {formatMoneyValue(layer.realizedTax)}</Typography>
                                                                        </Box>
                                                                    </Box>
                                                                </Box>
                                                            }
                                                        >
                                                            <Box component="span" sx={{
                                                                borderBottom: '1px dotted',
                                                                borderColor: 'text.secondary',
                                                                display: 'inline-block',
                                                                cursor: 'help',
                                                                fontWeight: isNegativeTax ? 'bold' : 'normal'
                                                            }}>
                                                                {formatValue(totalTax, displayCurrency)}
                                                            </Box>
                                                        </Tooltip>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: vestColor, fontWeight: isVested ? 'bold' : 'normal' }}>
                                                {vestDate ? formatDate(vestDate) : '-'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </Box>
    );
}
