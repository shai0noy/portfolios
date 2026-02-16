
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction, type ExchangeRates } from '../types';

const mockExchangeRates: ExchangeRates = {
  current: {
    'USD': 1,
    'ILS': 3.7,
    'EUR': 0.9,
  },
  'USD': { 'ILS': 3.7, 'USD': 1, 'EUR': 0.9 },
  'ILS': { 'USD': 1 / 3.7, 'ILS': 1, 'EUR': 0.9 / 3.7 },
  '2020-01-01': { 'USD': 1, 'ILS': 3.5, 'EUR': 0.9 }, // Historical: USD=3.5 ILS
  '2021-01-01': { 'USD': 1, 'ILS': 4.0, 'EUR': 0.9 }, // Historical: USD=4.0 ILS
};

const mockCPIData: any = {
  ticker: 'CPI',
  exchange: Exchange.TASE,
  price: 110,
  numericId: null,
  historical: [
    { date: new Date('2023-01-01'), price: 110 },
    { date: new Date('2020-01-01'), price: 100 },
  ]
};

describe('Adjusted Cost Calculation (IL_REAL_GAIN)', () => {

  it('should calculate CPI-adjusted cost for Domestic (ILS) assets', () => {
    const p: Portfolio = {
      id: 'p1', name: 'ILS Portfolio', currency: Currency.ILS,
      taxPolicy: 'IL_REAL_GAIN',
      cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, divPolicy: 'cash_taxed', divCommRate: 0
    };

    const txn: Transaction = {
      date: '2020-01-01',
      portfolioId: 'p1',
      ticker: 'TLV:123',
      exchange: Exchange.TASE,
      type: 'BUY',
      qty: 10,
      price: 100, // 100 ILS per unit. Total 1000 ILS.
      currency: Currency.ILS,
      originalQty: 10,
      originalPrice: 100
    };

    const engine = new FinanceEngine([p], mockExchangeRates, mockCPIData);
    engine.processEvents([txn], []);
    engine.calculateSnapshot();
    const h = engine.holdings.get('p1_TLV:123');

    expect(h).toBeDefined();
    // Cost: 1000 ILS.
    // CPI: 100 -> 110 (10% increase).
    // Adjusted Cost should be 1100 ILS.
    // engine uses current date for CPI. We need to mock "current date" or ensure mockCPIData covers "now".
    // engine.calculateSnapshot uses new Date().
    // We can't easily mock new Date() inside engine without DI or system time mock.
    // However, getCPI finds the CLOSEST date. `mockCPIData` has '2023-01-01'. 
    // If "now" is 2026, and 2023 is last point, it uses 110.

    expect(h?.adjustedCost).toBeCloseTo(1100, 1);
  });

  it('should calculate Currency-adjusted cost for Foreign (USD) assets when ILS devalues (Inflation)', () => {
    // Buy when USD=3.5 ILS. Current USD=3.7 ILS.
    // Devaluation of ILS -> Real Cost increases.
    const p: Portfolio = {
      id: 'p2', name: 'USD Portfolio', currency: Currency.USD,
      taxPolicy: 'IL_REAL_GAIN',
      cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, divPolicy: 'cash_taxed', divCommRate: 0
    };

    const txn: Transaction = {
      date: '2020-01-01', // USD=3.5
      portfolioId: 'p2',
      ticker: 'AAPL',
      exchange: Exchange.NASDAQ,
      type: 'BUY',
      qty: 10,
      price: 100, // 100 USD. Total 1000 USD.
      currency: Currency.USD,
      originalQty: 10,
      originalPrice: 100
    };

    const engine = new FinanceEngine([p], mockExchangeRates, mockCPIData);
    engine.processEvents([txn], []);
    engine.calculateSnapshot(); // Snapshot in ILS to verify ILS values internally first?
    // Actually holding field `adjustedCost` is in Portfolio Currency (USD).

    const h = engine.holdings.get('p2_AAPL');
    expect(h).toBeDefined();

    // Nominal Cost (ILS) at Buy: 1000 USD * 3.5 = 3500 ILS.
    // Real Cost (ILS) at Current: 1000 USD * 3.7 = 3700 ILS.
    // Adjusted Cost (ILS) = Max(3500, 3700) = 3700 ILS.
    // Converted to Portfolio Currency (USD): 3700 ILS / 3.7 = 1000 USD.

    // Wait, if Adjusted Cost = 1000 USD.
    expect(h?.adjustedCost).toBeCloseTo(1000, 1);

    // Verification in ILS
    // const adjCostILS = h?.activeLots[0].adjustedCost! * 3.7; // Approx
    // Actually engine stores `adjustedCost` in PC.
    // But let's check exact logic through `unrealizedTaxLiability` maybe?
    // Or blindly trust the property if test passes.

    // Let's modify rates to check significant change.
    // If Current ILS was 7.0 (Huge Devaluation).
    // Nominal: 3500. Real: 7000. Adjusted: 7000 ILS. -> 1000 USD.
    // It seems for USD based portfolio, Adjusted Cost (PC) stays Original Cost (PC) if Devaluation happens?
    // Yes, because 1000 USD is ALWAYS worth 1000 USD * Rate in ILS.
    // So Real Cost matches Original Cost in PC terms.

    // What if APPRECIATION?
    // Buy when USD=4.0 (2021). Current USD=3.7.
    // Nominal Cost (ILS) = 1000 * 4.0 = 4000 ILS.
    // Real Cost (ILS) = 1000 * 3.7 = 3700 ILS.
    // Adjusted Cost (ILS) = Max(4000, 3700) = 4000 ILS.
    // Converted to PC (USD) @ 3.7: 4000 / 3.7 = 1081.08 USD.
    // So Adjusted Cost in USD should be HIGHER than Original Cost.
  });

  it('should calculate Currency-adjusted cost for Foreign (USD) assets when ILS appreciates (Deflation)', () => {
    const p: Portfolio = {
      id: 'p3', name: 'USD Portfolio 2', currency: Currency.USD,
      taxPolicy: 'IL_REAL_GAIN',
      cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, divPolicy: 'cash_taxed', divCommRate: 0
    };

    const txn: Transaction = {
      date: '2021-01-01', // USD=4.0
      portfolioId: 'p3',
      ticker: 'MSFT',
      exchange: Exchange.NASDAQ,
      type: 'BUY',
      qty: 10,
      price: 100, // 1000 USD. Nominal Cost 4000 ILS.
      currency: Currency.USD,
      originalQty: 10,
      originalPrice: 100
    };

    // Current Rate is 3.7 (from mockExchangeRates.current)
    const engine = new FinanceEngine([p], mockExchangeRates, mockCPIData);
    engine.processEvents([txn], []);
    engine.calculateSnapshot();

    const h = engine.holdings.get('p3_MSFT');
    expect(h).toBeDefined();

    // Nominal: 4000 ILS.
    // Real: 1000 * 3.7 = 3700 ILS.
    // Adjusted (ILS) = 4000.
    // Adjusted (USD) = 4000 / 3.7 = 1081.08...

    expect(h?.adjustedCost).toBeCloseTo(1081.08, 0.1);
  });

});
