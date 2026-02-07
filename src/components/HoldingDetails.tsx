import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Link, Stack, CircularProgress, IconButton } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency, convertMoney } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import { Currency } from '../lib/types';
import type { DashboardHolding, Transaction, ExchangeRates, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { Lot, Holding, DividendRecord } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useNavigate } from 'react-router-dom';

export type HoldingSection = 'holdings' | 'transactions' | 'dividends';

export interface HoldingWeight {
    portfolioId: string;
    portfolioName: string;
    weightInPortfolio: number;
    weightInGlobal: number;
    value: number;
}

interface HoldingDetailsProps {
    sheetId: string;
    holding: Holding | EnrichedDashboardHolding;
    holdings?: any[];
    displayCurrency: string;
    portfolios: Portfolio[];
    onPortfolioClick: (id: string) => void;
    section?: HoldingSection;
}

const formatDate = (dateInput: string | Date | number) => {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        const [y, m, d] = dateInput.split('-');
        return `${d}/${m}/${y}`;
    }
    const date = new Date(dateInput);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

export function HoldingDetails({ sheetId, holding, holdings, displayCurrency, portfolios, onPortfolioClick, section = 'holdings' }: HoldingDetailsProps) {
    const { t } = useLanguage();
    const navigate = useNavigate();

    // Check if enriched (has activeLots, etc) or use raw holding
    const isEnriched = (h: any): h is EnrichedDashboardHolding => 'activeLots' in h;
    const enriched = isEnriched(holding) ? holding : null;

    const matchingHoldings = useMemo(() => {
        if (!holdings || holdings.length === 0) return [holding];
        return holdings.filter(h => h.ticker === holding.ticker && (h.exchange === holding.exchange || !h.exchange));
    }, [holding, holdings]);

    const transactions = useMemo(() => {
        // Aggregate transactions from all matching holdings
        return matchingHoldings.flatMap(h => {
            // Handle Enriched or raw Holding
            // Both Holding and EnrichedDashboardHolding have `transactions` property
            return (h as any).transactions || [];
        });
    }, [matchingHoldings]);

    const dividendHistory = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            // Both have `dividends` property
            return ((h as any).dividends || []) as DividendRecord[];
        });
    }, [matchingHoldings]);

    const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getExchangeRates(sheetId)
            .then(rates => { setExchangeRates(rates); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, [sheetId]);

    // Calculate Weights across all portfolios
    const holdingsWeights = useMemo(() => {
        if (!portfolios || portfolios.length === 0 || !exchangeRates) return [];

        const targetCurrency = normalizeCurrency(displayCurrency || 'USD');

        let totalAum = 0;
        const portfolioValues: Record<string, number> = {};

        portfolios.forEach(p => {
            const pValue = p.holdings?.reduce((sum, h) => sum + convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates), 0) || 0;
            portfolioValues[p.id] = pValue;
            totalAum += pValue;
        });

        const results: any[] = [];
        portfolios.forEach(p => {
            const h = p.holdings?.find(h => h.ticker === holding.ticker && (h.exchange === (holding as any).exchange || !h.exchange));

            if (h) {
                const hValue = convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates);
                const pValue = portfolioValues[p.id] || 0;
                results.push({
                    portfolioId: p.id,
                    portfolioName: p.name,
                    weightInPortfolio: pValue > 0 ? hValue / pValue : 0,
                    weightInGlobal: totalAum > 0 ? hValue / totalAum : 0,
                    value: hValue
                });
            }
        });
        return results;
    }, [portfolios, holding, exchangeRates, displayCurrency]);

    const vals = useMemo(() => {
        const defaultVals = {
            marketValue: 0,
            unrealizedGain: 0,
            realizedGain: 0,
            realizedGainAfterTax: 0,
            totalGain: 0,
            valueAfterTax: 0,
            dayChangeVal: 0,
            costBasis: 0,
            costOfSold: 0,
            proceeds: 0,
            dividends: 0,
            unvestedValue: 0,
            // Weighted avg inputs
            totalQty: 0,
            totalCost: 0,
            realizedNetBase: 0,
            realizedTaxBase: 0,
            unrealizedTaxBase: 0,
            realizedTax: 0,
            unrealizedTax: 0,
            // Computed fields
            unrealizedGainPct: 0,
            realizedGainPct: 0,
            totalGainPct: 0,
            dayChangePct: 0,
            avgCost: 0,
            currentPrice: 0
        };

        if (!matchingHoldings || matchingHoldings.length === 0 || !exchangeRates) return defaultVals;

        const agg = { ...defaultVals };

        let currentPrice = 0;
        const totalStockCurrency = (matchingHoldings[0] as any).stockCurrency || 'USD';

        matchingHoldings.forEach(h => {
            // Handle Enriched vs Raw
            const raw = h as Holding; 

            // Accumulate Base Metrics (Converting to Display Currency)
            // Use convertMoney helper
            agg.marketValue += convertMoney(raw.marketValueVested, displayCurrency, exchangeRates).amount;
            agg.unvestedValue += convertMoney(raw.marketValueUnvested, displayCurrency, exchangeRates).amount;
            agg.costBasis += convertMoney(raw.costBasisVested, displayCurrency, exchangeRates).amount;
            agg.costOfSold += convertMoney(raw.costOfSoldTotal, displayCurrency, exchangeRates).amount;
            agg.proceeds += convertMoney(raw.proceedsTotal, displayCurrency, exchangeRates).amount;
            agg.dividends += convertMoney(raw.dividendsTotal, displayCurrency, exchangeRates).amount;

            const rGainNetDisplay = convertMoney(raw.realizedGainNet, displayCurrency, exchangeRates).amount;
            agg.realizedNetBase += rGainNetDisplay;

            const rTax = raw.realizedTax || 0;
            const rTaxDisplay = convertCurrency(rTax, Currency.ILS, displayCurrency, exchangeRates);
            agg.realizedTaxBase += rTaxDisplay;

            // Fix: Calculate unrealized tax ONLY for Vested lots to avoid negative "Net" on Vested Value
            // raw.unrealizedTaxLiabilityILS includes ALL active lots (vested + unvested)
            const vestedTax = (raw.activeLots || []).reduce((sum, lot) => {
                const isVested = !lot.vestingDate || new Date(lot.vestingDate) <= new Date();
                if (isVested && lot.unrealizedTax) {
                    // lot.unrealizedTax is in Portfolio Currency (raw.portfolioCurrency)
                    return sum + convertCurrency(lot.unrealizedTax, raw.portfolioCurrency || 'USD', displayCurrency, exchangeRates);
                }
                return sum;
            }, 0);

            agg.unrealizedTaxBase += vestedTax;

            agg.totalQty += raw.qtyVested || 0;

            // Day Change (Value)
            const dcPct = raw.dayChangePct || 0;
            if (dcPct !== 0) {
                const price = raw.currentPrice || 0;
                // change per unit in stock currency
                const chgPerUnit = price * dcPct; 
                // value change in Stock Currency
                const valChgSC = chgPerUnit * (raw.qtyVested || 0);
                agg.dayChangeVal += convertCurrency(valChgSC, raw.stockCurrency || 'USD', displayCurrency, exchangeRates);
            }

            currentPrice = raw.currentPrice || currentPrice;
        });

        // Derived Totals (in Display Currency)
        agg.unrealizedGain = agg.marketValue - agg.costBasis;
        agg.realizedGain = agg.realizedNetBase + agg.dividends; // RealizedNet + Divs
        agg.realizedGainAfterTax = agg.realizedGain - agg.realizedTaxBase;
        agg.totalGain = agg.unrealizedGain + agg.realizedGain;
        agg.valueAfterTax = agg.marketValue - agg.unrealizedTaxBase;

        // Derived Pcts
        const unrealizedGainPct = agg.costBasis > 0 ? agg.unrealizedGain / agg.costBasis : 0;
        const realizedGainPct = agg.costOfSold > 0 ? (agg.realizedNetBase) / agg.costOfSold : 0;

        const totalGainPct = (agg.costBasis + agg.costOfSold) > 0 ? agg.totalGain / (agg.costBasis + agg.costOfSold) : 0;
        const dayChangePct = agg.marketValue > 0 ? agg.dayChangeVal / (agg.marketValue - agg.dayChangeVal) : 0;

        // Avg Cost
        const totalVestedQty = matchingHoldings.reduce((s, h) => s + ((h as Holding).qtyVested || 0), 0);
        const avgCost = totalVestedQty > 0 ? agg.costBasis / totalVestedQty : 0;

        // Return matching structure
        return {
            marketValue: agg.marketValue,
            unrealizedGain: agg.unrealizedGain,
            unrealizedGainPct,
            realizedGain: agg.realizedGain,
            realizedGainPct,
            realizedGainAfterTax: agg.realizedGainAfterTax,
            totalGain: agg.totalGain,
            totalGainPct,
            valueAfterTax: agg.valueAfterTax,
            dayChangeVal: agg.dayChangeVal,
            dayChangePct,
            costBasis: agg.costBasis,
            costOfSold: agg.costOfSold,
            proceeds: agg.proceeds,
            dividends: agg.dividends,
            currentPrice: convertCurrency(currentPrice, totalStockCurrency, displayCurrency, exchangeRates),
            avgCost,
            weightInPortfolio: 0,
            weightInGlobal: 0,
            unvestedValue: agg.unvestedValue,
            realizedTax: agg.realizedTaxBase,
            unrealizedTax: agg.unrealizedTaxBase
        };

    }, [matchingHoldings, exchangeRates, displayCurrency]);

    // Transactions are already filtered for this holding in UnifiedHolding
    const txnHistory = useMemo(() => {
        return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    const divHistory = useMemo(() => {
        return dividendHistory.map((d) => {
            return {
                ...d,
                date: new Date(d.date),
                source: 'System', 
            };
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [dividendHistory]);

    const layers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            if (enrichedH?.activeLots) return enrichedH.activeLots;
            if ((h as any).activeLots) return (h as any).activeLots;
            if ((h as any)._lots) {
                return ((h as any)._lots as Lot[]).filter(l => !l.soldDate && l.qty > 0);
            }
            return [];
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [matchingHoldings]);

    const realizedLayers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            if (enrichedH?.realizedLots) return enrichedH.realizedLots;
            if ((h as any).realizedLots) return (h as any).realizedLots;
            if ((h as any)._lots) {
                return ((h as any)._lots as Lot[]).filter(l => l.soldDate);
            }
            return [];
        }).sort((a, b) => (b.soldDate?.getTime() || 0) - (a.soldDate?.getTime() || 0));
    }, [matchingHoldings]);

    const stockCurrency = (holding as DashboardHolding).stockCurrency || (holding as Holding).stockCurrency || 'USD';
    const totalQty = useMemo(() => {
        return matchingHoldings.reduce((sum, h) => sum + ((h as Holding).qtyTotal || 0), 0);
    }, [matchingHoldings]);

    const totalFeesDisplay = useMemo(() => {
        return txnHistory.reduce((sum, txn) => {
            const fee = txn.commission || 0;
            const c = txn.currency || stockCurrency;
            return sum + convertCurrency(fee, c, displayCurrency, exchangeRates || undefined);
        }, 0);
    }, [txnHistory, stockCurrency, displayCurrency, exchangeRates]);

    const totalGlobalWeight = useMemo(() => {
        return holdingsWeights.reduce((sum, w) => sum + w.weightInGlobal, 0);
    }, [holdingsWeights]);

    // Add Total Value for Portfolio Distribution
    const totalGlobalValue = useMemo(() => {
        return holdingsWeights.reduce((sum, w) => sum + w.value, 0);
    }, [holdingsWeights]);

    const portfolioNameMap = useMemo(() => {
        return portfolios.reduce((acc, p) => {
            acc[p.id] = p.name;
            return acc;
        }, {} as Record<string, string>);
    }, [portfolios]);

    const handleEditTransaction = (txn: Transaction) => {
        navigate('/transaction', {
            state: {
                editTransaction: txn,
                initialName: enriched?.displayName || (holding as any).displayName,
                initialNameHe: enriched?.nameHe || (holding as any).nameHe
            }
        });
    };

    if (loading) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ mt: 2 }}>
            {/* SECTION: HOLDINGS */}
            {section === 'holdings' && (
                <Box>
                    {!vals ? (
                        <Box sx={{ p: 2, textAlign: 'center' }}>
                            <Typography color="text.secondary">{t('Calculating holding details...', 'מחשב פרטי החזקה...')}</Typography>
                        </Box>
                    ) : (
                        <>
                            <Typography variant="h6" gutterBottom color="primary" sx={{ fontWeight: 'bold' }}>
                                {t('My Position', 'הפוזיציה שלי')}
                            </Typography>

                            {(() => {
                                    const hasGrants = layers.some(l => !!l.vestingDate || !!(l as any).vestDate);
                                    let unvestedVal = 0;
                                    let unvestedGain = 0;

                                    if (hasGrants) {
                                        const currentPrice = (holding as DashboardHolding).currentPrice || (holding as Holding).currentPrice || 0;
                                        layers.forEach(l => {
                                            const vDate = l.vestingDate || (l as any).vestDate;
                                            if (vDate && new Date(vDate) > new Date()) {
                                                const qty = l.qty || 0;
                                                const layerVal = qty * currentPrice;
                                                const costVal = l.costPerUnit?.amount ?? (l as any).price ?? 0;
                                                const layerCost = qty * costVal;
                                                unvestedVal += layerVal;
                                                unvestedGain += (layerVal - layerCost);
                                            }
                                        });
                                    }

                                    const unvestedValDisplay = convertCurrency(unvestedVal, stockCurrency, displayCurrency, exchangeRates || undefined);
                                    const unvestedGainDisplay = convertCurrency(unvestedGain, stockCurrency, displayCurrency, exchangeRates || undefined);
                                    const vestedValDisplay = vals.marketValue;

                                    // Unified Layers Logic
                                    const unifiedLayers = (() => {
                                        const allLots = [...layers, ...realizedLayers];
                                        const groups: Record<string, {
                                            originalTxnId: string;
                                            date: Date;
                                            vestingDate?: Date;
                                            price: number;
                                            currency: string;
                                            originalQty: number;
                                            remainingQty: number;
                                            soldQty: number;
                                            originalCost: number;
                                            currentValue: number;
                                            realizedGain: number;
                                            taxLiability: number;
                                        }> = {};

                                        allLots.forEach(lot => {
                                            const key = lot.originalTxnId || `unknown_${lot.date.getTime()}_${lot.costPerUnit.amount}`;
                                            if (!groups[key]) {
                                                // Deriving original stock currency price
                                                const originalPriceSC = lot.costPerUnit.amount / (lot.costPerUnit.rateToPortfolio || 1);
                                                groups[key] = {
                                                    originalTxnId: key,
                                                    date: new Date(lot.date),
                                                    vestingDate: lot.vestingDate ? new Date(lot.vestingDate) : undefined,
                                                    price: originalPriceSC,
                                                    currency: stockCurrency, // Use Stock Currency
                                                    originalQty: 0,
                                                    remainingQty: 0,
                                                    soldQty: 0,
                                                    originalCost: 0,
                                                    currentValue: 0,
                                                    realizedGain: 0,
                                                    taxLiability: 0
                                                };
                                            }
                                            const g = groups[key];
                                            g.originalQty += lot.qty;
                                            g.originalCost += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);

                                            if (lot.soldDate) {
                                                g.soldQty += lot.qty;
                                                g.realizedGain += convertMoney(lot.realizedGainNet ? { amount: lot.realizedGainNet, currency: lot.costTotal.currency } : undefined, displayCurrency, exchangeRates || undefined).amount;
                                                g.taxLiability += convertCurrency(lot.realizedTax || 0, Currency.ILS, displayCurrency, exchangeRates || undefined);
                                            } else {
                                                g.remainingQty += lot.qty;
                                                // Current Value of remaining
                                                const currentPrice = (holding as any).currentPrice || 0;
                                                // Value in Portfolio Currency (Display)
                                                // We need to convert price from Stock Currency to Display
                                                const valSC = lot.qty * currentPrice;
                                                g.currentValue += convertCurrency(valSC, stockCurrency, displayCurrency, exchangeRates || undefined);
                                                // Unrealized Tax
                                                g.taxLiability += convertCurrency(lot.unrealizedTax || 0, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
                                            }
                                        });

                                        return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
                                    })();

                                    return (
                                        <>
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
                                                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>{t('Net Realized', 'מימוש נטו')}</Typography>
                                                        <Typography variant="h6" fontWeight="700" color={vals.realizedGainAfterTax >= 0 ? 'success.main' : 'error.main'}>
                                                            {formatValue(vals.realizedGainAfterTax, displayCurrency)}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ display: 'block', mt: -0.5 }} color={vals.realizedGainAfterTax >= 0 ? 'success.main' : 'error.main'}>
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

                                                <Grid container spacing={2}>
                                                    <Grid item xs={6} sm={2.4}>
                                                        <Typography variant="caption" color="text.secondary">{t('Avg Cost', 'מחיר ממוצע')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatPrice(vals.avgCost, displayCurrency)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={2.4}>
                                                        <Typography variant="caption" color="text.secondary">{t('Quantity', 'כמות')}</Typography>
                                                        <Typography variant="body1" fontWeight="500">{formatNumber(totalQty)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={2.4}>
                                                        <Typography variant="caption" color="text.secondary">{t('Total Cost', 'עלות מקורית')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatValue(vals.costBasis, displayCurrency)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={2.4}>
                                                        <Typography variant="caption" color="text.secondary">{t('Total Fees', 'סה"כ עמלות')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatValue(totalFeesDisplay, displayCurrency)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={2.4}>
                                                        <Typography variant="caption" color="text.secondary">{t('Taxes Paid', 'מס ששולם')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatValue(vals.realizedTax, displayCurrency)}</Typography>
                                                    </Grid>
                                                </Grid>
                                            </Paper>

                                            <Stack spacing={3} sx={{ mb: 3 }}>
                                                {/* Stack Layout for Distribution and Layers */}

                                                <Box>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Portfolio Distribution', 'התפלגות בתיקים')}</Typography>
                                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, px: 1 }}>
                                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>{t('Portfolio', 'תיק')}</Typography>
                                                            <Box sx={{ display: 'flex', gap: 2 }}>
                                                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: 90, textAlign: 'right' }}>
                                                                    {t(hasGrants ? 'Total Value' : 'Value', hasGrants ? 'שווי כולל' : 'שווי')}
                                                                </Typography>
                                                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', minWidth: 110, textAlign: 'right' }}>{t('Weight in Portfolio', 'משקל בתיק')}</Typography>
                                                            </Box>
                                                        </Box>
                                                        <Divider sx={{ mb: 2 }} />

                                                        <Stack spacing={1.5}>
                                                            {holdingsWeights.map((w) => (
                                                                <Box key={w.portfolioId} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden', mr: 1 }}>
                                                                        <Link
                                                                            component="button"
                                                                            variant="body2"
                                                                            underline="hover"
                                                                            onClick={() => onPortfolioClick(w.portfolioId)}
                                                                            sx={{ fontWeight: '600', textAlign: 'left', color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                                        >
                                                                            {w.portfolioName}
                                                                        </Link>
                                                                    </Box>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                                                        <Typography variant="body2" sx={{ minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                                            {formatValue(w.value, displayCurrency)}
                                                                        </Typography>
                                                                        <Box sx={{ minWidth: 110, textAlign: 'right' }}>
                                                                            <Typography variant="body2" fontWeight="bold" color="text.primary">
                                                                                {formatPercent(w.weightInPortfolio)}
                                                                            </Typography>
                                                                        </Box>
                                                                    </Box>
                                                                </Box>
                                                            ))}
                                                        </Stack>
                                                        <Divider sx={{ my: 2 }} />
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                                                            <Typography variant="body2" fontWeight="bold">{t('All portfolios', 'כל התיקים')}</Typography>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                                                <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 90, textAlign: 'right' }}>
                                                                    {formatValue(totalGlobalValue, displayCurrency)}
                                                                </Typography>
                                                                <Typography variant="body2" fontWeight="bold" color="primary.main" sx={{ minWidth: 110, textAlign: 'right' }}>
                                                                    {formatPercent(totalGlobalWeight)}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    </Paper>
                                                </Box>

                                                <Box>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Layers', 'שכבות')}</Typography>
                                                    <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
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
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                                                            {t('Tax Liability', 'חבות מס')}
                                                                            <Tooltip title={t('Estimated tax liability. Takes fees into account but does not offset losses from other assets.', 'חבות מס משוערת. מתחשב בעמלות אך לא בקיזוז הפסדים מנכסים אחרים.')} enterTouchDelay={0}>
                                                                                <IconButton size="small" sx={{ p: 0.5 }}>
                                                                                    <InfoOutlinedIcon fontSize="small" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                                                                </IconButton>
                                                                            </Tooltip>
                                                                        </Box>
                                                                    </TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting', 'הבשלה')}</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {unifiedLayers.length === 0 && (
                                                                    <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No layers found.', 'לא נמצאו שכבות.')}</TableCell></TableRow>
                                                                )}
                                                                {unifiedLayers.map((layer, i) => {
                                                                    const vestDate = layer.vestingDate;
                                                                    const isVested = !vestDate || vestDate <= new Date();
                                                                    const vestColor = vestDate ? (isVested ? 'success.main' : 'text.secondary') : 'inherit';
                                                                    const soldPct = layer.originalQty > 0 ? layer.soldQty / layer.originalQty : 0;

                                                                    return (
                                                                        <TableRow key={layer.originalTxnId || i}>
                                                                            <TableCell>{formatDate(layer.date)}</TableCell>
                                                                            <TableCell align="right">
                                                                                <Box display="inline-block">
                                                                                    {formatNumber(layer.originalQty)}
                                                                                </Box>
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                <Tooltip title={`${t('Sold:', 'נמכר:')} ${formatNumber(layer.soldQty)} (${formatPercent(soldPct)})`}>
                                                                                    <Box display="inline-block" sx={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                                                                                        {formatNumber(layer.remainingQty)}
                                                                                    </Box>
                                                                                </Tooltip>
                                                                            </TableCell>
                                                                            <TableCell align="right">{formatPrice(layer.price, layer.currency)}</TableCell>
                                                                            <TableCell align="right">{formatValue(layer.originalCost, displayCurrency)}</TableCell>
                                                                            <TableCell align="right">
                                                                                {layer.remainingQty > 0 ? formatValue(layer.currentValue, displayCurrency) : '-'}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                {layer.soldQty > 0 ? formatValue(layer.realizedGain, displayCurrency) : '-'}
                                                                            </TableCell>
                                                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>
                                                                                {formatValue(layer.taxLiability, displayCurrency)}
                                                                            </TableCell>
                                                                            <TableCell align="right" sx={{ color: vestColor, fontWeight: isVested ? 'bold' : 'normal' }}>
                                                                                {vestDate ? formatDate(vestDate) : '-'}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </Paper>
                                                </Box>
                                            </Stack>
                                        </>
                                    );
                                })()}
                        </>
                    )}
                </Box>
            )}

            {/* SECTION: TRANSACTIONS */}
            {section === 'transactions' && (
                <Box>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Transaction History', 'היסטוריית עסקאות')}</Typography>
                    <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Action', 'פעולה')}</TableCell>
                                    <TableCell sx={{ bgcolor: 'background.paper', maxWidth: 100 }}>{t('Portfolio', 'תיק')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Price', 'מחיר')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Value', 'שווי')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Fees', 'עמלות')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting Date', 'תאריך הבשלה')}</TableCell>
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {txnHistory.map((txn, i) => {
                                    const rawValue = (txn.qty || 0) * (txn.price || 0);
                                    const fees = txn.commission || 0;
                                    const tickerCurrency = txn.currency || 'USD';

                                    // If vesting date exists and type is BUY, show Grant
                                    let typeLabel = txn.type;
                                    if (txn.type === 'BUY' && txn.vestDate) {
                                        typeLabel = 'Grant' as any;
                                    }
                                    const txnPortfolioName = portfolioNameMap[txn.portfolioId] || txn.portfolioId;

                                    const titleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
                                    const displayLabel = titleCase(typeLabel === 'Grant' ? 'Grant' : txn.type);

                                    return (
                                        <TableRow key={i} hover>
                                            <TableCell>{formatDate(txn.date)}</TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="caption"
                                                    fontWeight="bold"
                                                    sx={{ color: txn.type === 'BUY' ? 'primary.main' : txn.type === 'SELL' ? 'secondary.main' : 'text.secondary' }}
                                                >
                                                    {displayLabel}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <Tooltip title={txnPortfolioName} enterTouchDelay={0} leaveTouchDelay={3000}>
                                                    <span>{txnPortfolioName}</span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="right">{formatNumber(txn.qty)}</TableCell>
                                            <TableCell align="right">{formatPrice(txn.price || 0, tickerCurrency)}</TableCell>
                                            <TableCell align="right">{formatValue(rawValue, tickerCurrency)}</TableCell>
                                            <TableCell align="right" sx={{ color: 'text.secondary' }}>{fees > 0 ? formatValue(fees, tickerCurrency) : '-'}</TableCell>
                                            <TableCell align="right">{txn.vestDate ? formatDate(txn.vestDate) : '-'}</TableCell>
                                            <TableCell align="center">
                                                <Tooltip title={t('Edit Transaction', 'ערוך עסקה')}>
                                                    <IconButton size="small" onClick={() => handleEditTransaction(txn)}>
                                                        <EditIcon fontSize="small" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {txnHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Box>
            )}

            {/* SECTION: DIVIDENDS */}
            {section === 'dividends' && (
                <Box>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Dividends Received', 'דיבידנדים שהתקבלו')}</Typography>
                    <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Units Held', 'יחידות')}</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Dividend per Unit', 'דיבידנד ליחידה')}</TableCell>
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
                                        <TableCell>{formatDate(div.date)}</TableCell>
                                        <TableCell align="right">{formatNumber(div.unitsHeld || 0)}</TableCell>
                                        <TableCell align="right">{formatPrice(div.pricePerUnit || 0, div.grossAmount.currency)}</TableCell>
                                        <TableCell align="right">
                                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                                {formatValue(convertCurrency(div.netAmountPC, holding.portfolioCurrency, displayCurrency, exchangeRates || undefined), displayCurrency)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'text.secondary' }}>
                                            {div.cashedAmount ? formatValue(convertCurrency(div.cashedAmount, holding.portfolioCurrency, displayCurrency, exchangeRates || undefined), displayCurrency) : '-'}
                                        </TableCell>
                                        {divHistory.some(d => d.reinvestedAmount > 0) && (
                                            <TableCell align="right" sx={{ color: 'info.main' }}>
                                                {div.reinvestedAmount ? formatValue(convertCurrency(div.reinvestedAmount, holding.portfolioCurrency, displayCurrency, exchangeRates || undefined), displayCurrency) : '-'}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {divHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={divHistory.some(d => d.reinvestedAmount > 0) ? 6 : 5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No dividends found.', 'לא נמצאו דיבידנדים.')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Box>
            )}
        </Box>
    );
}