
import type { DashboardHolding, ExchangeRates } from './types';
import { calculatePerformanceInDisplayCurrency, convertCurrency } from './currencyUtils';

export type TimePeriod = '1d' | '1w' | '1m';

export interface Mover {
  key: string;
  name: string;
  ticker: string;
  change: number;
  pct: number;
  exchange: string;
  holding: DashboardHolding;
}

export function calculateTopMovers(
  holdings: DashboardHolding[],
  displayCurrency: string,
  exchangeRates: ExchangeRates,
  sortBy: 'change' | 'pct' = 'change'
): Record<TimePeriod, Mover[]> {
  const periods: TimePeriod[] = ['1d', '1w', '1m'];
  const result: Record<TimePeriod, Mover[]> = { '1d': [], '1w': [], '1m': [] };

  if (!holdings || holdings.length === 0) {
    // Return empty structure immediately if no holdings
    return result;
  }

  // Calculate Thresholds
  // Value threshold: 100 NIS / 25 USD
  const valueThreshold = (() => {
    if (displayCurrency === 'ILS') return 100;
    if (displayCurrency === 'USD') return 25;
    // Fallback: convert 25 USD to displayCurrency
    return convertCurrency(25, 'USD', displayCurrency, exchangeRates);
  })();

  // Pct threshold: 0.05%
  const pctThreshold = 0.0005;

  // Helper to get change value and percentage for a single holding
  const getHoldingMetrics = (h: DashboardHolding, period: TimePeriod) => {
    const perf = (() => {
      switch (period) {
        case '1d': return h.dayChangePct;
        case '1w': return h.perf1w;
        case '1m': return h.perf1m;
        default: return 0;
      }
    })();

    if (isNaN(perf)) return { changeVal: 0, perf: 0, initialVal: 0, currentVal: 0 };

    const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, exchangeRates);

    // Calculate Unit Value in Display Currency
    const unitValueDisplay = convertCurrency(h.currentPrice, h.stockCurrency, displayCurrency, exchangeRates);

    // Total Value
    const totalValue = unitValueDisplay * h.qtyTotal;
    const totalChange = changeVal * h.qtyTotal; // value change * qty

    // Reverse engineer initial value
    // Final = Initial + Change => Initial = Final - Change
    const initialVal = totalValue - totalChange;

    return { changeVal: totalChange, perf, initialVal, currentVal: totalValue };
  };

  for (const period of periods) {
    // Group by Ticker + Exchange
    const groups = new Map<string, {
      ticker: string,
      exchange: string,
      name: string,
      holdings: DashboardHolding[],
      totalChange: number,
      totalInitial: number,
      totalCurrent: number
    }>();

    for (const h of holdings) {
      const key = `${h.exchange}:${h.ticker}`;
      if (!groups.has(key)) {
        groups.set(key, {
          ticker: h.ticker,
          exchange: h.exchange,
          name: h.displayName,
          holdings: [],
          totalChange: 0,
          totalInitial: 0,
          totalCurrent: 0
        });
      }
      const g = groups.get(key)!;
      g.holdings.push(h);

      const { changeVal, initialVal, currentVal } = getHoldingMetrics(h, period);
      g.totalChange += changeVal;
      g.totalInitial += initialVal;
      g.totalCurrent += currentVal;
    }

    // Convert groups to Mover objects
    const movers: Mover[] = Array.from(groups.values()).map(g => {
      let pct = 0;
      if (period === '1d') {
        // For 1d, rely on market data (should be identical for all)
        // Use the first holding's dayChangePct as it's the most accurate source for "Day Change"
        pct = g.holdings[0]?.dayChangePct || 0;
      } else {
        // For other periods, use weighted average via Initial Value
        // Pct = TotalChange / TotalInitial
        if (Math.abs(g.totalInitial) > 1e-6) {
          pct = g.totalChange / g.totalInitial;
        } else if (g.totalCurrent > 0) {
          // If initial is ~0 but current > 0 (e.g. infinite gain), cap or 0? 
          // Usually implies 100% gain if it was 0? Or infinite?
          // Let's stick to 0 or maybe undefined fallback.
          pct = 0;
        }
      }

      return {
        key: `${g.exchange}:${g.ticker}`,
        name: g.name,
        ticker: g.ticker,
        change: g.totalChange,
        pct: pct,
        exchange: g.exchange,
        holding: g.holdings[0] // Representative holding
      };
    });

    result[period] = movers
      .filter(m => {
        if (isNaN(m.change) || m.change === 0) return false;

        // Threshold Filtering
        if (sortBy === 'change') {
          return Math.abs(m.change) >= valueThreshold;
        } else {
          return Math.abs(m.pct) >= pctThreshold;
        }
      })
      .sort((a, b) => {
        if (sortBy === 'change') {
          return Math.abs(b.change) - Math.abs(a.change);
        } else {
          return Math.abs(b.pct) - Math.abs(a.pct);
        }
      })
      .slice(0, 6);
  }

  return result;
}
