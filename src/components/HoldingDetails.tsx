import { Box, Typography, CircularProgress } from '@mui/material';
import { convertCurrency, getExchangeRates, normalizeCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import { Currency } from '../lib/types';
import { InstrumentType } from '../lib/types/instrument';
import type { Transaction, ExchangeRates, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { Lot, Holding, DividendRecord } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { aggregateDividends } from '../lib/dividends';
import { aggregateHoldingValues, groupHoldingLayers, calculateHoldingWeights } from '../lib/data/holding_utils';
import { HoldingStats } from './holding-details/HoldingStats';
import { HoldingDistribution } from './holding-details/HoldingDistribution';
import { HoldingLayers } from './holding-details/HoldingLayers';
import { HoldingTransactions } from './holding-details/HoldingTransactions';
import { HoldingDividends } from './holding-details/HoldingDividends';
import { HoldingUnderlyingAssets } from './holding-details/HoldingUnderlyingAssets';
import type { HoldingValues } from './holding-details/types';

export type HoldingDetailsSection = 'holdings' | 'transactions' | 'dividends' | 'assets';

interface HoldingDetailsProps {
    sheetId: string;
    holding: Holding | EnrichedDashboardHolding;
    holdings?: any[];
    displayCurrency: string;
    portfolios: Portfolio[];
    onPortfolioClick: (id: string) => void;
    section?: HoldingDetailsSection;
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

const coerceDate = (d: any): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date;
};


export function HoldingDetails({ sheetId, holding, holdings, displayCurrency, portfolios, section = 'holdings' }: HoldingDetailsProps & { section?: string }) {
    const { t } = useLanguage();
    const navigate = useNavigate();

    // Check if enriched (has activeLots, etc) or use raw holding
    const isEnriched = (h: any): h is EnrichedDashboardHolding => 'activeLots' in h;
    const enriched = isEnriched(holding) ? holding : null;

    const matchingHoldings = useMemo(() => {
        if (!holdings || holdings.length === 0) return [holding];
        const rawMatches = holdings.filter(h => h.ticker === holding.ticker && (h.exchange === holding.exchange || !h.exchange));

        // Apply fresh price from the 'holding' prop (API data) if available
        const freshPrice = (holding as any).price;
        const freshChange = (holding as any).changePct1d;

        if (!freshPrice) return rawMatches;

        return rawMatches.map(h => {
            const stockCurrency = h.stockCurrency || 'USD';
            const qtyVested = h.qtyVested || 0;
            const qtyUnvested = h.qtyUnvested || 0;
            const totalQty = qtyVested + qtyUnvested;

            // Recalculate values based on fresh price
            const marketValue = freshPrice * totalQty;
            const costBasisTotal = (h.costBasisVested?.amount || 0) + (h.costBasisUnvested?.amount || 0);

            return {
                ...h,
                price: freshPrice,
                currentPrice: freshPrice,
                changePct1d: freshChange ?? h.changePct1d,
                marketValue,
                marketValueVested: { amount: freshPrice * qtyVested, currency: stockCurrency },
                marketValueUnvested: { amount: freshPrice * qtyUnvested, currency: stockCurrency },
                unrealizedGain: { amount: marketValue - costBasisTotal, currency: stockCurrency }
            };
        });
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
            return divs.map(d => ({ ...d, portfolioCurrency: h.portfolioCurrency, portfolioId: h.portfolioId }));
        });
    }, [matchingHoldings]);

    const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getExchangeRates(sheetId)
            .then(rates => { setExchangeRates(rates); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, [sheetId]);



    const vals = useMemo(() => {
        const zeroMoney = { amount: 0, currency: normalizeCurrency(displayCurrency) };
        const zeroMoneyILS = { amount: 0, currency: Currency.ILS };
        if (!displayCurrency || !exchangeRates) return {
            marketValue: zeroMoney, unrealizedGain: zeroMoney, realizedGain: zeroMoney, realizedGainGross: zeroMoney,
            realizedGainNet: zeroMoney, realizedGainAfterTax: zeroMoney, totalGain: zeroMoney, valueAfterTax: zeroMoney,
            dayChangeVal: zeroMoney, costBasis: zeroMoney, costOfSold: zeroMoney, proceeds: zeroMoney, dividends: zeroMoney,
            unvestedValue: zeroMoney, totalQty: 0,
            realizedTax: zeroMoney, unrealizedTax: zeroMoney,
            unrealizedGainPct: 0, realizedGainPct: 0, totalGainPct: 0, dayChangePct: 0,
            avgCost: zeroMoney, currentPrice: zeroMoney, weightInPortfolio: 0, weightInGlobal: 0,
            realCost: zeroMoney,
            adjustedCostILS: zeroMoneyILS, // Add missing fields if needed by HoldingValues
            originalCostILS: zeroMoneyILS,
            currentValueILS: zeroMoneyILS,
            realCostILS: zeroMoneyILS,
            unrealizedTaxableGainILS: zeroMoneyILS
        } as HoldingValues;

        return aggregateHoldingValues(matchingHoldings, exchangeRates, displayCurrency);
    }, [matchingHoldings, exchangeRates, displayCurrency]);

    // Transactions are already filtered for this holding in UnifiedHolding
    const txnHistory = useMemo(() => {
        return [...transactions].sort((a, b) => (coerceDate(b.date)?.getTime() || 0) - (coerceDate(a.date)?.getTime() || 0));
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
        }).sort((a, b) => (coerceDate(a.date)?.getTime() || 0) - (coerceDate(b.date)?.getTime() || 0));
    }, [matchingHoldings]);

    const realizedLayers = useMemo(() => {
        return matchingHoldings.flatMap(h => {
            const enrichedH = (h as any).display ? (h as EnrichedDashboardHolding) : null;
            let lots: Lot[] = [];
            if (enrichedH?.realizedLots) lots = enrichedH.realizedLots;
            else if ((h as any).realizedLots) lots = (h as any).realizedLots;
            else if ((h as any)._lots) {
                // Fallback for raw internal lots
                lots = ((h as any)._lots as Lot[]).filter(l => !!l.soldDate);
            }
            return lots.map(l => ({ ...l, portfolioId: h.portfolioId }));
        }).sort((a, b) => (coerceDate(b.soldDate)?.getTime() || 0) - (coerceDate(a.soldDate)?.getTime() || 0));
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

    // Pre-calculate Grant values for Stats
    const hasGrants = useMemo(() => layers.some(l => !!l.vestingDate || !!(l as any).vestDate), [layers]);

    // Calculate unvested values in display currency directly to avoid currency mismatch
    const { unvestedValDisplay, unvestedGainDisplay } = useMemo(() => {
        let uValDisplay = 0;
        let uGainDisplay = 0;
        if (hasGrants && exchangeRates && stockCurrency && displayCurrency) {
            const currentPrice = (holding as any).currentPrice || (holding as any).price || 0;
            layers.forEach(l => {
                const vDate = coerceDate(l.vestingDate || (l as any).vestDate);
                if (vDate && vDate > new Date()) {
                    const qty = l.qty || 0;

                    // Value in Display Currency
                    const layerValSC = qty * currentPrice;
                    const layerValDisplay = convertCurrency(layerValSC, stockCurrency, displayCurrency, exchangeRates);

                    // Cost in Display Currency
                    // l.costPerUnit is in portfolioCurrency
                    const portfolioCurrency = (holding as any).portfolioCurrency || 'USD';
                    const costPerUnitPC = l.costPerUnit?.amount ?? (l as any).price ?? 0;
                    const layerCostPC = qty * costPerUnitPC;
                    const layerCostDisplay = convertCurrency(layerCostPC, portfolioCurrency, displayCurrency, exchangeRates);

                    uValDisplay += layerValDisplay;
                    uGainDisplay += (layerValDisplay - layerCostDisplay);
                }
            });
        }
        return { unvestedValDisplay: uValDisplay, unvestedGainDisplay: uGainDisplay };
    }, [hasGrants, layers, holding, exchangeRates, stockCurrency, displayCurrency]);

    const unvestedGain = (exchangeRates && stockCurrency && displayCurrency)
        ? convertCurrency(unvestedGainDisplay, displayCurrency, stockCurrency, exchangeRates)
        : 0;
    const vestedValDisplay = vals.marketValue;

    const groupedLayersBase = useMemo(() => {
        if (!exchangeRates || !displayCurrency) return [];
        // Ensure holding has currentPrice for layer grouping logic
        const holdingWithPrice = { ...holding, currentPrice: (holding as any).price || (holding as any).currentPrice } as Holding | EnrichedDashboardHolding;
        return groupHoldingLayers(layers, realizedLayers, exchangeRates, displayCurrency, portfolioNameMap, holdingWithPrice, stockCurrency);
    }, [layers, realizedLayers, displayCurrency, exchangeRates, portfolioNameMap, holding, stockCurrency, dividendHistory]);

    // Calculate Weights across all portfolios (using groupedLayersBase for accurate values)
    const holdingsWeights = useMemo(() => {
        if (!portfolios || portfolios.length === 0 || !exchangeRates || !displayCurrency) return [];
        return calculateHoldingWeights(portfolios, holding, exchangeRates, displayCurrency, groupedLayersBase);
    }, [portfolios, holding, exchangeRates, displayCurrency, groupedLayersBase]);

    const groupedLayers = useMemo(() => {
        // Reuse grouping but with weights now available
        if (!exchangeRates || !displayCurrency) return [];
        return groupHoldingLayers(layers, realizedLayers, exchangeRates, displayCurrency, portfolioNameMap, holding, stockCurrency, holdingsWeights);
    }, [layers, realizedLayers, displayCurrency, exchangeRates, portfolioNameMap, holding, stockCurrency, holdingsWeights, dividendHistory]);

    const isFeeExempt = useMemo(() => {
        const h = holding as any;
        const type = enriched?.type?.type || h.type?.type || h.instrumentType;
        const nameHe = enriched?.nameHe || h.nameHe || '';
        return type === InstrumentType.MONETARY_FUND || nameHe.includes('קרן כספית') || nameHe.includes('כספית');
    }, [enriched, holding]);


    if (loading) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    const HoldingStatsComponent = HoldingStats as any;
    const HoldingTransactionsComponent = HoldingTransactions as any;

    return (
        <Box sx={{ mt: 2 }}>
            {/* SECTION: HOLDINGS */}
            {section === 'holdings' && (
                <Box>
                    {!vals || (layers.length === 0 && realizedLayers.length === 0) ? (
                        <Box sx={{ p: 2, textAlign: 'center' }}>
                            <Typography color="text.secondary">{t('Calculating holding details...', 'מחשב פרטי החזקה...')}</Typography>
                        </Box>
                    ) : (
                        <>
                            <Typography variant="h6" gutterBottom color="primary" sx={{ fontWeight: 'bold' }}>
                                {t('My Position', 'הפוזיציה שלי')}
                            </Typography>

                            {(enriched?.sector || (holding as any).sector) && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5, mb: 2 }}>
                                    {t('Sector:', 'מגזר:')} {enriched?.sector || (holding as any).sector}
                                </Typography>
                            )}

                            <HoldingStatsComponent
                                vals={vals as HoldingValues}
                                displayCurrency={displayCurrency}
                                holdingsWeights={holdingsWeights}
                                hasGrants={hasGrants}
                                vestedValDisplay={vestedValDisplay}
                                unvestedValDisplay={unvestedValDisplay}
                                unvestedGainDisplay={unvestedGainDisplay}
                                unvestedGain={unvestedGain}
                                totalQty={totalQty}
                                totalFeesDisplay={totalFeesDisplay}
                                isFeeExempt={isFeeExempt}
                                stockCurrency={stockCurrency}
                                exchangeRates={exchangeRates}
                            />

                            <HoldingDistribution
                                groupedLayers={groupedLayers}
                            />

                            <HoldingLayers
                                groupedLayers={groupedLayers}
                                displayCurrency={displayCurrency}
                                portfolios={portfolios}
                                exchangeRates={exchangeRates}
                                formatDate={formatDate}
                            />

                            <HoldingUnderlyingAssets assets={enriched?.underlyingAssets || (holding as any).underlyingAssets || (holding as any).meta?.underlyingAssets} />
                        </>
                    )}
                </Box>
            )}

            {/* SECTION: TRANSACTIONS */}
            {section === 'transactions' && (
                <HoldingTransactionsComponent
                    txnHistory={txnHistory}
                    portfolioNameMap={portfolioNameMap}
                    formatDate={formatDate}
                    onEditTransaction={handleEditTransaction}
                    isFeeExempt={isFeeExempt}
                />
            )}

            {/* SECTION: DIVIDENDS */}
            {section === 'dividends' && (
                <HoldingDividends
                    divHistory={divHistory}
                    loading={loading}
                    displayCurrency={displayCurrency}
                    formatDate={formatDate}
                />
            )}
        </Box>
    );
}
