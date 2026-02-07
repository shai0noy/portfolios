import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Link, Stack, CircularProgress, IconButton } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import { Currency } from '../lib/types';
import type { DashboardHolding, Transaction, ExchangeRates, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { Lot, Holding } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
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
    holding: DashboardHolding | Holding;
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

    // Cast to enriched to access new props
    const enriched = (holding as any).display ? (holding as EnrichedDashboardHolding) : null;

    const matchingHoldings = useMemo(() => {
        if (!holdings || holdings.length === 0) return [holding];
        return holdings.filter(h => h.ticker === holding.ticker && (h.exchange === (holding as any).exchange || !h.exchange));
    }, [holding, holdings]);

    const transactions = useMemo(() => {
        // Aggregate transactions from all matching holdings
        return matchingHoldings.flatMap(h => {
            // Handle Enriched or raw Holding
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            return enrichedH?.transactions || (h as any).transactions || [];
        });
    }, [matchingHoldings]);

    const dividendHistory = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            return enrichedH?.dividendHistory || [];
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
                const pValue = portfolioValues[p.id] || 0;
                const hValue = convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates);
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
        if (!matchingHoldings || matchingHoldings.length === 0 || !exchangeRates) return undefined;

        const agg = {
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
        };

        let currentPrice = 0;
        const totalStockCurrency = (matchingHoldings[0] as any).stockCurrency || 'USD';

        matchingHoldings.forEach(h => {
            // Handle Enriched vs Raw
            const raw = h as Holding; // Assume it aligns with Holding interface getters

            // If enriched, use display (already converted). If not, convert from raw.
            // But to be safe and consistent, better to re-calculate from raw if available, or just use what we have.
            // If we mix enriched and raw, we must use raw for all or handle mix.
            // 'matchingHoldings' comes from 'holdings' prop which is from 'useDashboardData'.
            // 'useDashboardData' returns raw Holdings.
            // 'holding' prop (location.state) is Enriched.
            // 'matchingHoldings' finds matches in 'holdings'.
            // If 'holding' (enriched) is NOT in 'holdings' (raw list), we might miss it or duplicate?
            // Actually 'holdings' list should contain the object corresponding to 'holding'.
            // BUT 'holdings' list objects are distinct instances (reloaded?) or same memory?
            // If navigated from Dashboard, 'holding' is from that render cycle.
            // 'useDashboardData' fetches fresh engine.
            // Only if ids match.
            // Let's rely on raw getters and `convertCurrency`.

            const pCurrency = raw.portfolioCurrency || 'USD';

            // Getters from Holding model which return in Portfolio Currency
            // We need to verify if these getters exist and are public.
            // Check if h is valid object with methods
            // If it came from JSON (e.g. serialize), it might lose methods?
            // useDashboardData -> loadFinanceEngine -> returns Engine instance with class instances. Methods exist.

            // Check if h is valid object with methods
            // If it came from JSON (e.g. serialize), it might lose methods?
            // Fallback to manual calculation if getters are missing/undefined

            let mv = raw.marketValueVested?.amount ?? 0; // SimpleMoney
            let cb = raw.costBasisVested?.amount ?? 0;
            let unvested = raw.marketValueUnvested?.amount ?? 0;
            let proceeds = raw.proceedsTotal?.amount ?? 0;
            let divs = raw.dividendsTotal?.amount ?? 0;
            let realizedNet = raw.realizedGainNet?.amount ?? 0;
            let costOfSold = raw.costOfSoldTotal?.amount ?? 0;

            // let feesTotal = raw.feesTotal?.amount ?? 0; // Unused for display currently

            // Robust Fallback Calculation (if SimpleMoney fields are missing/zero logic?)
            // If the fields ARE SimpleMoney objects, the above ? .amount check handles it.
            // If they are missing (undefined), we fall back.
            // Note: raw is 'Holding'. engine.ts initializes them.
            // If raw comes from JSON (lost prototype), they might be just objects.

            // Check if we need to fallback calculating from lots?
            // If it's a Holding instance from Engine, it has the fields.
            // But if we are unsure, let's trust the fields first.

            if (raw.marketValueVested === undefined) {
                // Fallback Logic (only if fields are missing)
                const robustActiveLots = (raw as any).activeLots ?? ((raw as any)._lots ? ((raw as any)._lots as Lot[]).filter(l => !l.soldDate && l.qty > 0) : []);
                const robustRealizedLots = (raw as any).realizedLots ?? ((raw as any)._lots ? ((raw as any)._lots as Lot[]).filter(l => l.soldDate) : []);
                const currentPrice = raw.currentPrice || 0;

                mv = robustActiveLots.reduce((acc: number, l: Lot) => acc + (l.isVested ? l.qty * currentPrice : 0), 0);
                unvested = robustActiveLots.reduce((acc: number, l: Lot) => acc + (!l.isVested ? l.qty * currentPrice : 0), 0);
                cb = robustActiveLots.reduce((acc: number, l: Lot) => acc + (l.isVested ? l.costTotal.amount : 0), 0);

                // Realized Stats
                realizedNet = robustRealizedLots.reduce((acc: number, l: Lot) => acc + (l.realizedGainNet || 0), 0);
                costOfSold = robustRealizedLots.reduce((acc: number, l: Lot) => acc + l.costTotal.amount, 0);

                // Proceeds
                proceeds = robustRealizedLots.reduce((acc: number, l: Lot) => {
                    const cost = l.costTotal.amount;
                    const buyFee = l.feesBuy.amount;
                    const sellFee = l.soldFees?.amount || 0;
                    const gain = l.realizedGainNet || 0;
                    return acc + gain + cost + buyFee + sellFee;
                }, 0);

                // feesTotal = robustActiveLots.reduce((acc: number, l: Lot) => acc + l.feesBuy.amount, 0) +
                //     robustRealizedLots.reduce((acc: number, l: Lot) => acc + l.feesBuy.amount + (l.soldFees?.amount || 0), 0);

                // Dividends
                const rawDivs = (raw as any)._dividends || [];
                divs = rawDivs.reduce((acc: number, d: any) => acc + (d.netAmountPC || 0), 0);
            }

            // Accumulate Base Metrics (Converting to Display Currency)
            const sCurrency = raw.stockCurrency || 'USD';
            // We need to use the stored currency for the Money fields!
            const mvCurrency = raw.marketValueVested?.currency || sCurrency;
            const cbCurrency = raw.costBasisVested?.currency || pCurrency;
            const unvestedCurrency = raw.marketValueUnvested?.currency || sCurrency;

            // Note: proceeds, divs, realizedNet, fees are usually in PC.

            // Market Value & Unvested
            agg.marketValue += convertCurrency(mv, mvCurrency, displayCurrency, exchangeRates);
            agg.unvestedValue += convertCurrency(unvested, unvestedCurrency, displayCurrency, exchangeRates);

            // Cost, Proceeds, RealizedNet, Fees (Portfolio Currency)
            agg.costBasis += convertCurrency(cb, cbCurrency, displayCurrency, exchangeRates);
            agg.costOfSold += convertCurrency(costOfSold, raw.costOfSoldTotal?.currency || pCurrency, displayCurrency, exchangeRates);
            agg.proceeds += convertCurrency(proceeds, raw.proceedsTotal?.currency || pCurrency, displayCurrency, exchangeRates);
            agg.dividends += convertCurrency(divs, raw.dividendsTotal?.currency || pCurrency, displayCurrency, exchangeRates);

            const rGainNetDisplay = convertCurrency(realizedNet, raw.realizedGainNet?.currency || pCurrency, displayCurrency, exchangeRates);
            agg.realizedNetBase += rGainNetDisplay;

            const rTax = raw.realizedTax || 0;
            const rTaxDisplay = convertCurrency(rTax, Currency.ILS, displayCurrency, exchangeRates);
            agg.realizedTaxBase += rTaxDisplay;

            const uTax = raw.unrealizedTaxLiabilityILS ? convertCurrency(raw.unrealizedTaxLiabilityILS, Currency.ILS, pCurrency, exchangeRates) : 0;
            const uTaxDisplay = convertCurrency(uTax, pCurrency, displayCurrency, exchangeRates);
            agg.unrealizedTaxBase += uTaxDisplay;

            agg.totalQty += raw.qtyVested || 0;

            // Day Change (Value)
            const dcPct = raw.dayChangePct || 0;
            if (dcPct !== 0) {
                const price = raw.currentPrice || 0;
                // change per unit in stock currency
                const chgPerUnit = price * dcPct; // approx
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
        // Realized Pct: RealizedNet / CostOfSold?
        const realizedGainPct = agg.costOfSold > 0 ? (agg.realizedNetBase) / agg.costOfSold : 0; // Exclude divs for pure trade performance? 
        // Dashboard usually includes dividends in Total Gain but maybe not Realized Trade Gain?
        // Let's keep consistent with whatever previous code did:
        // previous: realizedGainPct = agg.realizedGain / agg.costOfSold. (And agg.realizedGain included divs).

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
            weightInPortfolio: 0, // Not relevant for aggregated
            weightInGlobal: 0, // Not relevant
            unvestedValue: agg.unvestedValue
        };

    }, [matchingHoldings, exchangeRates, displayCurrency]);

    // Transactions are already filtered for this holding in UnifiedHolding
    const txnHistory = useMemo(() => {
        return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    const divHistory = useMemo(() => {
        return dividendHistory.map((d, i) => {
        // DividendRecord structure: { date, grossAmount, netAmountPC, taxAmountPC, feeAmountPC }
        // We need to map it to what the table expects or update the table.
        // Table expects: { date, amount (per share?), heldQty, totalValue, payoutDetails, source, rowIndex }
        // Our new DividendRecord stores 'grossAmount' as Money (amount, currency).
        // It doesn't explicitly store 'per share' amount unless we calculate it or stored it.
        // Looking at model.ts: DividendRecord has grossAmount (total).
        // It does NOT have per-share amount or heldQty explicitly, unless we add it.
        // But we can approximate heldQty if we know price? No.
        // Engine processes dividends based on active lots at that time.
        // The simple DividendRecord might be insufficient for detailed display if we want 'per share'.
        // However, for now, let's just show the TOTAL amount.

            const grossVal = d.grossAmount.amount;
            return {
                date: new Date(d.date),
                amount: 0, // Per share unknown in simple record
                heldQty: 0, // Unknown
                totalValue: grossVal,
                currency: d.grossAmount.currency,
                payoutDetails: [],
                source: 'System', // d.source not in Record?
                rowIndex: i
            };
        }).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [dividendHistory]);

    const layers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            // Robust access: enriched -> getter -> private _lots scan
            if (enrichedH?.activeLots) return enrichedH.activeLots;
            if ((h as any).activeLots) return (h as any).activeLots;
            // Fallback for plain objects (lost prototype)
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
        // Aggregate fees from all transactions, converting each to display currency
        return txnHistory.reduce((sum, txn) => {
            const fee = txn.commission || 0;
            // Fee currency is usually the transaction currency (stock currency) or portfolio currency?
            // In the engine, fees are usually in Portfolio Currency? Or Transaction Currency?
            // "commission" in sheets is defined. 
            // We assume fee is in the same currency as the transaction price (stock currency).
            // Or use 'txn.currency'.
            const c = txn.currency || stockCurrency;
            return sum + convertCurrency(fee, c, displayCurrency, exchangeRates || undefined);
        }, 0);
    }, [txnHistory, stockCurrency, displayCurrency, exchangeRates]);

    const totalGlobalWeight = useMemo(() => {
        return holdingsWeights.reduce((sum, w) => sum + w.weightInGlobal, 0);
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
                                                // Handle costPerUnit (Money) or price (number)
                                                const costVal = l.costPerUnit?.amount ?? (l as any).price ?? 0;
                                                const layerCost = qty * costVal;
                                                unvestedVal += layerVal;
                                                unvestedGain += (layerVal - layerCost);
                                            }
                                        });
                                    }

                                    const unvestedValDisplay = convertCurrency(unvestedVal, stockCurrency, displayCurrency, exchangeRates || undefined);
                                    const unvestedGainDisplay = convertCurrency(unvestedGain, stockCurrency, displayCurrency, exchangeRates || undefined);
                                    // vals.marketValue is aggregated from 'marketValueVested' (see 'vals' memo), so it is ALREADY Vested Only.
                                    // No need to subtract unvestedValDisplay.
                                    const vestedValDisplay = vals.marketValue;

                                    return (
                                        <>
                                            <Paper variant="outlined" sx={{ p: 2, mb: 6 }}>
                                                <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />} justifyContent="space-around" sx={{ mb: 2 }}>
                                                    <Box>
                                                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', display: 'block' }}>
                                                            {t(hasGrants ? 'Vested Value' : 'Value', hasGrants ? 'שווי מובשל' : 'שווי')}
                                                        </Typography>
                                                        <Typography variant="h6" fontWeight="700">{formatValue(vestedValDisplay, displayCurrency)}</Typography>
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
                                                    <Grid item xs={6} sm={3}>
                                                        <Typography variant="caption" color="text.secondary">{t('Avg Cost', 'מחיר ממוצע')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatPrice(vals.avgCost, displayCurrency)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={3}>
                                                        <Typography variant="caption" color="text.secondary">{t('Quantity', 'כמות')}</Typography>
                                                        <Typography variant="body1" fontWeight="500">{formatNumber(totalQty)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={3}>
                                                        <Typography variant="caption" color="text.secondary">{t('Total Cost', 'עלות מקורית')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatValue(vals.costBasis, displayCurrency)}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6} sm={3}>
                                                        <Typography variant="caption" color="text.secondary">{t('Total Fees', 'סה"כ עמלות')}</Typography>
                                                        <Typography variant="body2" fontWeight="500">{formatValue(totalFeesDisplay, displayCurrency)}</Typography>
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
                                                            <Typography variant="body2" fontWeight="bold" color="primary.main">{formatPercent(totalGlobalWeight)}</Typography>
                                                        </Box>
                                                    </Paper>
                                                </Box>

                                                <Box>
                                                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Buy Layers', 'שכבות רכישה')}</Typography>
                                                    <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                                                        <Table size="small" stickyHeader>
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Price', 'מחיר')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total', 'סה"כ')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting Date', 'תאריך הבשלה')}</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {layers.length === 0 && (
                                                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No buy transactions found.', 'לא נמצאו עסקאות קנייה.')}</TableCell></TableRow>
                                                                )}
                                                                {layers.map((layer, i) => {
                                                                    const vestDate = layer.vestingDate ? new Date(layer.vestingDate) : null;
                                                                    const isVested = !vestDate || vestDate <= new Date();
                                                                    const vestColor = vestDate ? (isVested ? 'success.main' : 'text.secondary') : 'inherit';

                                                                    return (
                                                                        <TableRow key={layer.id || i}>
                                                                            <TableCell>{formatDate(layer.date)}</TableCell>
                                                                            <TableCell align="right">{formatNumber(layer.qty)}</TableCell>
                                                                            <TableCell align="right">{formatPrice(layer.costPerUnit.amount, layer.costPerUnit.currency)}</TableCell>
                                                                            <TableCell align="right">{formatValue(layer.costTotal.amount, layer.costTotal.currency)}</TableCell>
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

                                            <Box>
                                                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Realized Layers', 'מימושים (לפי שכבות)')}</Typography>
                                                <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                                                    <Table size="small" stickyHeader>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date Sold', 'תאריך מכירה')}</TableCell>
                                                                <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date Bought', 'תאריך קנייה')}</TableCell>
                                                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                                                                <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Gain', 'רווח')}</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {realizedLayers.length === 0 && (
                                                                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No realized lots found.', 'לא נמצאו מימושים.')}</TableCell></TableRow>
                                                            )}
                                                            {realizedLayers.map((layer, i) => (
                                                                <TableRow key={layer.id || i}>
                                                                    <TableCell>{formatDate(layer.soldDate || '')}</TableCell>
                                                                    <TableCell>{formatDate(layer.date)}</TableCell>
                                                                    <TableCell align="right">{formatNumber(layer.qty)}</TableCell>
                                                                    <TableCell align="right" sx={{ color: (layer.realizedGainNet || 0) >= 0 ? 'success.main' : 'error.main' }}>
                                                                        {formatValue(layer.realizedGainNet || 0, layer.costTotal.currency)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
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
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {txnHistory.map((txn, i) => {
                                    const rawValue = (txn.qty || 0) * (txn.price || 0);
                                    const fees = txn.commission || 0;
                                    const tickerCurrency = txn.currency || 'USD';


                                    const actionLabel = t(txn.type, txn.type);
                                    const txnPortfolioName = portfolioNameMap[txn.portfolioId] || txn.portfolioId;

                                    return (
                                        <TableRow key={i} hover>
                                            <TableCell>{formatDate(txn.date)}</TableCell>
                                            <TableCell>
                                                <Typography
                                                    variant="caption"
                                                    fontWeight="bold"
                                                    sx={{ color: txn.type === 'BUY' ? 'primary.main' : txn.type === 'SELL' ? 'secondary.main' : 'text.secondary' }}
                                                >
                                                    {actionLabel}
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
                                    <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
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
                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Amount', 'סכום')}</TableCell>
                                    <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {divHistory.map((div, i) => (
                                    <TableRow key={i} hover>
                                        <TableCell>{formatDate(div.date)}</TableCell>
                                        <TableCell align="right">
                                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                                                {formatValue(div.totalValue, div.currency)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            {/* Edit not currently supported for auto-ingested dividends in new model easily, but keeping placeholder if needed */}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {divHistory.length === 0 && (
                                    <TableRow><TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No dividend history recorded.', 'לא נמצאה היסטוריית דיבידנדים.')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Paper>
                </Box>
            )}
        </Box>
    );
}