import { useState, useEffect, useCallback } from 'react';
import { loadFinanceEngine } from './data/loader';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';
import { Currency } from './types';
import type { DashboardHolding, DashboardSummaryData, Portfolio, ExchangeRates } from './types';
import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currency';
import type { UnifiedHolding } from './data/model';
import { INITIAL_SUMMARY, FinanceEngine } from './data/engine';

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
    
    const unifiedHoldings = Array.from(engine.holdings.values()) as UnifiedHolding[];
    const filteredUnified = unifiedHoldings.filter(h => dataKeys.has(h.id));
    
    const enrichedHoldings: EnrichedDashboardHolding[] = filteredUnified.map(h => {
        const marketValue = convertCurrency(h.marketValueVested, h.portfolioCurrency, displayCurrency, exchangeRates);
        const unrealizedGain = convertCurrency(h.unrealizedGainVested, h.portfolioCurrency, displayCurrency, exchangeRates);
        const dividends = convertCurrency(h.dividendsPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates);
        const realizedGainFromSells = convertCurrency(h.realizedGainPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates);
        const realizedGain = realizedGainFromSells + dividends;
        const costOfSold = convertCurrency(h.costOfSoldPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates);
        const totalFees = convertCurrency(h.totalFeesPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates);
        
        // Total Gain (Net of Fees)
        const totalGain = (unrealizedGain + realizedGain) - totalFees;
        
        const realizedTaxDisplay = convertCurrency(h.realizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);
        const unrealizedTaxDisplay = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);
        
        const valueAfterTax = marketValue - unrealizedTaxDisplay;
        // Realized Gain After Tax = Realized Gain (which includes dividends) - Realized Tax
        const realizedGainAfterTax = realizedGain - realizedTaxDisplay;

        const costBasis = convertCurrency(h.costBasisVestedPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates); 
        
        const unvestedVal = convertCurrency(h.marketValueUnvested, h.portfolioCurrency, displayCurrency, exchangeRates);

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
            realizedGainPct: costBasis > 0 ? realizedGain / costBasis : 0,
            realizedGainAfterTax,
            totalGain,
            totalGainPct: costBasis > 0 ? totalGain / costBasis : 0, 
            valueAfterTax,
            dayChangeVal,
            dayChangePct,
            costBasis,
            costOfSold,
            proceeds: convertCurrency(h.proceedsPortfolioCurrency, h.portfolioCurrency, displayCurrency, exchangeRates),
            dividends,
            currentPrice: convertCurrency(h.currentPrice, h.stockCurrency, displayCurrency, exchangeRates),
            avgCost: convertCurrency(h.avgCost, h.portfolioCurrency, displayCurrency, exchangeRates),
            weightInPortfolio: 0,
            weightInGlobal: 0,
            unvestedValue: unvestedVal
        };
        
        const pName = portfoliosMap.get(h.portfolioId)?.name || h.portfolioId;

        return { 
            ...h, 
            portfolioName: pName,
            display 
        } as unknown as EnrichedDashboardHolding;
    });

    // Weights
    enrichedHoldings.forEach(h => {
        h.display.weightInGlobal = summary.aum > 0 ? h.display.marketValue / summary.aum : 0;
    });

    return { summary, holdings: enrichedHoldings };
}
