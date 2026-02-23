
import { convertCurrency, convertMoney, normalizeCurrency } from '../currency';
import { Currency } from '../types';
import type { ExchangeRates, Portfolio, SimpleMoney } from '../types';
import type { Holding } from './model';
import type { EnrichedDashboardHolding } from '../dashboard';
import type { HoldingValues, PortfolioGroup, UnifiedLayer } from '../../components/holding-details/types';

export interface HoldingWeight {
    portfolioId: string;
    portfolioName: string;
    weightInPortfolio: number;
    weightInGlobal: number;
    value: number;
}

/**
 * Aggregates holding values across multiple portfolios/lots.
 * Calculates totals, gains, and performance metrics.
 * 
 * @param matchingHoldings - List of holdings (raw or enriched) for the same ticker.
 * @param exchangeRates - Current exchange rates.
 * @param displayCurrency - The currency to display values in.
 * @returns Aggregated HoldingValues object.
 */
export function aggregateHoldingValues(
    matchingHoldings: (Holding | EnrichedDashboardHolding)[],
    exchangeRates: ExchangeRates | null,
    displayCurrency: string
): HoldingValues {
    const currency = normalizeCurrency(displayCurrency);
    const defaultVals = {
        marketValue: { amount: 0, currency },
        unrealizedGain: { amount: 0, currency },
        realizedGain: { amount: 0, currency },
        realizedGainGross: { amount: 0, currency },
        realizedGainNet: { amount: 0, currency },
        realizedGainAfterTax: { amount: 0, currency },
        totalGain: { amount: 0, currency },
        valueAfterTax: { amount: 0, currency },
        dayChangeVal: { amount: 0, currency },
        costBasis: { amount: 0, currency },
        costOfSold: { amount: 0, currency },
        proceeds: { amount: 0, currency },
        dividends: { amount: 0, currency },
        unvestedValue: { amount: 0, currency },
        totalQty: 0,
        realizedTax: { amount: 0, currency },
        unrealizedTax: { amount: 0, currency },
        unrealizedGainPct: 0,
        realizedGainPct: 0,
        totalGainPct: 0,
        dayChangePct: 0,
        avgCost: { amount: 0, currency },
        currentPrice: { amount: 0, currency },
        weightInPortfolio: 0,
        weightInGlobal: 0,
        realCost: { amount: 0, currency }
    };

    if (!matchingHoldings || matchingHoldings.length === 0 || !exchangeRates) return defaultVals;

    const aggValues = matchingHoldings.reduce((acc, h) => {
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
            acc.realizedGainAfterTax += d.realizedGainAfterTax || 0;
            acc.valueAfterTax += d.valueAfterTax || 0;
            acc.totalGain += d.totalGain || 0;

            // Day Change
            acc.dayChangeVal += d.dayChangeVal;
        } else {
            // Raw Holding
            const raw = h as Holding;

            const getHistoricalMoney = (m: any): number => {
                if (!m) return 0;
                if (displayCurrency === Currency.ILS && m.valILS !== undefined) return m.valILS;
                if (displayCurrency === Currency.USD && m.valUSD !== undefined) return m.valUSD;
                return convertMoney(m, displayCurrency, exchangeRates).amount;
            };

            const mvVested = convertMoney(raw.marketValueVested, displayCurrency, exchangeRates).amount;
            acc.marketValue += mvVested;
            acc.unvestedValue += convertMoney(raw.marketValueUnvested, displayCurrency, exchangeRates).amount;

            acc.costBasis += getHistoricalMoney(raw.costBasisVested);
            acc.costOfSold += getHistoricalMoney(raw.costOfSoldTotal);
            acc.proceeds += getHistoricalMoney(raw.proceedsTotal);

            const ug = convertMoney(raw.unrealizedGain, displayCurrency, exchangeRates).amount;
            acc.unrealizedGain += ug;

            const proceedsDisplay = getHistoricalMoney(raw.proceedsTotal);
            const costOfSoldDisplay = getHistoricalMoney(raw.costOfSoldTotal);
            const sellsGross = proceedsDisplay - costOfSoldDisplay;

            acc.realizedGain += sellsGross;
            acc.realizedGainGross += sellsGross;
            acc.realizedGainNet += convertMoney(raw.realizedGainNet, displayCurrency, exchangeRates).amount;

            // Dividends
            if (raw.dividends) {
                const totalDivs = raw.dividends.reduce((sum, d) => sum + convertCurrency(d.netAmountPC, raw.portfolioCurrency, displayCurrency, exchangeRates), 0);
                acc.dividends += totalDivs;
            }

            const rawHolding = raw as Holding;
            const taxPC = rawHolding.totalTaxPaidPC ?? 0;
            const taxDisplay = convertCurrency(taxPC, rawHolding.portfolioCurrency || 'USD', displayCurrency, exchangeRates);
            acc.realizedTaxBase += taxDisplay;

            // Real Cost Aggregation (Iterate lots if available to sum realCostILS)
            // Use activeLots public accessor
            if (rawHolding.activeLots) {
                rawHolding.activeLots.forEach((l) => {
                    // activeLots already filters for qty > 0 and !soldDate
                    const rcILS = l.realCostILS || 0;
                    // Convert ILS to Display Currency
                    acc.realCost += rcILS ? convertCurrency(rcILS, Currency.ILS, displayCurrency, exchangeRates) : 0;
                });
            }
        }

        return acc;
    }, {
        marketValue: 0,
        unvestedValue: 0,
        costBasis: 0,
        costOfSold: 0,
        proceeds: 0,
        unrealizedGain: 0,
        realizedGain: 0,
        realizedGainGross: 0,
        realizedGainNet: 0,
        dividends: 0,
        realizedTaxBase: 0,
        unrealizedTaxBase: 0,
        realizedGainAfterTax: 0,
        valueAfterTax: 0,
        totalGain: 0,
        dayChangeVal: 0,
        realCost: 0
    });

    // Derived Totals (in Display Currency)
    const realizedGainAfterTax = aggValues.realizedGainNet; // Simplified fallback logic
    const totalGain = aggValues.unrealizedGain + aggValues.realizedGain;
    const valueAfterTax = aggValues.marketValue - aggValues.unrealizedTaxBase;

    // Derived Pcts
    // For Raw Holdings, we need to calculate them, for Enriched we might want to aggregate but summing percentages is wrong.
    // Re-calculating from totals is generally safer.
    const unrealizedGainPct = aggValues.costBasis > 0 ? aggValues.unrealizedGain / aggValues.costBasis : 0;
    const realizedSellsGross = aggValues.proceeds - aggValues.costOfSold;
    const realizedGainPct = aggValues.costOfSold > 0 ? realizedSellsGross / aggValues.costOfSold : 0;
    const totalGainPct = (aggValues.costBasis + aggValues.costOfSold) > 0 ? totalGain / (aggValues.costBasis + aggValues.costOfSold) : 0;
    const dayChangePct = (aggValues.marketValue - aggValues.dayChangeVal) > 0 ? aggValues.dayChangeVal / (aggValues.marketValue - aggValues.dayChangeVal) : 0;

    // Avg Cost (Based on Vested Qty, as Unvested has 0 cost)
    const totalVestedQty = matchingHoldings.reduce((s, h) => s + ((h as Holding).qtyVested || 0), 0);
    const avgCost = totalVestedQty > 0 ? aggValues.costBasis / totalVestedQty : 0;

    // Total Qty
    const totalQty = matchingHoldings.reduce((s, h) => s + ((h as Holding).qtyVested || 0) + ((h as Holding).qtyUnvested || 0), 0);

    let currentPrice = 0;
    const totalStockCurrency = (matchingHoldings[0] as Holding).stockCurrency || 'USD';
    const enrichedHolding = matchingHoldings.find(h => (h as EnrichedDashboardHolding).display) as EnrichedDashboardHolding;
    if (enrichedHolding?.display?.currentPrice) {
        currentPrice = enrichedHolding.display.currentPrice;
    } else if (matchingHoldings[0]) {
        currentPrice = (matchingHoldings[0] as Holding).currentPrice || 0;
    }
    const currentPriceDisplay = convertCurrency(currentPrice, totalStockCurrency, displayCurrency, exchangeRates);

    const toMoney = (amount: number): SimpleMoney => ({ amount, currency: displayCurrency as Currency });

    return {
        marketValue: toMoney(aggValues.marketValue),
        unrealizedGain: toMoney(aggValues.unrealizedGain),
        unrealizedGainPct: unrealizedGainPct,
        realizedGain: toMoney(aggValues.realizedGain),
        realizedGainGross: toMoney(aggValues.realizedGainGross),
        realizedGainNet: toMoney(aggValues.realizedGainNet),
        realizedGainPct: realizedGainPct,
        realizedGainAfterTax: toMoney(realizedGainAfterTax),
        totalGain: toMoney(totalGain),
        totalGainPct: totalGainPct,
        valueAfterTax: toMoney(valueAfterTax),
        dayChangeVal: toMoney(aggValues.dayChangeVal),
        dayChangePct: dayChangePct,
        costBasis: toMoney(aggValues.costBasis),
        costOfSold: toMoney(aggValues.costOfSold),
        proceeds: toMoney(aggValues.proceeds),
        dividends: toMoney(aggValues.dividends),
        currentPrice: toMoney(currentPriceDisplay),
        avgCost: toMoney(avgCost),
        weightInPortfolio: 0,
        weightInGlobal: 0,
        unvestedValue: toMoney(aggValues.unvestedValue),
        realizedTax: toMoney(aggValues.realizedTaxBase),
        unrealizedTax: toMoney(aggValues.unrealizedTaxBase),
        totalQty: totalQty,
        realCost: toMoney(aggValues.realCost || aggValues.costBasis) // Fallback to costBasis if not calculated
    };
}

/**
 * Groups holding layers (lots) by portfolio and unifies them.
 * 
 * @param layers - Active lots.
 * @param realizedLayers - Realized lots.
 * @param exchangeRates - Current exchange rates.
 * @param displayCurrency - Target currency.
 * @param portfolioNameMap - Map of ID to Portfolio Name.
 * @param holding - The holding context.
 * @param stockCurrency - Currency of the stock.
 * @param holdingsWeights - Optional pre-calculated weights to inject.
 * @returns Array of PortfolioGroup with stats and unified layers.
 */
export function groupHoldingLayers(
    layers: any[],
    realizedLayers: any[],
    exchangeRates: ExchangeRates | null,
    displayCurrency: string,
    portfolioNameMap: Record<string, string>,
    holding: Holding | EnrichedDashboardHolding,
    stockCurrency: string,
    holdingsWeights: HoldingWeight[] = []
): PortfolioGroup[] {
    if (!exchangeRates) return [];

    const getHistoricalMoney = (m: any): number => {
        if (!m) return 0;
        if (displayCurrency === 'ILS' && m.valILS !== undefined) return m.valILS;
        if (displayCurrency === 'USD' && m.valUSD !== undefined) return m.valUSD;
        return convertMoney(m, displayCurrency, exchangeRates).amount;
    };

    const allLots = [...layers, ...realizedLayers];
    // Key: portfolioId -> Key: originalTxnId -> UnifiedLayer
    const portfolioGroups: Record<string, {
        stats: {
            qty: number;
            value: number;
            cost: number;
            realCost: number;
        };
        layers: Record<string, UnifiedLayer>;
    }> = {};

    allLots.forEach(lot => {
        const pid = lot.portfolioId || 'unknown';
        if (!portfolioGroups[pid]) {
            portfolioGroups[pid] = {
                stats: { qty: 0, value: 0, cost: 0, realCost: 0 },
                layers: {}
            };
        }

        const pGroup = portfolioGroups[pid];
        const layerKey = lot.originalTxnId || getFallbackLayerKey(lot);

        if (!pGroup.layers[layerKey]) {
            const originalPriceSC = (lot.costPerUnit?.amount || 0) / (lot.costPerUnit?.rateToPortfolio || 1);
            pGroup.layers[layerKey] = {
                originalTxnId: layerKey,
                date: new Date(lot.date),
                vestingDate: lot.vestingDate ? new Date(lot.vestingDate) : undefined,
                price: { amount: originalPriceSC, currency: normalizeCurrency(stockCurrency) },
                originalQty: 0,
                remainingQty: 0,
                soldQty: 0,
                transferredQty: 0,
                originalCost: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                remainingCost: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                fees: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                currentValue: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                realizedGain: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                taxLiability: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                realizedTax: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                unrealizedTax: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                adjustedCost: { amount: 0, currency: normalizeCurrency(displayCurrency) },
                adjustedCostILS: { amount: 0, currency: Currency.ILS },
                originalCostILS: { amount: 0, currency: Currency.ILS }, // Base Cost in ILS
                currentValueILS: { amount: 0, currency: Currency.ILS },
                realCostILS: { amount: 0, currency: Currency.ILS },
                unrealizedTaxableGainILS: { amount: 0, currency: Currency.ILS },
                adjustmentDetails: undefined
            };
        }

        const g = pGroup.layers[layerKey];
        g.originalQty += lot.qty;

        // Accumulate other fields...
        g.originalCost.amount += getHistoricalMoney(lot.costTotal);
        // Fees Buying
        g.fees.amount += getHistoricalMoney(lot.feesBuy);

        if (lot.adjustedCostILS) g.adjustedCostILS.amount += lot.adjustedCostILS;
        if (lot.realCostILS) g.realCostILS.amount += lot.realCostILS;
        if (lot.unrealizedTaxableGainILS) g.unrealizedTaxableGainILS.amount += lot.unrealizedTaxableGainILS;

        if (lot.costTotal.valILS) {
            g.originalCostILS.amount += lot.costTotal.valILS;
        } else {
            g.originalCostILS.amount += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, exchangeRates || undefined);
        }

        if (lot.adjustmentDetails) g.adjustmentDetails = lot.adjustmentDetails;

        if (lot.soldDate) {

            g.soldQty += lot.qty;

            g.realizedGain.amount += convertMoney(lot.realizedGainNet ? { amount: lot.realizedGainNet, currency: lot.costTotal.currency } : undefined, displayCurrency, exchangeRates || undefined).amount;

            // Tax Paid:
            const taxSourceCurrency = lot.costTotal?.currency || Currency.ILS;
            const rTax = convertCurrency(lot.totalRealizedTaxPC || lot.realizedTax || 0, taxSourceCurrency, displayCurrency, exchangeRates || undefined);
            g.taxLiability.amount += rTax;
            g.realizedTax.amount += rTax;

            // Sold Fees
            g.fees.amount += getHistoricalMoney(lot.soldFees);
        } else {
            g.remainingQty += lot.qty;

            // Fix: Use historical cost if available for Book Cost
            let addedCost = 0;
            if (displayCurrency === Currency.ILS && lot.costTotal.valILS) {
                addedCost = lot.costTotal.valILS;
            } else if (displayCurrency === Currency.USD && lot.costTotal.valUSD) {
                addedCost = lot.costTotal.valUSD;
            } else {
                addedCost = convertCurrency(lot.costTotal.amount, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
            }
            g.remainingCost.amount += addedCost;

            const currentPrice = (holding as any).currentPrice || 0;
            const valSC = lot.qty * currentPrice;
            const valDisplay = convertCurrency(valSC, stockCurrency, displayCurrency, exchangeRates || undefined);
            g.currentValue.amount += valDisplay;
            g.currentValueILS.amount += convertCurrency(valSC, stockCurrency, Currency.ILS, exchangeRates || undefined);

            const uTax = convertCurrency(lot.unrealizedTax || 0, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
            g.taxLiability.amount += uTax;
            g.unrealizedTax.amount += uTax;

            if (lot.adjustedCost) {
                g.adjustedCost.amount += convertCurrency(lot.adjustedCost, lot.costTotal.currency, displayCurrency, exchangeRates || undefined);
            }
        }
    });

    // Finalize stats and sort
    return Object.entries(portfolioGroups).map(([pid, group]) => {
        const sortedLayers = Object.values(group.layers).sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

        // Ensure we have portfolio name
        const pName = portfolioNameMap[pid] || pid;
        const pWeightData = holdingsWeights.find(w => w.portfolioId === pid);

        const totalOriginalQty = sortedLayers.reduce((sum: number, l: any) => sum + l.originalQty, 0);
        const currentQty = sortedLayers.reduce((sum: number, l: any) => sum + l.remainingQty, 0);
        const totalValue = sortedLayers.reduce((sum: number, l: any) => sum + l.currentValue, 0); // Value of remaining
        const totalRemainingCost = sortedLayers.reduce((sum: number, l: any) => sum + l.remainingCost, 0);
        const totalRealCost = sortedLayers.reduce((sum: number, l: any) => sum + (l.realCostILS || l.remainingCost), 0);

        return {
            portfolioId: pid,
            portfolioName: pName,
            stats: {
                originalQty: totalOriginalQty,
                currentQty: currentQty,
                value: { amount: totalValue, currency: displayCurrency as Currency },
                cost: { amount: totalRemainingCost, currency: displayCurrency as Currency },
                realCost: { amount: totalRealCost, currency: displayCurrency as Currency },
                weight: pWeightData?.weightInPortfolio || 0
            },
            layers: sortedLayers
        };
    });
}

/**
 * Calculates portfolio weights for a specific holding, patching missing values with accurate Engine data.
 * 
 * @param portfolios - List of portfolios.
 * @param holding - The holding to calculate weights for.
 * @param exchangeRates - Current exchange rates.
 * @param displayCurrency - Target currency.
 * @param groupedLayersBase - Pre-calculated layers (containing accurate values).
 * @returns Array of HoldingWeight.
 */
export function calculateHoldingWeights(
    portfolios: Portfolio[],
    holding: Holding | EnrichedDashboardHolding,
    exchangeRates: ExchangeRates | null,
    displayCurrency: string,
    groupedLayersBase: PortfolioGroup[]
): HoldingWeight[] {
    if (!portfolios || portfolios.length === 0 || !exchangeRates) return [];

    const targetCurrency = normalizeCurrency(displayCurrency || 'USD');

    // 1. Calculate Raw Portfolio Totals (from Props)
    const portfolioTotalsRaw: Record<string, number> = {};
    portfolios.forEach(p => {
        const pValue = p.holdings?.reduce((sum, h) => sum + convertCurrency(h.totalValue || 0, h.currency || 'USD', targetCurrency, exchangeRates), 0) || 0;
        portfolioTotalsRaw[p.id] = pValue;
    });

    // 2. Iterate Portfolios and Patch with Real Value (from groupedLayersBase) if available
    const results: HoldingWeight[] = [];
    let totalAum = 0;

    // Helper map for Grouped Layer Values
    const realValuesMap = groupedLayersBase.reduce((acc, g) => {
        acc[g.portfolioId] = g.stats.value.amount; // Value in Display Currency
        return acc;
    }, {} as Record<string, number>);

    portfolios.forEach(p => {
        const hRaw = p.holdings?.find(h => h.ticker === holding.ticker && (h.exchange === (holding as any).exchange || !h.exchange));
        const hRawValue = hRaw ? convertCurrency(hRaw.totalValue || 0, hRaw.currency || 'USD', targetCurrency, exchangeRates) : 0;
        const hRealValue = realValuesMap[p.id] || 0;

        // Adjusted Portfolio Total = RawTotal - RawHolding + RealHolding
        const pTotalAdjusted = (portfolioTotalsRaw[p.id] || 0) - hRawValue + hRealValue;

        // If this holding exists in this portfolio (either in Raw or Real)
        if (hRaw || hRealValue > 0) {
            results.push({
                portfolioId: p.id,
                portfolioName: p.name,
                weightInPortfolio: pTotalAdjusted > 0 ? hRealValue / pTotalAdjusted : 0,
                weightInGlobal: 0, // Will calc after summing AUM
                value: hRealValue
            });
            totalAum += pTotalAdjusted;
        }
    });

    // 3. Update Global Weights
    return results.map(r => ({
        ...r,
        weightInGlobal: totalAum > 0 ? r.value / totalAum : 0
    }));
}

function getFallbackLayerKey(lot: any): string {
    const time = lot.date instanceof Date ? lot.date.getTime() : new Date(lot.date).getTime();
    const cost = lot.costPerUnit?.amount ?? 'NA';
    return `unknown_${time}_${cost}`;
}
