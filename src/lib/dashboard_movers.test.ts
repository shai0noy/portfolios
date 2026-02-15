
import { describe, it, expect } from 'vitest';
import { calculateTopMovers } from './dashboard_movers';
import { DashboardHolding, Currency, Exchange } from './types';

// Minimal mock for DashboardHolding
const mockHolding = (
  ticker: string,
  portfolioId: string,
  dayChangePct: number,
  qtyTotal: number = 10,
  currentPrice: number = 100
): DashboardHolding => ({
  id: `${portfolioId}_${ticker}`,
  key: `${portfolioId}_${ticker}`,
  portfolioId,
  portfolioName: `Portfolio ${portfolioId}`,
  portfolioCurrency: Currency.USD,
  ticker,
  exchange: Exchange.NASDAQ,
  displayName: ticker,
  qtyVested: qtyTotal,
  qtyUnvested: 0,
  qtyTotal,
  currentPrice,
  stockCurrency: Currency.USD,
  dayChangePct,
  perf1w: dayChangePct, // Use same for 1w for simplicity
  perf1m: dayChangePct, // Use same for 1m

  // Dummy values for required fields
  costBasisVested: { amount: 1000, currency: Currency.USD },
  costOfSoldTotal: { amount: 0, currency: Currency.USD },
  proceedsTotal: { amount: 0, currency: Currency.USD },
  dividendsTotal: { amount: 0, currency: Currency.USD },
  unrealizedGain: { amount: 0, currency: Currency.USD },
  realizedGainNet: { amount: 0, currency: Currency.USD },
  feesTotal: { amount: 0, currency: Currency.USD },
  marketValueVested: { amount: 1000, currency: Currency.USD },
  marketValueUnvested: { amount: 0, currency: Currency.USD },
  realizedTax: 0,
  unrealizedTaxLiabilityILS: 0,
  unrealizedTaxableGainILS: 0,
  display: {} as any
} as DashboardHolding);

describe('calculateTopMovers', () => {
  const exchangeRates = { current: { USD: 1, ILS: 4 } };


  it('should deduplicate entries for same ticker (Fix)', () => {
    const h1 = mockHolding('AAPL', 'p1', 0.05, 10, 100); // Val 1000, Change 50
    const h2 = mockHolding('AAPL', 'p2', 0.05, 10, 100); // Val 1000, Change 50
    // Total Change should be 100. Pct should be 5%.

    const holdings = [h1, h2];
    const result = calculateTopMovers(holdings, 'USD', exchangeRates);

    const aaplMovers = result['1d'].filter(m => m.ticker === 'AAPL');
    expect(aaplMovers.length).toBe(1);
    // Current Price 100, Gain 5%. Old Price = 100/1.05 = 95.238. Change = 4.762 per unit.
    // Qty 10. Change = 47.62. Two holdings = 95.24.
    expect(aaplMovers[0].change).toBeCloseTo(95.24, 1);
    expect(aaplMovers[0].pct).toBeCloseTo(0.05);
  });

  it('should calculate weighted average pct for different personal performance', () => {
    // H1: +10% on 1000 val => Start 909.09, Gain 90.9
    // H2: +0% on 1000 val => Start 1000, Gain 0
    // Total Start: 1909.09. Total End: 2000. Gain: 90.9.
    // Pct: 90.9 / 1909.09 = 4.76%

    // Wait, simplify:
    // H1: +100% on 100 (Start 50). Gain 50.
    // H2: +0% on 100 (Start 100). Gain 0.
    // Total Start 150. Total End 200. Total Gain 50. Pct = 33.33%

    const h1 = mockHolding('VOLT', 'p1', 1.0, 1, 100); // 100% gain, Curr 100 (was 50)
    const h2 = mockHolding('VOLT', 'p2', 0.0, 1, 100); // 0% gain, Curr 100 (was 100)

    // Force perf1w to differ
    h1.perf1w = 1.0;
    h2.perf1w = 0.0;

    const result = calculateTopMovers([h1, h2], 'USD', exchangeRates);
    const mover = result['1w'].find(m => m.ticker === 'VOLT');

    expect(mover).toBeDefined();
    // Change: (50) + (0) = 50.
    // Pct: 33.33%
    expect(mover?.change).toBeCloseTo(50, 1);
    expect(mover?.pct).toBeCloseTo(0.3333, 2);
  });
});
