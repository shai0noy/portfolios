
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
    // Vested Calculations
    const mvVested = h.marketValueVested; // SimpleMoney (SC)
    const cbVested = h.costBasisVested; // SimpleMoney (PC)

    // Calculate Unrealized Gain Vested in PC
    // We need MV in PC
    const mvVestedPC = convertCurrency(mvVested.amount, mvVested.currency, h.portfolioCurrency, exchangeRates);
    const unrealizedGainVestedVal = mvVestedPC - cbVested.amount;

    const marketValue = convertCurrency(mvVested.amount, mvVested.currency, displayCurrency, exchangeRates);
    const unrealizedGain = convertCurrency(unrealizedGainVestedVal, h.portfolioCurrency, displayCurrency, exchangeRates);

    // dividendsTotal is now SimpleMoney (PC)
    // dividendsTotal is Net (Pocket).
    // derived Gross Dividends
    const dividendsNet = convertCurrency(h.dividendsTotal.amount, h.dividendsTotal.currency, displayCurrency, exchangeRates);

    // Sum Gross Dividends from records
    // Use (h as any)._dividends if available, else fallback to net + tax (approx if fee is 0)
    const rawDivs = ((h as any)._dividends || []) as DividendRecord[];
    let dividendsGross = 0;
    let dividendsTax = 0;

    // Helper to calc tax display
    const divTaxToDeduct = (h as any)._dividends
      ? (h as any)._dividends.reduce((acc: number, d: any) => acc + (d.taxAmountPC || 0), 0)
      : 0;
    const divTaxDisplay = convertCurrency(divTaxToDeduct, h.portfolioCurrency, displayCurrency, exchangeRates);

    if (rawDivs.length > 0) {
      dividendsGross = rawDivs.reduce((sum, d) => sum + convertCurrency(d.grossAmount.amount, d.grossAmount.currency, displayCurrency, exchangeRates), 0);
      dividendsTax = rawDivs.reduce((sum, d) => sum + convertCurrency(d.taxAmountPC, h.portfolioCurrency, displayCurrency, exchangeRates), 0);
    } else {
      // Fallback
      dividendsTax = divTaxDisplay;
      dividendsGross = dividendsNet + dividendsTax;
    }

    // Realized Gain from Sells (Pre-Fee, Pre-Tax) = Proceeds - CostOfSold
    // proceedsTotal and costOfSoldTotal are available
    const proceedsDisplay = convertCurrency(h.proceedsTotal.amount, h.proceedsTotal.currency, displayCurrency, exchangeRates);
    const costOfSoldDisplay = convertCurrency(h.costOfSoldTotal.amount, h.costOfSoldTotal.currency, displayCurrency, exchangeRates);
    const realizedSellsGross = proceedsDisplay - costOfSoldDisplay;

    // Realized Gain (Gross) for UI = Sells Gross + Divs Gross
    // Label "Realized" will use this.
    const realizedGainGross = realizedSellsGross + dividendsGross;

    // Net Realized = (Sells Net of Fee - Sells Tax) + (Divs Net - [Divs Tax is already deducted in Net])
    // Wait, Divs Net IS Net.
    // Sells Net of Fee = h.realizedGainNet (Pre-Tax)
    const realizedSellsNetFee = convertCurrency(h.realizedGainNet.amount, h.realizedGainNet.currency, displayCurrency, exchangeRates);
    const realizedSellsTax = convertCurrency(h.realizedCapitalGainsTax || 0, h.portfolioCurrency, displayCurrency, exchangeRates);

    const realizedSellsNet = realizedSellsNetFee - realizedSellsTax;

    // Net Realized Total = Sells Net + Divs Net
    const realizedGainNet = realizedSellsNet + dividendsNet;

    // costBasisDisplay was calculated above (line 101).
    const costBasisDisplay = convertCurrency(cbVested.amount, cbVested.currency, displayCurrency, exchangeRates);

    // Total Gain = Unrealized (Gross) + Realized (Gross)
    // "Gross" here means Pre-Tax, Pre-Fee.
    // Unrealized Gain is MV - Cost (Pre-Fee, Pre-Tax).
    const totalGain = unrealizedGain + realizedGainGross;

    const realizedTaxDisplay = convertCurrency(h.totalTaxPaidPC, h.portfolioCurrency, displayCurrency, exchangeRates);
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
