import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Grid, Divider, Tooltip, Stack, CircularProgress, IconButton } from '@mui/material';
import { formatValue, formatNumber, formatPrice, convertCurrency, formatPercent, getExchangeRates, normalizeCurrency, convertMoney, calculatePerformanceInDisplayCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import { Currency } from '../lib/types';
import type { DashboardHolding, Transaction, ExchangeRates, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { Lot, Holding, DividendRecord } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useNavigate } from 'react-router-dom';

import { aggregateDividends } from '../lib/dividends';

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

export function HoldingDetails({ sheetId, holding, holdings, displayCurrency, portfolios, section = 'holdings' }: HoldingDetailsProps & { section?: string }) {
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
            // Attach portfolioCurrency to the record so we can convert it later
            const divs = ((h as any).dividends || []) as DividendRecord[];
            return divs.map(d => ({ ...d, portfolioCurrency: h.portfolioCurrency }));
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
            realizedGainGross: 0,
            realizedGainNet: 0,
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

        const agg = matchingHoldings.reduce((acc, h) => {
            // Check if Enriched
            const enriched = h as EnrichedDashboardHolding;
            if (enriched.display) {
                const d = enriched.display;
                acc.marketValue += d.marketValue;
                acc.unvestedValue += d.unvestedValue || 0;
                acc.costBasis += d.costBasis;
                acc.costOfSold += d.costOfSold;
                acc.proceeds += d.proceeds;
                acc.unrealizedGain += d.unrealizedGain;

                // Gross Realized from Enriched
                acc.realizedGain += d.realizedGain;
                acc.realizedGainGross += d.realizedGainGross || d.realizedGain; // Fallback
                acc.realizedGainNet += d.realizedGainNet;

                acc.dividends += d.dividends;
                acc.realizedTaxBase += (d as any).realizedTax || 0;
                acc.unrealizedTaxBase += (d as any).unrealizedTax || 0;

                // Day Change
                acc.dayChangeVal += d.dayChangeVal;
            } else {
                // Raw Holding
                const raw = h as Holding;
                acc.marketValue += convertMoney(raw.marketValueVested, displayCurrency, exchangeRates).amount;
                acc.unvestedValue += convertMoney(raw.marketValueUnvested, displayCurrency, exchangeRates).amount;
                acc.costBasis += convertMoney(raw.costBasisVested, displayCurrency, exchangeRates).amount;
                acc.costOfSold += convertMoney(raw.costOfSoldTotal, displayCurrency, exchangeRates).amount;
                acc.proceeds += convertMoney(raw.proceedsTotal, displayCurrency, exchangeRates).amount;

                const rGainNetDisplay = convertMoney(raw.realizedGainNet, displayCurrency, exchangeRates).amount;
                // raw.realizedGainNet is After-Fee, Pre-Tax.

                const taxPC = raw.totalTaxPaidPC ?? 0;
                const taxDisplay = convertCurrency(taxPC, raw.portfolioCurrency || 'USD', displayCurrency, exchangeRates);
                acc.realizedTaxBase += taxDisplay;

                // Dividends Net
                const divNet = convertMoney(raw.dividendsTotal, displayCurrency, exchangeRates).amount;
                acc.dividends += divNet;

                // Calculate Gross Divs for Raw
                let divsGross = divNet; // fallback
                const rawDivs = ((raw as any)._dividends || []) as DividendRecord[];
                if (rawDivs.length > 0) {
                    divsGross = rawDivs.reduce((s, d) => s + convertCurrency(d.grossAmount.amount, d.grossAmount.currency, displayCurrency, exchangeRates), 0);
                } else {
                    // Best effort: Net + Tax
                    // But we don't have Div Tax separately easily on Raw without loop.
                    // Just use Net.
                }

                // Gross Sells
                const proceedsDisplay = convertMoney(raw.proceedsTotal, displayCurrency, exchangeRates).amount;
                const costOfSoldDisplay = convertMoney(raw.costOfSoldTotal, displayCurrency, exchangeRates).amount;
                const sellsGross = proceedsDisplay - costOfSoldDisplay;

                acc.realizedGain += sellsGross + divsGross;
                acc.realizedGainGross += sellsGross + divsGross;

                // Net Realized = SellsNet (PreTax) - Tax + DivsNet
                // Note: taxDisplay includes Div Tax and CGT.
                // So (SellsNet + DivsNet) - TotalTax?
                // rGainNetDisplay (SellsNet, PreTax) + DivsNet - TotalTax.
                // But DivsNet (raw.dividendsTotal) is After Tax?
                // If DivsNet is After Tax, and TotalTax includes DivTax, then subtracting TotalTax from DivsNet double counts tax?
                // `raw.realizedGainNet`: Sells Proceeds - Cost - Fees. (Pre-Tax).
                // `raw.dividendsTotal`: Net Payout (After Tax).
                // `raw.totalTaxPaidPC`: Sum of CGT + DivTax + IncomeTax.
                // If we do: `realizedGainNet + dividendsTotal - totalTaxPaid`, we subtract DivTax from dividendsTotal (which is already net)?
                // No.
                // We want Realized Net (Pocket).
                // Pocket = (Sells Proceeds - Cost - Fees - CGT) + (Divs Nominal - Tax - Fee).
                // `raw.dividendsTotal` IS (Divs Nominal - Tax - Fee) (Pocket).
                // `raw.realizedGainNet` IS (Sells Proceeds - Cost - Fees) (Pre-Tax).
                // So Pocket = `raw.realizedGainNet` - CGT + `raw.dividendsTotal`.
                // We only have `totalTaxPaid`.
                // If `totalTaxPaid` = CGT + DivTax.
                // And `raw.dividendsTotal` is After DivTax.
                // Then `raw.realizedGainNet + raw.dividendsTotal - totalTaxPaid` = (SellsPreTax) + (DivsNet) - (CGT + DivTax).
                // = SellsPreTax - CGT + (DivsNet - DivTax).
                // This subtracts DivTax TWICE (once implies in DivsNet, once explicitly).
                // ERROR in my Logic or Understanding.

                // If `raw.dividendsTotal` is Net, we DON'T subtract DivTax again.
                // We only subtract CGT.
                // But we don't have CGT isolated easily?
                // `raw.realizedCapitalGainsTax` exists?
                // Yes, `h.realizedCapitalGainsTax` exists in `Holding`?
                // Let's check `types.ts` or `model.ts`.
                // `realizedCapitalGainsTax` is on `Holding`?
                // `dashbaord_calc.ts` used `h.realizedCapitalGainsTax`.
                // So we can use it.

                const cgtDisplay = convertCurrency(raw.realizedCapitalGainsTax || 0, raw.portfolioCurrency || 'USD', displayCurrency, exchangeRates);
                acc.realizedGainNet += (rGainNetDisplay - cgtDisplay) + divNet;

                // Day Change
                const dcPct = raw.dayChangePct || 0;
                if (dcPct !== 0) {
                    const { changeVal } = calculatePerformanceInDisplayCurrency(raw.currentPrice, raw.stockCurrency, dcPct, displayCurrency, exchangeRates);
                    acc.dayChangeVal += changeVal * (raw.qtyVested || 0);
                }

                // Unrealized Gain
                const unrealizedGain = convertMoney(raw.unrealizedGain, displayCurrency, exchangeRates).amount;
                acc.unrealizedGain += unrealizedGain;

                // Unrealized Tax
                // Approx?

                acc.totalQty += raw.qtyVested || 0;
            }
            return acc;
        }, { ...defaultVals }); // Use defaultVals as initial

        // Derived Totals (in Display Currency)

        // agg.realizedGainNet is already Net Sum.

        agg.realizedGainAfterTax = agg.realizedGainNet;

        agg.totalGain = agg.unrealizedGain + agg.realizedGain;
        agg.valueAfterTax = agg.marketValue - agg.unrealizedTaxBase;

        // Derived Pcts
        const unrealizedGainPct = agg.costBasis > 0 ? agg.unrealizedGain / agg.costBasis : 0;
        const realizedSellsGross = agg.proceeds - agg.costOfSold;
        const realizedGainPct = agg.costOfSold > 0 ? realizedSellsGross / agg.costOfSold : 0;

        const totalGainPct = (agg.costBasis + agg.costOfSold) > 0 ? agg.totalGain / (agg.costBasis + agg.costOfSold) : 0;
        const dayChangePct = agg.marketValue > 0 ? agg.dayChangeVal / (agg.marketValue - agg.dayChangeVal) : 0;

        // Avg Cost
        const totalVestedQty = matchingHoldings.reduce((s, h) => s + ((h as Holding).qtyVested || 0), 0);
        const avgCost = totalVestedQty > 0 ? agg.costBasis / totalVestedQty : 0;

        let currentPrice = 0;
        const totalStockCurrency = (matchingHoldings[0] as any).stockCurrency || 'USD';
        // If there's an enriched holding, use its current price. Otherwise, try to get it from a raw holding.
        const enrichedHolding = matchingHoldings.find(h => (h as EnrichedDashboardHolding).display) as EnrichedDashboardHolding;
        if (enrichedHolding?.display?.currentPrice) {
            currentPrice = enrichedHolding.display.currentPrice;
        } else if (matchingHoldings[0]) {
            currentPrice = (matchingHoldings[0] as Holding).currentPrice || 0;
        }


        // Return matching structure
        return {
            marketValue: agg.marketValue,
            unrealizedGain: agg.unrealizedGain,
            unrealizedGainPct,
            realizedGain: agg.realizedGain,
            realizedGainGross: agg.realizedGain,
            realizedGainNet: agg.realizedGainNet,
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
        return aggregateDividends(dividendHistory, displayCurrency, exchangeRates);
    }, [dividendHistory, displayCurrency, exchangeRates]);

    const layers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            let lots: Lot[] = [];
            if (enrichedH?.activeLots) lots = enrichedH.activeLots;
            else if ((h as any).activeLots) lots = (h as any).activeLots;
            else if ((h as any)._lots) {
                lots = ((h as any)._lots as Lot[]).filter(l => !l.soldDate && l.qty > 0);
            }
            return lots.map(l => ({ ...l, portfolioId: h.portfolioId }));
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [matchingHoldings]);

    const realizedLayers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            let lots: Lot[] = [];
            if (enrichedH?.realizedLots) lots = enrichedH.realizedLots;
            else if ((h as any).realizedLots) lots = (h as any).realizedLots;
            else if ((h as any)._lots) {
                lots = ((h as any)._lots as Lot[]).filter(l => l.soldDate);
            }
            else if ((h as any).realizedLots) lots = (h as any).realizedLots;
            else if ((h as any)._lots) {
                // Fallback for raw internal lots (less safe but works for now)
                lots = ((h as any)._lots as Lot[]).filter(l => l.soldDate);
            }
            return lots.map(l => ({ ...l, portfolioId: h.portfolioId }));
        }).sort((a, b) => (b.soldDate?.getTime() || 0) - (a.soldDate?.getTime() || 0));
    }, [matchingHoldings]);

    // For current holding context: currentHolding was unused.
    const stockCurrency = matchingHoldings[0]?.stockCurrency || Currency.USD;
    const totalQty = matchingHoldings.reduce((sum, h) => sum + ((h as any).qtyTotal || h.qtyTotal || 0), 0);

    const totalFeesDisplay = useMemo(() => {
        return txnHistory.reduce((sum, txn) => {
            const fee = txn.commission || 0;
            const c = txn.currency || stockCurrency;
            return sum + convertCurrency(fee, c, displayCurrency, exchangeRates || undefined);
        }, 0);
    }, [txnHistory, stockCurrency, displayCurrency, exchangeRates]);

    // totalGlobalWeight and totalGlobalValue were unused and removed.

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

                                    // Unified Layers Logic grouped by Portfolio
                                    const groupedLayers = (() => {
                                        const allLots = [...layers, ...realizedLayers];
                                        // Key: portfolioId -> Key: originalTxnId -> UnifiedLayer
                                        const portfolioGroups: Record<string, {
                                            stats: {
                                                qty: number;
                                                value: number;
                                                cost: number;
                                            };
                                            layers: Record<string, {
                                                originalTxnId: string;
                                                date: Date;
                                                vestingDate?: Date;
                                                price: number;
                                                currency: string;
                                                originalQty: number;
                                                remainingQty: number;
                                                soldQty: number;
                                                originalCost: number;
                                                remainingCost: number;
                                                fees: number;
                                                currentValue: number;
                                                realizedGain: number;
                                                taxLiability: number;
                                                realizedTax: number;
                                                unrealizedTax: number;
                                                adjustedCost: number;
                                                adjustedCostILS: number;
                                                originalCostILS: number;
                                                currentValueILS: number;
                                                adjustmentDetails?: { label: string; percentage: number };
                                            }>;
                                        }> = {};

                                        allLots.forEach(lot => {
                                            const pid = lot.portfolioId || 'unknown';
                                            if (!portfolioGroups[pid]) {
                                                portfolioGroups[pid] = {
                                                    stats: { qty: 0, value: 0, cost: 0 },
                                                    layers: {}
                                                };
                                            }

                                        const pGroup = portfolioGroups[pid];
                                        const layerKey = lot.originalTxnId || `unknown_${lot.date.getTime()}_${lot.costPerUnit.amount}`;

                                        if (!pGroup.layers[layerKey]) {
                                            const originalPriceSC = lot.costPerUnit.amount / (lot.costPerUnit.rateToPortfolio || 1);
                                            pGroup.layers[layerKey] = {
                                                originalTxnId: layerKey,
                                                date: new Date(lot.date),
                                                vestingDate: lot.vestingDate ? new Date(lot.vestingDate) : undefined,
                                                price: originalPriceSC,
                                                currency: stockCurrency,
                                                originalQty: 0,
                                                remainingQty: 0,
                                                soldQty: 0,
                                                originalCost: 0,
                                                remainingCost: 0,
                                                currentValue: 0,
                                                realizedGain: 0,
                                                taxLiability: 0,
                                                realizedTax: 0,
                                                unrealizedTax: 0,
                                                fees: 0,
                                                adjustedCost: 0,
                                                adjustedCostILS: 0,
                                                originalCostILS: 0,
                                                currentValueILS: 0,
                                                adjustmentDetails: undefined
                                            };
                                        }

                                        const g = pGroup.layers[layerKey];
                                        g.originalQty += lot.qty;
                                        g.originalCost += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
                                        g.fees += convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, displayCurrency, exchangeRates || undefined);
                                        if (lot.adjustedCostILS) {
                                            g.adjustedCostILS += lot.adjustedCostILS;
                                        }
                                        if (lot.costTotal.valILS) {
                                            g.originalCostILS += lot.costTotal.valILS;
                                        } else {
                                            // Fallback if valILS missing (shouldn't happen for IL_REAL_GAIN portfolios usually)
                                            g.originalCostILS += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, exchangeRates || undefined);
                                        }

                                        if (lot.adjustmentDetails) {
                                            g.adjustmentDetails = lot.adjustmentDetails;
                                        }

                                        if (lot.soldDate) {
                                            g.soldQty += lot.qty;
                                            g.realizedGain += convertMoney(lot.realizedGainNet ? { amount: lot.realizedGainNet, currency: lot.costTotal.currency } : undefined, displayCurrency, exchangeRates || undefined).amount;
                                            const rTax = convertCurrency(lot.totalRealizedTaxPC || 0, lot.costTotal?.currency || Currency.USD, displayCurrency, exchangeRates || undefined);
                                            g.taxLiability += rTax;
                                            g.realizedTax += rTax;
                                            g.fees += convertCurrency(lot.soldFees?.amount || 0, lot.soldFees?.currency || Currency.ILS, displayCurrency, exchangeRates || undefined);
                                        } else {
                                            g.remainingQty += lot.qty;
                                            g.remainingCost += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);

                                            const currentPrice = (holding as any).currentPrice || 0;
                                            const valSC = lot.qty * currentPrice;
                                            const valDisplay = convertCurrency(valSC, stockCurrency, displayCurrency, exchangeRates || undefined);
                                            g.currentValue += valDisplay;
                                            g.currentValueILS += convertCurrency(valSC, stockCurrency, Currency.ILS, exchangeRates || undefined);

                                            const uTax = convertCurrency(lot.unrealizedTax || 0, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
                                            g.taxLiability += uTax;
                                            g.unrealizedTax += uTax;

                                            if (lot.adjustedCost) {
                                                g.adjustedCost += convertCurrency(lot.adjustedCost, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
                                            }
                                        }
                                    });

                                        // Finalize stats and sort
                                        return Object.entries(portfolioGroups).map(([pid, group]) => {
                                            const sortedLayers = Object.values(group.layers).sort((a, b) => b.date.getTime() - a.date.getTime());

                                        // Ensure we have portfolio name
                                        const pName = portfolioNameMap[pid] || pid;
                                        const pWeightData = holdingsWeights.find(w => w.portfolioId === pid);

                                        const totalOriginalQty = sortedLayers.reduce((sum, l) => sum + l.originalQty, 0);
                                        const currentQty = sortedLayers.reduce((sum, l) => sum + l.remainingQty, 0);
                                        const totalValue = sortedLayers.reduce((sum, l) => sum + l.currentValue, 0); // Value of remaining
                                        const totalRemainingCost = sortedLayers.reduce((sum, l) => sum + l.remainingCost, 0);

                                        return {
                                            portfolioId: pid,
                                            portfolioName: pName,
                                            stats: {
                                                originalQty: totalOriginalQty,
                                                currentQty: currentQty,
                                                value: totalValue,
                                                cost: totalRemainingCost,
                                                weight: pWeightData?.weightInPortfolio || 0
                                            },
                                            layers: sortedLayers
                                        };
                                    });
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
                                                        <Typography variant="body2" fontWeight="500">{formatValue(totalFeesDisplay, displayCurrency)}</Typography>
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

                                            <Stack spacing={3} sx={{ mb: 3 }}>
                                                {/* Stack Layout for Distribution and Layers */}

                                                <Box sx={{ mb: 4 }}>
                                                    <Paper variant="outlined">
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Portfolio', 'תיק')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Weight', 'משקל')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Original Qty', 'כמות מקורית')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Current Qty', 'כמות נוכחית')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total Cost', 'עלות כוללת')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Value', 'שווי')}</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {groupedLayers.map(group => (
                                                                    <TableRow key={group.portfolioId} hover>
                                                                        <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>{group.portfolioName}</TableCell>
                                                                        <TableCell align="right">{formatPercent(group.stats.weight)}</TableCell>
                                                                        <TableCell align="right">{formatNumber(group.stats.originalQty)}</TableCell>
                                                                        <TableCell align="right">{formatNumber(group.stats.currentQty)}</TableCell>
                                                                        <TableCell align="right">{formatValue(group.stats.cost, displayCurrency)}</TableCell>
                                                                        <TableCell align="right">{formatValue(group.stats.value, displayCurrency)}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </Paper>
                                                </Box>

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
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Adj. Cost', 'עלות מתואמת')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Cur. Value', 'שווי נוכחי')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Realized', 'מומש')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Unrealized Gain', 'רווח לא ממומש')}</TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>
                                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                                                            {t('Tax Liab.', 'חבות מס')}
                                                                            <Tooltip title={t("Estimated Tax Liability. Includes Capital Gains Tax (on Realized + Unrealized) and Wealth Tax/Income Tax where applicable. Fees are deducted from taxable gain.", "חבות מס משוערת. כולל מס רווח הון (על מומש + לא ממומש) ומס יסף/הכנסה היכן שרלוונטי. עמלות מנוכות מהרווח החייב.")}>
                                                                                <InfoOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary', cursor: 'help' }} />
                                                                            </Tooltip>
                                                                        </Box>
                                                                    </TableCell>
                                                                    <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting', 'הבשלה')}</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {groupedLayers.length === 0 && (
                                                                    <TableRow><TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No layers found.', 'לא נמצאו שכבות.')}</TableCell></TableRow>
                                                                )}
                                                                {groupedLayers.map((group) => (
                                                                    <>
                                                                        {/* Portfolio Header Row */}
                                                                        <TableRow key={`header-${group.portfolioId}`} sx={{ bgcolor: 'action.hover' }}>
                                                                        <TableCell colSpan={10} sx={{ py: 1, pl: 2 }}>
                                                                            <Typography variant="subtitle2" fontWeight="bold" color="primary">
                                                                                {group.portfolioName}
                                                                            </Typography>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                    {/* Layers */}
                                                                    {group.layers.map((layer, i) => {
                                                                        const vestDate = layer.vestingDate;
                                                                        const isVested = !vestDate || vestDate <= new Date();
                                                                        const vestColor = vestDate ? (isVested ? 'success.main' : 'text.secondary') : 'inherit';
                                                                        const soldPct = layer.originalQty > 0 ? layer.soldQty / layer.originalQty : 0;

                                                                        return (
                                                                            <TableRow key={layer.originalTxnId || `${group.portfolioId}-${i}`}>
                                                                                <TableCell>{formatDate(layer.date)}</TableCell>
                                                                                <TableCell align="right">{formatNumber(layer.originalQty)}</TableCell>
                                                                                <TableCell align="right">
                                                                                    <Tooltip title={`${t('Sold:', 'נמכר:')} ${formatNumber(layer.soldQty)} (${formatPercent(soldPct)})`}>
                                                                                        <Box display="inline-block" sx={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                                                                                            {formatNumber(layer.remainingQty)}
                                                                                        </Box>
                                                                                    </Tooltip>
                                                                                </TableCell>
                                                                                <TableCell align="right">{formatPrice(layer.price, layer.currency)}</TableCell>
                                                                                <TableCell align="right">
                                                                                    {displayCurrency !== Currency.ILS ? (
                                                                                        <Tooltip
                                                                                            title={
                                                                                                <Box sx={{ p: 1 }}>
                                                                                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Nominal Cost (ILS)', 'עלות נומינלית (ש"ח)')}</Typography>
                                                                                                    <Typography variant="body2">{formatValue(layer.originalCostILS, Currency.ILS)}</Typography>
                                                                                                    {layer.originalCost > 0 && (
                                                                                                        <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                                                                            {t('Implied Rate:', 'שער רכישה:')} {formatNumber(layer.originalCostILS / layer.originalCost)}
                                                                                                        </Typography>
                                                                                                    )}
                                                                                                </Box>
                                                                                            }
                                                                                        >
                                                                                            <span style={{ cursor: 'help', borderBottom: '1px dotted #999' }}>
                                                                                                {formatValue(layer.originalCost, displayCurrency)}
                                                                                            </span>
                                                                                        </Tooltip>
                                                                                    ) : (
                                                                                        formatValue(layer.originalCost, displayCurrency)
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell align="right">
                                                                                    {(() => {
                                                                                        const p = portfolios.find(p => p.id === group.portfolioId);
                                                                                        if (p?.taxPolicy === 'IL_REAL_GAIN') {
                                                                                            return (
                                                                                                <Tooltip
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
                                                                                                    <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>
                                                                                                        {formatValue(layer.adjustedCostILS, Currency.ILS)}
                                                                                                    </Box>
                                                                                                </Tooltip>
                                                                                            );
                                                                                        }
                                                                                        return (
                                                                                            <Tooltip title={t('Not applicable for this tax policy (Nominal Gain applies)', 'לא רלוונטי למדיניות מס זו (חלק רווח נומינלי)')}>
                                                                                                <span style={{ cursor: 'help', color: 'text.disabled' }}>-</span>
                                                                                            </Tooltip>
                                                                                        );
                                                                                    })()}
                                                                                </TableCell>
                                                                                <TableCell align="right">
                                                                                    {(() => {
                                                                                        const isILS = displayCurrency === Currency.ILS;
                                                                                        const valContent = layer.remainingQty > 0 ? formatValue(layer.currentValue, displayCurrency) : '-';

                                                                                        if (layer.remainingQty <= 0) return valContent;

                                                                                        const p = portfolios.find(p => p.id === group.portfolioId);
                                                                                        const isRealGainPolicy = p?.taxPolicy === 'IL_REAL_GAIN';
                                                                                        const costBasisILS = (isRealGainPolicy && layer.adjustedCostILS) ? layer.adjustedCostILS : layer.originalCostILS;
                                                                                        const gainILS = layer.currentValueILS - costBasisILS;
                                                                                        const gainLabel = isRealGainPolicy ? t('Real Gain (ILS)', 'רווח ריאלי (ש"ח)') : t('Nominal Gain (ILS)', 'רווח נומינלי (ש"ח)');

                                                                                        const taxILS = convertCurrency(layer.unrealizedTax, displayCurrency, Currency.ILS, exchangeRates || undefined);
                                                                                        const gainPct = costBasisILS > 0 ? gainILS / costBasisILS : 0;

                                                                                        return (
                                                                                            <Tooltip
                                                                                                title={
                                                                                                    <Box sx={{ p: 1 }}>
                                                                                                        {!isILS && (
                                                                                                            <>
                                                                                                                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{t('Value (ILS)', 'שווי (ש"ח)')}</Typography>
                                                                                                                <Typography variant="body2" sx={{ mb: 1 }}>{formatValue(layer.currentValueILS, Currency.ILS)}</Typography>
                                                                                                            </>
                                                                                                        )}

                                                                                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{gainLabel}</Typography>
                                                                                                        <Typography variant="body2" color={gainILS >= 0 ? 'success.light' : 'error.light'}>
                                                                                                            {formatValue(gainILS, Currency.ILS)} ({formatPercent(gainPct)})
                                                                                                        </Typography>

                                                                                                        <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                                                                                            {t('Tax Due (Est.):', 'מס לתשלום (משוער):')} {formatValue(taxILS, Currency.ILS)}
                                                                                                        </Typography>
                                                                                                    </Box>
                                                                                                }
                                                                                            >
                                                                                                <Box component="span" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.secondary' }}>
                                                                                                    {valContent}
                                                                                                </Box>
                                                                                            </Tooltip>
                                                                                        );
                                                                                    })()}
                                                                                </TableCell>
                                                                                {/* Color Realized Gain: Green/Red if non-zero */}
                                                                                <TableCell align="right" sx={{ color: layer.realizedGain > 0 ? 'success.main' : layer.realizedGain < 0 ? 'error.main' : 'inherit' }}>
                                                                                    {layer.soldQty > 0 || layer.realizedGain !== 0 ? formatValue(layer.realizedGain, displayCurrency) : '-'}
                                                                                </TableCell>
                                                                                <TableCell align="right" sx={{ color: (layer.currentValue - layer.remainingCost) >= 0 ? 'success.main' : 'error.main' }}>
                                                                                    {layer.remainingQty > 0 ? formatValue(layer.currentValue - layer.remainingCost, displayCurrency) : '-'}
                                                                                </TableCell>
                                                                                <TableCell align="right" sx={{ color: 'text.secondary', cursor: 'help' }}>
                                                                                    <Tooltip
                                                                                        title={
                                                                                            <Box sx={{ p: 1 }}>
                                                                                                <Typography variant="subtitle2" sx={{ mb: 1, textDecoration: 'underline' }}>{t('Tax Breakdown', 'פירוט מס')}</Typography>
                                                                                                <Box display="grid" gridTemplateColumns="1fr auto" gap={1} sx={{ fontSize: '0.8rem' }}>
                                                                                                    <Typography variant="body2">{t('Realized Tax:', 'מס ששולם:')}</Typography>
                                                                                                    <Typography variant="body2">{formatValue(layer.realizedTax, displayCurrency)}</Typography>

                                                                                                    <Typography variant="body2">{t('Unrealized Tax:', 'מס על לא ממומש:')}</Typography>
                                                                                                    <Typography variant="body2">{formatValue(layer.unrealizedTax, displayCurrency)}</Typography>

                                                                                                    {layer.fees > 0 && (
                                                                                                        <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1', mt: 0.5, pt: 0.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                                                                                                            {t('* Fees are used to reduce taxable gain', '* העמלות משמשות להקטנת הרווח החייב')}
                                                                                                        </Typography>
                                                                                                    )}
                                                                                                </Box>
                                                                                            </Box>
                                                                                        }
                                                                                    >
                                                                                        <Box sx={{ borderBottom: '1px dotted', borderColor: 'text.secondary', display: 'inline-block' }}>
                                                                                            {formatValue(layer.realizedTax + layer.unrealizedTax, displayCurrency)}
                                                                                        </Box>
                                                                                    </Tooltip>
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
                                    const displayLabel = titleCase(typeLabel);

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
                                                    {(div as any).count > 1 && (
                                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                            ({(div as any).count} {t('records', 'רשומות')})
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
            )}
        </Box>
    );
}