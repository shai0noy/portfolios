
import { Currency } from './types';
import type { DashboardHolding, DashboardSummaryData, Portfolio, ExchangeRates } from './types';
import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currencyUtils';
import { INITIAL_SUMMARY, FinanceEngine } from './data/engine';
import type { Lot, DividendRecord } from './data/model';
import type { Transaction } from './types';

export interface DashboardHoldingDisplay {
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  realizedGain: number;
  realizedGainPct: number;
  realizedGainAfterTax: number;
  totalGain: number;
  totalGainPct: number;
  valueAfterTax: number;
  dayChangeVal: number;
  dayChangePct: number;
  costBasis: number;
  costOfSold: number;
  proceeds: number;
  dividends: number;
  currentPrice: number;
  avgCost: number;
  weightInPortfolio: number;
  weightInGlobal: number;
  unvestedValue: number;

  // Tax/Inflation
  inflationAdjustedCost?: number; // Portfolio Currency
}

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
    const dividends = convertCurrency(h.dividendsTotal.amount, h.dividendsTotal.currency, displayCurrency, exchangeRates);

    // realizedGainNet is SimpleMoney (PC) - PRE-TAX (Gross of Tax)
    const realizedGainFromSells = convertCurrency(h.realizedGainNet.amount, h.realizedGainNet.currency, displayCurrency, exchangeRates);

    // Calculate Dividend Tax for adjustment
    const divTaxToDeduct = (h as any)._dividends
      ? (h as any)._dividends.reduce((acc: number, d: any) => acc + (d.taxAmountPC || 0), 0)
      : 0;
    const divTaxDisplay = convertCurrency(divTaxToDeduct, h.portfolioCurrency, displayCurrency, exchangeRates);

    // Gross Dividends (Pre-Tax)
    const dividendsGross = dividends + divTaxDisplay;

    // Realized Gain (Gross) = Realized Sell Gain (Gross) + Dividends (Gross)
    const realizedGain = realizedGainFromSells + dividendsGross;

    // costOfSoldTotal is SimpleMoney (PC)
    const costOfSold = convertCurrency(h.costOfSoldTotal.amount, h.costOfSoldTotal.currency, displayCurrency, exchangeRates);

    // feesTotal is SimpleMoney (PC)
    // Standard Definition: Gain = Ending Value + Proceeds - Inflows (Cost Basis + Fees Paid for Active).
    // Robust: Total Gain = marketValue + proceeds + dividends - costBasis - costOfSold - totalFees.
    // All in Display Currency.

    const proceedsPC = h.proceedsTotal.amount; // PC
    const proceedsDisplay = convertCurrency(proceedsPC, h.portfolioCurrency, displayCurrency, exchangeRates);

    const feesTotalDisplay = convertCurrency(h.feesTotal.amount, h.feesTotal.currency, displayCurrency, exchangeRates);
    const costBasisDisplay = convertCurrency(cbVested.amount, cbVested.currency, displayCurrency, exchangeRates);

    // Note: marketValue is Vested. proceeds is Realized. dividends is Realized.
    // costBasis is Vested. costOfSold is Realized.
    // feesTotal is All (Active + Realized).
    // So this formula works for specific "Life of Holding" gain?
    // Using Gross Dividends for Total Return (Pre-Tax)
    const totalGain = marketValue + proceedsDisplay + dividendsGross - costBasisDisplay - costOfSold - feesTotalDisplay;

    const realizedTaxDisplay = convertCurrency(h.totalTaxPaidPC, h.portfolioCurrency, displayCurrency, exchangeRates);
    const unrealizedTaxDisplay = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);

    // Value After Tax (Net Liquidation Value) = Market Value - Unrealized Tax Liability
    const valueAfterTax = marketValue - unrealizedTaxDisplay;

    // Realized Gain After Tax = Realized Gain (Gross) - Total Tax Paid
    const realizedGainAfterTax = realizedGain - realizedTaxDisplay;

    // Also explicitly map realizedTax for the Dashboard Table (EnrichedDashboardHolding)
    // We use the Total Tax Paid (CGT + Inc + Div)
    const realizedTax = realizedTaxDisplay;

    const costBasis = costBasisDisplay;

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
      unrealizedGain,
      unrealizedGainPct: costBasis > 0 ? unrealizedGain / costBasis : 0,
      realizedGain,
      realizedGainPct: costOfSold > 0 ? realizedGain / costOfSold : 0,
      realizedGainAfterTax,
      totalGain,
      totalGainPct: (costBasis + costOfSold) > 0 ? totalGain / (costBasis + costOfSold) : 0,
      valueAfterTax,
      dayChangeVal,
      dayChangePct,
      costBasis,
      costOfSold,
      proceeds: convertCurrency(h.proceedsTotal.amount, h.proceedsTotal.currency, displayCurrency, exchangeRates),
      dividends,
      currentPrice: convertCurrency(h.currentPrice, h.stockCurrency, displayCurrency, exchangeRates),
      avgCost: h.qtyVested > 0 ? convertCurrency(cbVested.amount / h.qtyVested, cbVested.currency, displayCurrency, exchangeRates) : 0,
      weightInPortfolio: 0,
      weightInGlobal: 0,
      unvestedValue: unvestedVal
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
