
import { describe, it, expect } from 'vitest';
import { calculateTopMovers } from './dashboard_movers';
import { Currency, Exchange, type DashboardHolding } from './types';

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

  it('should filter movers by value threshold', () => {
    const hBig = mockHolding('BIG', 'p1', 0.1, 10, 100); // Val 1000, Change ~90 (depends on math, let's say 100)
    const hSmall = mockHolding('SML', 'p1', 0.1, 1, 100); // Val 100, Change ~9

    // Threshold is 25 USD for USD display currency
    const result = calculateTopMovers([hBig, hSmall], 'USD', exchangeRates, 'change');

    expect(result['1d'].find(m => m.ticker === 'BIG')).toBeDefined();
    expect(result['1d'].find(m => m.ticker === 'SML')).toBeUndefined();
  });

  it('should filter movers by pct threshold', () => {
    const hBigPct = mockHolding('BIGP', 'p1', 0.01, 100, 100); // 1% change
    const hSmallPct = mockHolding('SMLP', 'p1', 0.0001, 100, 100); // 0.01% change

    // Threshold is 0.05% (0.0005)
    const result = calculateTopMovers([hBigPct, hSmallPct], 'USD', exchangeRates, 'pct');

    expect(result['1d'].find(m => m.ticker === 'BIGP')).toBeDefined();
    expect(result['1d'].find(m => m.ticker === 'SMLP')).toBeUndefined();
  });

  it('should use ILS threshold correctly', () => {
    const h1 = mockHolding('ILS1', 'p1', 0.1, 1, 100); // Change ~9 USD = ~36 ILS (if rate 4)
    const h2 = mockHolding('ILS2', 'p1', 0.5, 1, 100); // Change ~33 USD = ~132 ILS

    // threshold is 100 ILS
    const result = calculateTopMovers([h1, h2], 'ILS', exchangeRates, 'change');

    expect(result['1d'].find(m => m.ticker === 'ILS2')).toBeDefined();
    expect(result['1d'].find(m => m.ticker === 'ILS1')).toBeUndefined();
  });
});
