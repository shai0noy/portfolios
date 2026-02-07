
import { useState, useEffect, useCallback } from 'react';
import { loadFinanceEngine } from './data/loader';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';
import { Currency } from './types';
import type { DashboardHolding, DashboardSummaryData, Portfolio, ExchangeRates } from './types';
import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currencyUtils';
import { INITIAL_SUMMARY, FinanceEngine } from './data/engine';
import type { Lot, DividendRecord } from './data/model';
import type { Transaction } from './types';

export type { DashboardSummaryData };

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
}

export interface EnrichedDashboardHolding extends DashboardHolding {
    display: DashboardHoldingDisplay;
  activeLots: Lot[];
  realizedLots: Lot[];
  transactions: Transaction[];
  dividendHistory: DividendRecord[];
}

// Re-export INITIAL_SUMMARY for consumers
export { INITIAL_SUMMARY };

export function useDashboardData(sheetId: string) {
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<DashboardHolding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1, ILS: 3.7 } });
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [hasFutureTxns, setHasFutureTxns] = useState(false);
  const [error, setError] = useState<any>(null);
  const { showLoginModal } = useSession();
  const [engine, setEngine] = useState<FinanceEngine | null>(null);

  const loadData = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const eng = await loadFinanceEngine(sheetId);
      setEngine(eng);
      setPortfolios(Array.from(eng.portfolios.values()));
      setExchangeRates(eng.exchangeRates);
      
      const today = new Date();
      // Use the new getter for transactions in FinanceEngine
      const future = eng.transactions.some(t => new Date(t.date) > today);
      setHasFutureTxns(future);

      setHoldings(Array.from(eng.holdings.values()) as unknown as DashboardHolding[]);
      
      return eng;
    } catch (e) {
      console.error('loadData error:', e);
      if (e instanceof SessionExpiredError) { setError('session_expired'); showLoginModal(); } else setError(e);
    } finally { setLoading(false); }
  }, [sheetId, showLoginModal]);

  useEffect(() => { loadData(); }, [loadData]);

  return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: loadData, engine };
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

      // realizedGainNet is SimpleMoney (PC)
      const realizedGainFromSells = convertCurrency(h.realizedGainNet.amount, h.realizedGainNet.currency, displayCurrency, exchangeRates);
      const realizedGain = realizedGainFromSells + dividends; 

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
      const totalGain = marketValue + proceedsDisplay + dividends - costBasisDisplay - costOfSold - feesTotalDisplay;

      const realizedTaxDisplay = convertCurrency(h.realizedTax, Currency.ILS, displayCurrency, exchangeRates);
        const unrealizedTaxDisplay = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);
        
      const valueAfterTax = marketValue - unrealizedTaxDisplay;
        const realizedGainAfterTax = realizedGain - realizedTaxDisplay;

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
            totalGainPct: costBasis > 0 ? totalGain / costBasis : 0, 
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
          dividendHistory: h.dividends as DividendRecord[],
          totalQty: h.qtyTotal, // Mapped from getter
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
