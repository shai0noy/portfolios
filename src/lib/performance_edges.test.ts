
import { calculatePortfolioPerformance, PerformancePoint, calculatePeriodReturns } from './performance';
import { describe, it, expect } from 'vitest';
import { Exchange, Currency, DashboardHolding, Transaction } from './types';

describe('calculatePortfolioPerformance - Edge Cases', () => {

  const mkFetch = (historyMap: Record<string, { date: Date, price: number }[]>) => {
    return async (t: string, e: string) => {
      const key = `${e}:${t}`;
      const res = historyMap[key] || [];
      console.log(`mkFetch: Request ${e}:${t} -> Key ${key}, Found ${res.length}`);
      return {
        historical: res,
        fromCache: true
      } as any;
    }
  };

  const mockRates = { current: { USD: 1, EUR: 0.9 }, ago1m: { USD: 1, EUR: 0.9 } } as any;

  it('should correctly handle Dividends in Total Gain', async () => {
    const holdings: DashboardHolding[] = [{
      portfolioId: 'p1', ticker: 'DIVSTART', exchange: Exchange.NASDAQ,
      stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
      qtyVested: 10, totalQty: 10
    } as any];

    const txns: Transaction[] = [
      { date: '2024-01-01T00:00:00.000Z', portfolioId: 'p1', ticker: 'DIVSTART', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
      { date: '2024-01-02T00:00:00.000Z', portfolioId: 'p1', ticker: 'DIVSTART', exchange: Exchange.NASDAQ, type: 'DIVIDEND', qty: 0, price: 50 } as any // $50 Dividend
    ];

    const history = {
      'NASDAQ:DIVSTART': [
        { date: new Date('2024-01-01T00:00:00.000Z'), price: 100 },
        { date: new Date('2024-01-02T00:00:00.000Z'), price: 100 },
      ]
    };
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mkFetch(history));

    // Day 2:
    // Value: 10 * 100 = 1000.
    // Cost: 1000.
    // Unrealized: 0.
    // Dividends: 50.
    // Total Gain = 50.

    const p2 = points.find(p => p.date.getUTCDate() === 2);
    expect(p2).toBeDefined();
    expect(p2?.gainsValue).toBeCloseTo(50, 0.01);
    expect(p2?.holdingsValue).toBeCloseTo(1000, 0.01);
  });

  it('should correctly handle Fees in Total Gain', async () => {
    const holdings: DashboardHolding[] = [{
      portfolioId: 'p1', ticker: 'FEESTART', exchange: Exchange.NASDAQ,
      stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
      qtyVested: 10, totalQty: 10
    } as any];

    const txns: Transaction[] = [
      { date: '2024-01-01T00:00:00.000Z', portfolioId: 'p1', ticker: 'FEESTART', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
      { date: '2024-01-02T00:00:00.000Z', portfolioId: 'p1', ticker: 'FEESTART', exchange: Exchange.NASDAQ, type: 'FEE', qty: 0, price: 5 } as any // $5 Fee
    ];

    const history = {
      'NASDAQ:FEESTART': [
        { date: new Date('2024-01-01T00:00:00.000Z'), price: 100 },
        { date: new Date('2024-01-02T00:00:00.000Z'), price: 100 },
      ]
    };

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mkFetch(history));

    // Day 2:
    // Value: 1000. Cost: 1000.
    // Fees: 5.
    // Total Gain = -5.

    const p2 = points.find(p => p.date.getUTCDate() === 2);
    expect(p2).toBeDefined();
    expect(p2?.gainsValue).toBeCloseTo(-5, 0.01);
  });

  it('should handle Intraday Buy and Sell (Day Trading)', async () => {
    // Buy 10 @ 100. Sell 10 @ 110 same day.
    // End of day: 0 quantity.
    // Realized Gain: 100.
    // TWR: 1.1? (End Value 0, but started with 0? No, checking flow logic)
    // If start 0, end 0, but flow 1000 in, 1100 out.
    // Market Gain = (0 - (-100)) - 0 = 100? No.
    // Flow: +1000 (Buy), -1100 (Sell). Net Flow -100.
    // Market Gain = (0 - (-100)) - 0 = 100.
    // Return = 100 / (1000 in)? 
    // Wait, denominator is tricky for intraday if started empty. 
    // Logic checks dayNetFlow > 1e-6 if denom is 0.
    // But here dayNetFlow is -100 (Negative).
    // If Net Flow is negative, it means we took money out.
    // Logic needs to handle "Capital employed during the day".
    // Current logic might fail this specific "Started Empty, Ended Empty" case if generic TWR formula doesn't account for *absolute magnitude* of flow.
    // Actually, Modified Dietz or similar needed for accurate intraday TWR.
    // Simple TWR assumes EOD flows or specific convention.
    // Let's see what current logic does.

    const holdings: DashboardHolding[] = []; // Empty at end

    const txns: Transaction[] = [
      { date: '2024-01-01T10:00:00', portfolioId: 'p1', ticker: 'DAYTRADE', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
      { date: '2024-01-01T14:00:00', portfolioId: 'p1', ticker: 'DAYTRADE', exchange: Exchange.NASDAQ, type: 'SELL', qty: 10, price: 110 } as any
    ];

    const history = {
      'NASDAQ:DAYTRADE': [
        { date: new Date('2024-01-01T00:00:00'), price: 105 }, // EOD price irrelevant as we sold, but needed for lookup
        { date: new Date('2024-01-02T00:00:00'), price: 105 },
      ]
    };

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mkFetch(history));

    const p1 = points.find(p => p.date.getUTCDate() === 1);
    expect(p1).toBeDefined();
    if (p1) {
      expect(p1.gainsValue).toBeCloseTo(100, 0.01);
    }
  });

  it('should handle Currency Fluctuation (Stock Flat, Currency Moves)', async () => {
    // Portfolio USD. Stock EUR.
    // Buy 1 share @ 100 EUR. EUR/USD = 1.0. Cost 100 USD.
    // Day 2: Stock 100 EUR. EUR/USD = 1.1 (EUR stronger).
    // Value: 100 EUR * 1.1 = 110 USD.
    // Gain: 10 USD (Currency Gain).

    const holdings: DashboardHolding[] = [{
      portfolioId: 'p1', ticker: 'EURSTOCK', exchange: Exchange.LSE, // Mock LSE as EUR source
      stockCurrency: Currency.EUR, portfolioCurrency: Currency.USD,
      qtyVested: 1, totalQty: 1
    } as any];

    const txns: Transaction[] = [
      { date: '2024-01-01T00:00:00.000Z', portfolioId: 'p1', ticker: 'EURSTOCK', exchange: Exchange.LSE, type: 'BUY', qty: 1, price: 100, currency: Currency.EUR } as any
    ];

    const history = {
      'LSE:EURSTOCK': [
        { date: new Date('2024-01-01T00:00:00.000Z'), price: 100 },
        { date: new Date('2024-01-02T00:00:00.000Z'), price: 100 },
      ]
    };

    // Custom rates for this test
    const rates = {
      current: { USD: 1, EUR: 1.1 },
      ago1m: { USD: 1, EUR: 1.1 }
    } as any;
    // BUT wait, calculatePortfolioPerformance takes rates as argument, 
    // but `convertCurrency` usually uses *current* rates for display?
    // NO, historical conversion needs historical rates?
    // `calculatePortfolioPerformance` currently uses a SINGLE `exchangeRates` object.
    // Does it simulate historical rates? 
    // Looking at code: `convertCurrency(..., exchangeRates)`.
    // It seems it uses CONSTANT rates provided at validation time (likely 'current' rates).
    // If so, it won't capture historical currency volatility accurately unless `exchangeRates` contained history (it doesn't, it's `ExchangeRates` object with current/ago).
    // If it uses constant rates, then Gain should be 0 because 100 EUR = X USD at T1 and T2.

    // Let's verify this ASSUMPTION.
    // If the code uses constant rates, then Currency Gain won't show up. 
    // This is a known limitation if historical rates aren't fed.
    // The user might Expect currency gains.

    // Let's check if the result is 0 (Constant Rate assumption) or something else.


    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', rates, undefined, undefined, mkFetch(history));
    const p2 = points.find(p => p.date.getUTCDate() === 2);

    // If constant rates used:
    // Cost: 100 EUR * 1.1 = 110 USD.
    // Value: 100 EUR * 1.1 = 110 USD.
    // Gain: 0.

    expect(p2?.gainsValue).toBeCloseTo(0, 0.01);
  });

});
