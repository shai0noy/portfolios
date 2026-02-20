
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type ExchangeRates, type Transaction } from '../types';

describe('RSU Account Tax Policy Logic', () => {
    const mockRates: ExchangeRates = {
        current: { USD: 1, ILS: 4.0 }, 
        ago1m: { USD: 1, ILS: 3.5 }
    };

    // Scenario 1: Domestic Asset (ILS) with Inflation
    // Cost: 100 ILS. CPI at Buy: 100.
    // Sell: 150 ILS. CPI at Sell: 110 (10% Inflation).
    // Nominal Gain: 50.
    // Real Cost: 100 * 1.1 = 110.
    // Real Gain: 150 - 110 = 40.
    // Taxable: Min(50, 40) = 40.
    // Tax: 40 * 0.25 = 10.

    const pILS: Portfolio = {
        id: 'p_rsu_il', name: 'RSU ILS', currency: Currency.ILS,
        taxPolicy: 'RSU_ACCOUNT', cgt: 0.25, incTax: 0.50,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as any;

    const mockCPI = {
        historical: [
        { date: new Date('2023-06-01T00:00:00.000Z'), price: 110 },
        { date: new Date('2023-01-01T00:00:00.000Z'), price: 100 }
        ]
    } as any;

    it('should apply Inflation Adjustment for Domestic Assets (same as IL_REAL_GAIN)', () => {
        const engine = new FinanceEngine([pILS], mockRates, mockCPI);

        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p_rsu_il', ticker: 'DOMESTIC', exchange: Exchange.TASE,
            date: '2023-01-01T00:00:00.000Z', type: 'BUY', qty: 1, price: 100, currency: Currency.ILS,
            },
            {
                numericId: 2, portfolioId: 'p_rsu_il', ticker: 'DOMESTIC', exchange: Exchange.TASE,
              date: '2023-06-01T00:00:00.000Z', type: 'SELL', qty: 1, price: 150, currency: Currency.ILS,
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p_rsu_il_DOMESTIC');
        
        expect(holding).toBeDefined();
        // Realized Tax in ILS (Portfolio Currency)
        // 40 * 0.25 = 10
        expect(holding?.realizedCapitalGainsTax).toBeCloseTo(10, 0.01);
    });

    // Scenario 2: Foreign Asset (USD)
    // Cost: $100. Rate at Buy: 3.5. (CostILS = 350)
    // Sell: $110. Rate at Sell: 4.0. (ProceedsILS = 440)
    // Nominal Gain: 440 - 350 = 90 ILS.
    // Real Gain: ($110 - $100) * 4.0 = $10 * 4.0 = 40 ILS.
    // Taxable: Min(90, 40) = 40 ILS.
    // Tax: 40 * 0.25 = 10 ILS.
    // (If it was Nominal, it would be 90 * 0.25 = 22.5)

    const pUSD: Portfolio = {
        id: 'p_rsu_us', name: 'RSU USD', currency: Currency.ILS, // Portfolio in ILS to see tax effects clearly
        taxPolicy: 'RSU_ACCOUNT', cgt: 0.25, incTax: 0.50,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as any;

    it('should apply Exchange Rate Adjustment for Foreign Assets (Real Gain Logic)', () => {
        const rates: ExchangeRates = {
            current: { USD: 1, ILS: 4.0 }, 
            // We need to support historical lookup in Engine or provide it via override?
            // Engine looks up `rates[dateStr]`.
            '2023-01-01': { USD: 1, ILS: 3.5 },
            '2023-06-01': { USD: 1, ILS: 4.0 }
        } as any;

        const engine = new FinanceEngine([pUSD], rates, null);

        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p_rsu_us', ticker: 'FOREIGN', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 1, price: 100, currency: Currency.USD,
            },
            {
                numericId: 2, portfolioId: 'p_rsu_us', ticker: 'FOREIGN', exchange: Exchange.NASDAQ,
                date: '2023-06-01', type: 'SELL', qty: 1, price: 110, currency: Currency.USD,
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p_rsu_us_FOREIGN');

        // Realized Tax in ILS
        expect(holding?.realizedCapitalGainsTax).toBeCloseTo(10, 0.01);
    });

  // Scenario 3: Income Tax
  // RSU_ACCOUNT should apply Income Tax if configured.
  // IL_REAL_GAIN should NOT apply Income Tax even if configured.

  it('should apply Income Tax for RSU_ACCOUNT when incTax is > 0', () => {
    const engine = new FinanceEngine([pILS], mockRates, mockCPI);
    const txns: Transaction[] = [
      {
        numericId: 1, portfolioId: 'p_rsu_il', ticker: 'RSU_STOCK', exchange: Exchange.TASE,
        date: '2023-01-01T00:00:00.000Z', type: 'BUY', qty: 1, price: 100, currency: Currency.ILS,
      },
      {
        numericId: 2, portfolioId: 'p_rsu_il', ticker: 'RSU_STOCK', exchange: Exchange.TASE,
        date: '2023-06-01T00:00:00.000Z', type: 'SELL', qty: 1, price: 120, currency: Currency.ILS,
      }
    ] as any;

    engine.processEvents(txns, []);
    const holding = engine.holdings.get('p_rsu_il_RSU_STOCK');

    // Cost: 100.
    // IncTax Rate: 0.50 (from pILS setup).
    // Expected Income Tax: 100 * 0.50 = 50.
    expect(holding?.realizedIncomeTax).toBeCloseTo(50, 0.01);
  });

  it('should NOT apply Income Tax for IL_REAL_GAIN even if incTax is > 0', () => {
    const pStandard: Portfolio = {
      ...pILS,
      id: 'p_standard',
      taxPolicy: 'IL_REAL_GAIN', // Standard Policy
      incTax: 0.50 // Configured but should be ignored for Income Tax
    };

    const engine = new FinanceEngine([pStandard], mockRates, mockCPI);
    const txns: Transaction[] = [
      {
        numericId: 1, portfolioId: 'p_standard', ticker: 'NORMAL_STOCK', exchange: Exchange.TASE,
        date: '2023-01-01T00:00:00.000Z', type: 'BUY', qty: 1, price: 100, currency: Currency.ILS,
      },
      {
        numericId: 2, portfolioId: 'p_standard', ticker: 'NORMAL_STOCK', exchange: Exchange.TASE,
        date: '2023-06-01T00:00:00.000Z', type: 'SELL', qty: 1, price: 120, currency: Currency.ILS,
      }
    ] as any;

    engine.processEvents(txns, []);
    const holding = engine.holdings.get('p_standard_NORMAL_STOCK');

    // Expected Income Tax: 0 (Restricted to RSU_ACCOUNT).
    expect(holding?.realizedIncomeTax).toBe(0);
  });
});
