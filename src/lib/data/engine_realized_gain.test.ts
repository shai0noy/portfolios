
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type ExchangeRates, type Transaction } from '../types';

describe('FinanceEngine Realized Gain Logic', () => {
    const mockRates: ExchangeRates = {
        current: { USD: 1, ILS: 5.0 }, // High current rate
        ago1m: { USD: 1, ILS: 3.5 }
    };

    const p1: Portfolio = {
        id: 'p1', name: 'ILS Portfolio', currency: Currency.ILS,
        taxPolicy: 'IL_REAL_GAIN', cgt: 0.25, incTax: 0.25,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as any;

    it('should use historical rates for realized gain when originalPriceILA is present', () => {
        const engine = new FinanceEngine([p1], mockRates, null);

        // Scenario:
        // Buy 1 @ $100 when rate was 3.5 (Cost = 350 ILS)
        // Sell 1 @ $110 when rate was 3.5 (Proceeds = 385 ILS)
        // Gain should be 35 ILS.
        // Current Rate is 5.0 (Proceeds at current would be 550 ILS, Cost at current 500 ILS or 350 ILS fixed?)

        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p1', ticker: 'HIST', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 1, price: 100, currency: Currency.USD,
                originalPrice: 100, originalPriceILA: 35000 // 350 ILS
            },
            {
                numericId: 2, portfolioId: 'p1', ticker: 'HIST', exchange: Exchange.NASDAQ,
                date: '2023-02-01', type: 'SELL', qty: 1, price: 110, currency: Currency.USD,
                originalPrice: 110, originalPriceILA: 38500 // 385 ILS
            }
        ] as any;

        engine.processEvents(txns, []);

        const holding = engine.holdings.get('p1_HIST');
        expect(holding).toBeDefined();
        
        // Check Realized Gain Net (in Portfolio Currency = ILS)
        // Should be 385 - 350 = 35.
        // If it uses Current Rate (5.0), Proceeds might be 110 * 5 = 550.
        // Cost might be 350 (fixed) or 500 (floating).
        // If Proceeds=550, Cost=350, Gain=200. (BUG)
        
        expect(holding?.realizedGainNet.amount).toBeCloseTo(35, 0.1);
    });

    it('should use historical rates for realized gain when originalPriceUSD is present in USD portfolio', () => {
        const pUSD: Portfolio = { ...p1, id: 'p2', currency: Currency.USD, name: 'USD Portfolio' };
        const engine = new FinanceEngine([pUSD], mockRates, null);

        // Buy 1 @ 100 USD (originalPriceUSD = 100)
        // Sell 1 @ 110 USD (originalPriceUSD = 110)
        // Realized Gain = 10 USD.
        // Rate independent, but logic should use fields.

        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p2', ticker: 'USST', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 1, price: 100, currency: Currency.USD,
                originalPrice: 100, originalPriceUSD: 100
            },
            {
                numericId: 2, portfolioId: 'p2', ticker: 'USST', exchange: Exchange.NASDAQ,
                date: '2023-02-01', type: 'SELL', qty: 1, price: 110, currency: Currency.USD,
                originalPrice: 110, originalPriceUSD: 110
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p2_USST');
        expect(holding?.realizedGainNet.amount).toBeCloseTo(10, 0.1);
    });
});
