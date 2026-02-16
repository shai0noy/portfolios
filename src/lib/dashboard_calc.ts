
import { Currency } from './types';
import type { DashboardHolding, DashboardHoldingDisplay, DashboardSummaryData, Portfolio, ExchangeRates } from './types';
import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currencyUtils';
import { INITIAL_SUMMARY, FinanceEngine } from './data/engine';
import type { Lot, DividendRecord } from './data/model';
import type { Transaction } from './types';



export interface EnrichedDashboardHolding extends DashboardHolding {
  display: DashboardHoldingDisplay;
  activeLots: Lot[];
  realizedLots: Lot[];
  transactions: Transaction[];
  dividends: DividendRecord[];

  // Meta
  taxPolicy?: string;
  taxOnBase?: boolean;
}

export function calculateDashboardSummary(data: any[], displayCurrency: string, exchangeRates: ExchangeRates, portfoliosMap: Map<string, Portfolio>, engine?: FinanceEngine | null): { summary: DashboardSummaryData, holdings: EnrichedDashboardHolding[] } {
  if (!engine) return { summary: INITIAL_SUMMARY, holdings: [] };

  // Get summary filtered by the keys present in data
  const dataKeys = new Set(data.map(d => d.key || (d as any).id));
  const summary = engine.getGlobalSummary(displayCurrency, dataKeys);

  // Use Holding class instead of UnifiedHolding interface
  const unifiedHoldings = Array.from(engine.holdings.values());
  const filteredUnified = unifiedHoldings.filter(h => dataKeys.has(h.id));

  const enrichedHoldings: EnrichedDashboardHolding[] = filteredUnified.map(h => {
    // Helper to get historical value in display currency
    const getHistoricalVal = (money: { amount: number, currency: Currency, valILS?: number, valUSD?: number }): number => {
      if (displayCurrency === Currency.ILS && money.valILS !== undefined) return money.valILS;
      if (displayCurrency === Currency.USD && money.valUSD !== undefined) return money.valUSD;
      // Fallback: This is technically "wrong" for historical consistency if we lack val data, 
      // but consistent with "we don't have history". 
      // Ideally we'd error or warn, but for now conversion at current rate is the fallback 
      // (or we can try to look up rate if we had date, but we don't here easily).
      return convertCurrency(money.amount, money.currency, displayCurrency, exchangeRates);
    };

    // Vested Calculations
    const mvVested = h.marketValueVested; // SimpleMoney (SC)
    // Market Value is always Current Rate
    const marketValue = convertCurrency(mvVested.amount, mvVested.currency, displayCurrency, exchangeRates);

    // Cost Basis Vested (Historical)
    // Sum from vested lots
    const costBasisDisplay = h.vestedLots.reduce((sum, lot) => sum + getHistoricalVal(lot.costTotal), 0);

    // Unrealized Gain (Nominal) = MarketValue - HistoricalCost
    const unrealizedGain = marketValue - costBasisDisplay;

    // dividendsTotal (Net)
    // We should ideally sum historical dividends too?
    // h.dividends is DividendRecord[].
    const dividendsNet = h.dividends.reduce((sum, d) => {
    // DividendRecord has netAmountPC (number) in portfolio currency.
    // We want to convert this to display currency closely matching historical rates.
    // We have d.grossAmount (Money) which HAS historical values (valILS, valUSD).
    // We can use the implied rate from grossAmount to convert netAmountPC.

      let netValDisplay = 0;
      const grossValDisplay = getHistoricalVal(d.grossAmount);

      if (d.grossAmount.amount !== 0) {
        const ratio = d.netAmountPC / d.grossAmount.amount;
        netValDisplay = grossValDisplay * ratio;
      } else {
        // Fallback
        netValDisplay = convertCurrency(d.netAmountPC, h.portfolioCurrency, displayCurrency, exchangeRates);
      }

      return sum + netValDisplay;
    }, 0);

    const rawDivs = ((h as any)._dividends || []) as DividendRecord[];
    let dividendsGross = 0;

    // Sum Gross Dividends
    if (rawDivs.length > 0) {
      dividendsGross = rawDivs.reduce((sum, d) => sum + getHistoricalVal(d.grossAmount), 0);
    } else {
      // Fallback
      const divTaxToDeduct = (h as any)._dividends
        ? (h as any)._dividends.reduce((acc: number, d: any) => acc + (d.taxAmountPC || 0), 0)
        : 0;
      const divTaxDisplay = convertCurrency(divTaxToDeduct, h.portfolioCurrency, displayCurrency, exchangeRates);
      dividendsGross = dividendsNet + divTaxDisplay;
    }

    // Cost Of Sold (Historical)
    const costOfSoldDisplay = h.realizedLots.reduce((sum, lot) => sum + getHistoricalVal(lot.costTotal), 0);

    // Proceeds (Historical)
    // Iterate SELL transactions
    // We use `h.transactions` which are filtered by ticker/exchange.
    const proceedsDisplay = h.transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, t) => {
        // Replicate `performance.ts` logic: prefer originalPriceILA/USD
        let val = 0;
        if (displayCurrency === Currency.ILS && (t.originalPriceILA || t.currency === Currency.ILS)) {
          if (t.originalPriceILA) {
            val = (t.originalPriceILA / 100) * (t.qty || 0); // originalPriceILA is unit price in Agorot? 
            // performance.ts: `const priceILS = t.originalPriceILA / 100; return tQty * priceILS;`
            // Yes.
          } else {
            // ILS native
            val = (t.price || 0) * (t.qty || 0);
          }
        } else if (displayCurrency === Currency.USD && (t.originalPriceUSD || t.currency === Currency.USD)) {
          if (t.originalPriceUSD) {
            val = t.originalPriceUSD * (t.qty || 0);
          } else {
            val = (t.price || 0) * (t.qty || 0);
          }
        } else {
          // Fallback: Convert at current rate (Suboptimal but necessary if no history)
          // Or ideally we use `grossValue` converted?
          const gross = (t.price || 0) * (t.qty || 0);
          val = convertCurrency(gross, t.currency || h.stockCurrency, displayCurrency, exchangeRates);
        }
        return sum + val;
      }, 0);

    // Realized Gain from Sells (Gross)
    const realizedSellsGross = proceedsDisplay - costOfSoldDisplay;

    // Realized Gain (Gross) for UI
    const realizedGainGross = realizedSellsGross + dividendsGross;

    // Net Realized...
    // We need Fee and Tax in Display Currency.
    const feesDisplay = convertCurrency(h.feesTotal.amount, h.feesTotal.currency, displayCurrency, exchangeRates);
    // Realized Tax (sum from lots?)
    const realizedTaxDisplay = h.realizedLots.reduce((sum, lot) => {
      // lot.realizedTaxPC is in PC.
      // We probably want to convert at current rate? Tax is paid in cash.
      // Or did we track tax historically?
      // Lot doesn't store valILS for tax.
      return sum + convertCurrency((lot.realizedTaxPC || 0) + (lot.realizedIncomeTaxPC || 0), h.portfolioCurrency, displayCurrency, exchangeRates);
    }, 0);

    const realizedSellsNet = realizedSellsGross - feesDisplay - realizedTaxDisplay;
    const realizedGainNet = realizedSellsNet + dividendsNet;

    // Total Gain
    const totalGain = unrealizedGain + realizedGainGross; 

    const unrealizedTaxDisplay = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);

    // Value After Tax
    const valueAfterTax = marketValue - unrealizedTaxDisplay;

    // Realized Gain After Tax (Legacy field, might be redundant with realizedGainNet, but keeping for compatibility)
    const realizedGainAfterTax = realizedGainNet;

    // Also explicitly map realizedTax for the Dashboard Table (EnrichedDashboardHolding)
    const realizedTax = realizedTaxDisplay;

    const unvestedVal = convertCurrency(h.marketValueUnvested.amount, h.marketValueUnvested.currency, displayCurrency, exchangeRates);

    // Day Change
    let dayChangeVal = 0;
    let dayChangePct = h.dayChangePct;
    if (dayChangePct !== 0) {
      const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, dayChangePct, displayCurrency, exchangeRates);
      dayChangeVal = changeVal * h.qtyVested;
    }

    const display: DashboardHoldingDisplay = {
      marketValue,
      unrealizedGain, // Use definition from line 69
      unrealizedGainPct: costBasisDisplay > 0 ? unrealizedGain / costBasisDisplay : 0,
      realizedGain: realizedGainGross,
      realizedGainGross,
      realizedGainNet,
      // realizedGainPct: yield on SOLD portion only (pure trade performance)
      realizedGainPct: costOfSoldDisplay > 0 ? realizedSellsGross / costOfSoldDisplay : 0, 
      realizedGainAfterTax,
      totalGain,
      totalGainPct: (costBasisDisplay + costOfSoldDisplay) > 0 ? totalGain / (costBasisDisplay + costOfSoldDisplay) : 0,
      valueAfterTax,
      dayChangeVal,
      dayChangePct,
      costBasis: costBasisDisplay,
      costOfSold: costOfSoldDisplay,
      proceeds: proceedsDisplay,
      dividends: dividendsNet, // Net
      currentPrice: convertCurrency(h.currentPrice, h.stockCurrency, displayCurrency, exchangeRates),
      avgCost: h.qtyVested > 0 ? costBasisDisplay / h.qtyVested : 0,
      weightInPortfolio: 0, 
      weightInGlobal: 0,
      unvestedValue: unvestedVal,
      realizedTax: realizedTaxDisplay,
      unrealizedTax: unrealizedTaxDisplay
    };

    const pName = portfoliosMap.get(h.portfolioId)?.name || h.portfolioId;

    return {
      ...h, // Holding spread (careful, it has private fields but they won't enumerate usually, or will they?)
      // We should explicit mapping if we don't want private fields.
      // But consumers likely just access public props.
      id: h.id,
      ticker: h.ticker,
      exchange: h.exchange,
      displayName: h.marketName || h.customName || h.name || h.ticker, // Short name preferred for table? User said "For the table use the short name"
      // Wait, user said: "use the short name, but use the long in most other places".
      // DashboardTable uses `displayName`. So `displayName` should be Short (Market).
      // And we should pass Long Name separately?
      // Let's add `longName` to EnrichedDashboardHolding.
      longName: h.customName || h.name || h.marketName || h.ticker,
      nameHe: h.nameHe,                // Map nameHe
      portfolioId: h.portfolioId,
      portfolioName: pName,
      activeLots: h.activeLots,
      realizedLots: h.realizedLots,
      transactions: h.transactions as Transaction[],
      dividends: h.dividends as DividendRecord[],
      qtyTotal: h.qtyTotal, // Mapped from getter
      realizedTax, // Added
      display
    } as unknown as EnrichedDashboardHolding;
  });

  // Weights
  const portfolioAum = new Map<string, number>();

  // 1. Calculate AUM per portfolio
  enrichedHoldings.forEach(h => {
    portfolioAum.set(h.portfolioId, (portfolioAum.get(h.portfolioId) || 0) + h.display.marketValue);
  });

  // 2. Assign weights
  enrichedHoldings.forEach(h => {
    h.display.weightInGlobal = summary.aum > 0 ? h.display.marketValue / summary.aum : 0;
    const pAum = portfolioAum.get(h.portfolioId) || 0;
    h.display.weightInPortfolio = pAum > 0 ? h.display.marketValue / pAum : 0;
  });

  return { summary, holdings: enrichedHoldings };
}
