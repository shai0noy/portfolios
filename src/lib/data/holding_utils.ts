
import { convertCurrency, convertMoney, calculatePerformanceInDisplayCurrency, normalizeCurrency } from '../currency';
import { Currency } from '../types';
import type { ExchangeRates, Portfolio } from '../types';
import type { Holding, DividendRecord } from './model';
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
        totalQty: 0,
        totalCost: 0,
        realizedNetBase: 0,
        realizedTaxBase: 0,
        unrealizedTaxBase: 0,
        realizedTax: 0,
        unrealizedTax: 0,
        unrealizedGainPct: 0,
        realizedGainPct: 0,
        totalGainPct: 0,
        dayChangePct: 0,
        avgCost: 0,
        currentPrice: 0,
        weightInPortfolio: 0,
        weightInGlobal: 0
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

            const getHistoricalMoney = (m: any): number => {
                if (!m) return 0;
                if (displayCurrency === Currency.ILS && m.valILS !== undefined) return m.valILS;
                if (displayCurrency === Currency.USD && m.valUSD !== undefined) return m.valUSD;
                return convertMoney(m, displayCurrency, exchangeRates).amount;
            };

            const mvVested = convertMoney(raw.marketValueVested, displayCurrency, exchangeRates).amount;
            acc.marketValue += mvVested;
            acc.unvestedValue += convertMoney(raw.marketValueUnvested, displayCurrency, exchangeRates).amount;

            // Use historical values for cost and proceeds
            const costBasisDisplay = getHistoricalMoney(raw.costBasisVested);
            acc.costBasis += costBasisDisplay;

            const costOfSoldDisplay = getHistoricalMoney(raw.costOfSoldTotal);
            acc.costOfSold += costOfSoldDisplay;

            const proceedsDisplay = getHistoricalMoney(raw.proceedsTotal);
            acc.proceeds += proceedsDisplay;

            const rGainNetDisplay = raw.realizedGainNet ? convertCurrency(raw.realizedGainNet.amount, raw.realizedGainNet.currency, displayCurrency, exchangeRates) : 0;
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
            }

            // Gross Sells (Using Historical)
            const sellsGross = proceedsDisplay - costOfSoldDisplay;

            acc.realizedGain += sellsGross + divsGross;
            acc.realizedGainGross += sellsGross + divsGross;

            const cgtDisplay = convertCurrency(raw.realizedCapitalGainsTax || 0, raw.portfolioCurrency || 'USD', displayCurrency, exchangeRates);
            acc.realizedGainNet += (rGainNetDisplay - cgtDisplay) + divNet;

            // Day Change
            const dcPct = raw.dayChangePct || 0;
            if (dcPct !== 0) {
                const { changeVal } = calculatePerformanceInDisplayCurrency(raw.currentPrice, raw.stockCurrency, dcPct, displayCurrency, exchangeRates);
                acc.dayChangeVal += changeVal * (raw.qtyVested || 0);
            }

            // Unrealized Gain (Nominal using Display Currency)
            const unrealizedGain = mvVested - costBasisDisplay;
            acc.unrealizedGain += unrealizedGain;

            acc.totalQty += raw.qtyVested || 0;
        }
        return acc;
    }, { ...defaultVals });

    // Derived Totals (in Display Currency)
    agg.realizedGainAfterTax = agg.realizedGainNet;
    agg.totalGain = agg.unrealizedGain + agg.realizedGain;
    agg.valueAfterTax = agg.marketValue - agg.unrealizedTaxBase;

    // Derived Pcts
    agg.unrealizedGainPct = agg.costBasis > 0 ? agg.unrealizedGain / agg.costBasis : 0;
    const realizedSellsGross = agg.proceeds - agg.costOfSold;
    agg.realizedGainPct = agg.costOfSold > 0 ? realizedSellsGross / agg.costOfSold : 0;
    agg.totalGainPct = (agg.costBasis + agg.costOfSold) > 0 ? agg.totalGain / (agg.costBasis + agg.costOfSold) : 0;
    agg.dayChangePct = agg.marketValue > 0 ? agg.dayChangeVal / (agg.marketValue - agg.dayChangeVal) : 0;

    // Avg Cost (Based on Vested Qty, as Unvested has 0 cost)
    const totalVestedQty = matchingHoldings.reduce((s, h) => s + ((h as Holding).qtyVested || 0), 0);
    agg.avgCost = totalVestedQty > 0 ? agg.costBasis / totalVestedQty : 0;

    let currentPrice = 0;
    const totalStockCurrency = (matchingHoldings[0] as any).stockCurrency || 'USD';
    const enrichedHolding = matchingHoldings.find(h => (h as EnrichedDashboardHolding).display) as EnrichedDashboardHolding;
    if (enrichedHolding?.display?.currentPrice) {
        currentPrice = enrichedHolding.display.currentPrice;
    } else if (matchingHoldings[0]) {
        currentPrice = (matchingHoldings[0] as Holding).currentPrice || 0;
    }
    agg.currentPrice = convertCurrency(currentPrice, totalStockCurrency, displayCurrency, exchangeRates);

    return {
        marketValue: agg.marketValue,
        unrealizedGain: agg.unrealizedGain,
        unrealizedGainPct: agg.unrealizedGainPct,
        realizedGain: agg.realizedGain,
        realizedGainGross: agg.realizedGain,
        realizedGainNet: agg.realizedGainNet,
        realizedGainPct: agg.realizedGainPct,
        realizedGainAfterTax: agg.realizedGainAfterTax,
        totalGain: agg.totalGain,
        totalGainPct: agg.totalGainPct,
        valueAfterTax: agg.valueAfterTax,
        dayChangeVal: agg.dayChangeVal,
        dayChangePct: agg.dayChangePct,
        costBasis: agg.costBasis,
        costOfSold: agg.costOfSold,
        proceeds: agg.proceeds,
        dividends: agg.dividends,
        currentPrice: agg.currentPrice,
        avgCost: agg.avgCost,
        weightInPortfolio: 0,
        weightInGlobal: 0,
        unvestedValue: agg.unvestedValue,
        realizedTax: agg.realizedTaxBase,
        unrealizedTax: agg.unrealizedTaxBase,
        totalQty: agg.totalQty
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
        };
        layers: Record<string, UnifiedLayer>;
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
                transferredQty: 0,
                originalCost: 0,
                remainingCost: 0,
                fees: 0,
                currentValue: 0,
                realizedGain: 0,
                taxLiability: 0,
                realizedTax: 0,
                unrealizedTax: 0,
                adjustedCost: 0,
                adjustedCostILS: 0,
                originalCostILS: 0, // Base Cost in ILS
                currentValueILS: 0,
                realCostILS: 0,
                unrealizedTaxableGainILS: 0,
                adjustmentDetails: undefined
            };
        }

        const g = pGroup.layers[layerKey];
        g.originalQty += lot.qty;

        // Accumulate other fields...
        g.originalCost += getHistoricalMoney(lot.costTotal);
        g.fees += lot.feesBuy.amount;

        if (lot.adjustedCostILS) g.adjustedCostILS += lot.adjustedCostILS;
        if (lot.realCostILS) g.realCostILS += lot.realCostILS;
        if (lot.unrealizedTaxableGainILS) g.unrealizedTaxableGainILS += lot.unrealizedTaxableGainILS;

        if (lot.costTotal.valILS) {
            g.originalCostILS += lot.costTotal.valILS;
        } else {
            g.originalCostILS += convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, exchangeRates || undefined);
        }

        if (lot.adjustmentDetails) g.adjustmentDetails = lot.adjustmentDetails;

        if (lot.soldDate) {

            g.soldQty += lot.qty;

            g.realizedGain += convertMoney(lot.realizedGainNet ? { amount: lot.realizedGainNet, currency: lot.costTotal.currency } : undefined, displayCurrency, exchangeRates || undefined).amount;
            const rTax = convertCurrency(lot.totalRealizedTaxPC || 0, lot.costTotal?.currency || Currency.USD, displayCurrency, exchangeRates || undefined);
            g.taxLiability += rTax;
            g.realizedTax += rTax;
            g.fees += convertCurrency(lot.soldFees?.amount || 0, lot.soldFees?.currency || Currency.ILS, displayCurrency, exchangeRates || undefined);
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
            g.remainingCost += addedCost;

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
        const sortedLayers = Object.values(group.layers).sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

        // Ensure we have portfolio name
        const pName = portfolioNameMap[pid] || pid;
        const pWeightData = holdingsWeights.find(w => w.portfolioId === pid);

        const totalOriginalQty = sortedLayers.reduce((sum: number, l: any) => sum + l.originalQty, 0);
        const currentQty = sortedLayers.reduce((sum: number, l: any) => sum + l.remainingQty, 0);
        const totalValue = sortedLayers.reduce((sum: number, l: any) => sum + l.currentValue, 0); // Value of remaining
        const totalRemainingCost = sortedLayers.reduce((sum: number, l: any) => sum + l.remainingCost, 0);

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
        acc[g.portfolioId] = g.stats.value; // Value in Display Currency
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
