
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction } from '../types';

describe('Unvested Gain Multi-Currency Calculation', () => {
  const mockRates = {
    current: { USD: 1, ILS: 4 },
  };

  const mockCPI = {
    historical: []
  };

  const ilPortfolio: Portfolio = {
    id: 'p_il', name: 'IL Portfolio', currency: Currency.ILS,
    cgt: 0.25, incTax: 0,
    commRate: 0, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'IL_REAL_GAIN',
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
  };

  it('calculates unvested gain correctly across different currencies', () => {
    const engine = new FinanceEngine([ilPortfolio], mockRates as any, mockCPI as any);

    // Grant: 10 units of AAPL (USD) @ 100 USD
    // Current Price: 150 USD
    // Rates: 1 USD = 4 ILS

    const grant: Transaction = {
      date: '2024-01-01',
      type: 'BUY',
      portfolioId: 'p_il',
      ticker: 'AAPL',
      exchange: Exchange.NASDAQ,
      qty: 10,
      price: 100,
      originalQty: 10,
      originalPrice: 100,
      currency: Currency.USD,
      vestDate: '2030-01-01' // Future date -> Unvested
    };

    engine.processEvents([grant], []);

    // Force current price
    const h = engine.holdings.get('p_il_AAPL');
    h!.currentPrice = 150;
    engine.calculateSnapshot();

    // Global Summary in ILS
    const summary = engine.getGlobalSummary(Currency.ILS);

    // Unvested Value = 10 units * 150 USD * 4 (USD/ILS) = 6000 ILS
    expect(summary.totalUnvestedValue).toBeCloseTo(6000);

    // Unvested Cost = 10 units * 100 USD * 4 (USD/ILS) = 4000 ILS
    // Unvested Gain = 6000 - 4000 = 2000 ILS
    expect(summary.totalUnvestedGain).toBeCloseTo(2000);
    expect(summary.totalUnvestedGainPct).toBeCloseTo(0.5); // (6000-4000)/4000
  });

  it('calculates unvested gain correctly when cost is 0 (RSUs)', () => {
    const engine = new FinanceEngine([ilPortfolio], mockRates as any, mockCPI as any);

    const rsuGrant: Transaction = {
      date: '2024-01-01',
      type: 'BUY',
      portfolioId: 'p_il',
      ticker: 'RSU',
      exchange: Exchange.NASDAQ,
      qty: 10,
      price: 0,
      originalQty: 10,
      originalPrice: 0,
      currency: Currency.USD,
      vestDate: '2030-01-01'
    };

    engine.processEvents([rsuGrant], []);

    const h = engine.holdings.get('p_il_RSU');
    h!.currentPrice = 150;
    engine.calculateSnapshot();

    const summary = engine.getGlobalSummary(Currency.ILS);

    // Value = 10 * 150 * 4 = 6000 ILS
    // Cost = 0
    // Gain = 6000 ILS
    expect(summary.totalUnvestedValue).toBeCloseTo(6000);
    expect(summary.totalUnvestedGain).toBeCloseTo(6000);
  });
});
