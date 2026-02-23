
import { useState, useEffect, useCallback } from 'react';
import { loadFinanceEngine } from './data/loader';
import { clearAllCache } from './fetching/utils/cache';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';
// import { Currency } from './types'; // Unused

import type { DashboardHolding, DashboardSummaryData, Portfolio, ExchangeRates } from './types';
// import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currencyUtils'; // Unused

import { INITIAL_SUMMARY, FinanceEngine } from './data/engine';
// import type { Lot, DividendRecord } from './data/model'; // Unused
// import type { Transaction } from './types'; // Unused
import { calculateDashboardSummary } from './dashboard_calc';
import type { EnrichedDashboardHolding } from './dashboard_calc';
import type { DashboardHoldingDisplay } from './types';


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

  const loadData = useCallback(async (force = false) => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      if (force) {
        await clearAllCache();
      }
      const eng = await loadFinanceEngine(sheetId, force);
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

  return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: (force = false) => loadData(force), engine };
}

export { calculateDashboardSummary };
export type { DashboardHoldingDisplay, EnrichedDashboardHolding, DashboardSummaryData };
