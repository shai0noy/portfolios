import { Box, Typography, CircularProgress } from '@mui/material';
import { convertCurrency, getExchangeRates, normalizeCurrency, convertMoney, calculatePerformanceInDisplayCurrency } from '../lib/currency';
import { useLanguage } from '../lib/i18n';
import { Currency } from '../lib/types';
import type { Transaction, ExchangeRates, Portfolio } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import type { Lot, Holding, DividendRecord } from '../lib/data/model';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { aggregateDividends } from '../lib/dividends';
import { aggregateHoldingValues, groupHoldingLayers, calculateHoldingWeights } from '../lib/data/holding_utils';
import type { HoldingWeight } from '../lib/data/holding_utils';
import { HoldingStats } from './holding-details/HoldingStats';
import { HoldingDistribution } from './holding-details/HoldingDistribution';
import { HoldingLayers } from './holding-details/HoldingLayers';
import { HoldingTransactions } from './holding-details/HoldingTransactions';
import { HoldingDividends } from './holding-details/HoldingDividends';
import type { HoldingValues } from './holding-details/types';

export type HoldingSection = 'holdings' | 'transactions' | 'dividends';

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



    const vals = useMemo(() => {
        if (!displayCurrency || !exchangeRates) return {
            marketValue: 0, unrealizedGain: 0, realizedGain: 0, realizedGainGross: 0,
            realizedGainNet: 0, realizedGainAfterTax: 0, totalGain: 0, valueAfterTax: 0,
            dayChangeVal: 0, costBasis: 0, costOfSold: 0, proceeds: 0, dividends: 0,
            unvestedValue: 0, totalQty: 0, totalCost: 0, realizedNetBase: 0,
            realizedTaxBase: 0, unrealizedTaxBase: 0, realizedTax: 0, unrealizedTax: 0,
            unrealizedGainPct: 0, realizedGainPct: 0, totalGainPct: 0, dayChangePct: 0,
            avgCost: 0, currentPrice: 0, weightInPortfolio: 0, weightInGlobal: 0
        } as HoldingValues;

        return aggregateHoldingValues(matchingHoldings, exchangeRates, displayCurrency);
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

    // Pre-calculate Grant values for Stats
    const hasGrants = useMemo(() => layers.some(l => !!l.vestingDate || !!(l as any).vestDate), [layers]);

    // Calculate unvested values
    const { unvestedVal, unvestedGain } = useMemo(() => {
        let uVal = 0;
        let uGain = 0;
        if (hasGrants) {
            const currentPrice = (holding as any).currentPrice || 0;
            layers.forEach(l => {
                const vDate = l.vestingDate || (l as any).vestDate;
                if (vDate && new Date(vDate) > new Date()) {
                    const qty = l.qty || 0;
                    const layerVal = qty * currentPrice;
                    const costVal = l.costPerUnit?.amount ?? (l as any).price ?? 0;
                    const layerCost = qty * costVal;
                    uVal += layerVal;
                    uGain += (layerVal - layerCost);
                }
            });
        }
        return { unvestedVal: uVal, unvestedGain: uGain };
    }, [hasGrants, layers, holding]);

    const unvestedValDisplay = convertCurrency(unvestedVal, stockCurrency, displayCurrency, exchangeRates || undefined);
    const unvestedGainDisplay = convertCurrency(unvestedGain, stockCurrency, displayCurrency, exchangeRates || undefined);
    const vestedValDisplay = vals.marketValue;

    // Unified Layers Logic grouped by Portfolio (Base - No Weights)
    const groupedLayersBase = useMemo(() => {
        if (!exchangeRates || !displayCurrency) return [];
        return groupHoldingLayers(layers, realizedLayers, exchangeRates, displayCurrency, portfolioNameMap, holding, stockCurrency);
    }, [layers, realizedLayers, displayCurrency, exchangeRates, portfolioNameMap, holding, stockCurrency]);

    // Calculate Weights across all portfolios (using groupedLayersBase for accurate values)
    const holdingsWeights = useMemo(() => {
        if (!portfolios || portfolios.length === 0 || !exchangeRates || !displayCurrency) return [];
        return calculateHoldingWeights(portfolios, holding, exchangeRates, displayCurrency, groupedLayersBase);
    }, [portfolios, holding, exchangeRates, displayCurrency, groupedLayersBase]);

    // Final Grouped Layers with Weights
    const groupedLayers = useMemo(() => {
        // Reuse grouping but with weights now available
        if (!exchangeRates || !displayCurrency) return [];
        return groupHoldingLayers(layers, realizedLayers, exchangeRates, displayCurrency, portfolioNameMap, holding, stockCurrency, holdingsWeights);
    }, [layers, realizedLayers, displayCurrency, exchangeRates, portfolioNameMap, holding, stockCurrency, holdingsWeights]);


    if (loading) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ mt: 2 }}>
            {/* SECTION: HOLDINGS */}
            {section === 'holdings' && (
                <Box>
                    {!vals || !vals.marketValue && vals.costBasis === 0 ? (
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

                                <HoldingStats
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
                                />

                                <HoldingDistribution
                                    groupedLayers={groupedLayers}
                                    displayCurrency={displayCurrency}
                                />

                                <HoldingLayers
                                    groupedLayers={groupedLayers}
                                    displayCurrency={displayCurrency}
                                    portfolios={portfolios}
                                    exchangeRates={exchangeRates}
                                    formatDate={formatDate}
                                />
                        </>
                    )}
                </Box>
            )}

            {/* SECTION: TRANSACTIONS */}
            {section === 'transactions' && (
                <HoldingTransactions
                    txnHistory={txnHistory}
                    portfolioNameMap={portfolioNameMap}
                    formatDate={formatDate}
                    onEditTransaction={handleEditTransaction}
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
