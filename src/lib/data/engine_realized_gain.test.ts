
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

    it('should use splitAdjustedPrice (txn.price) on FIFO SELL when splitRatio is present', () => {
        const pUSD: Portfolio = { ...p1, id: 'p3', currency: Currency.USD, name: 'USD Split Portfolio' };
        const engine = new FinanceEngine([pUSD], mockRates, null);

        // Buy 10 @ $100 -> Cost = $1,000
        // Stock undergoes 10:1 split (splitRatio: 10)
        // Original price before split was $110, split-adjusted price is $11. Qty is 100.
        // Proceeds should be 100 * $11 = $1,100 (NOT 100 * $110 = $11,000).
        // Gain should be $1,100 - $1,000 = $100.
        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p3', ticker: 'SPLT', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 100, price: 10, currency: Currency.USD,
                originalQty: 10, originalPrice: 100, splitRatio: 10,
                splitAdjustedQty: 100, splitAdjustedPrice: 10
            },
            {
                numericId: 2, portfolioId: 'p3', ticker: 'SPLT', exchange: Exchange.NASDAQ,
                date: '2023-02-01', type: 'SELL', qty: 100, price: 11, currency: Currency.USD,
                originalQty: 10, originalPrice: 110, splitRatio: 10,
                splitAdjustedQty: 100, splitAdjustedPrice: 11
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p3_SPLT');
        expect(holding).toBeDefined();
        // Proceeds must be 1,100, cost 1,000 -> gain = 100
        expect(holding?.realizedGainNet.amount).toBeCloseTo(100, 0.1);
        expect(holding?.realizedLots[0].soldPricePerUnit?.amount).toBeCloseTo(11, 0.1);
    });

    it('should use splitAdjustedPrice on TASE (ILA) stock with splitRatio', () => {
        const engine = new FinanceEngine([p1], mockRates, null);

        // Buy 1,000 @ 100 ILA (1.00 ILS). Cost = 1,000 ILS.
        // TASE stock undergoes 2:1 split (splitRatio: 2)
        // Qty becomes 2,000. Sold 2,000 @ 55 ILA (0.55 ILS).
        // Proceeds: 2,000 * 0.55 ILS = 1,100 ILS.
        // Gain: 1,100 - 1,000 = 100 ILS.
        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p1', ticker: 'ORL', exchange: Exchange.TASE,
                date: '2023-01-01', type: 'BUY', qty: 2000, price: 50, currency: Currency.ILA,
                originalQty: 1000, originalPrice: 100, splitRatio: 2,
                splitAdjustedQty: 2000, splitAdjustedPrice: 50
            },
            {
                numericId: 2, portfolioId: 'p1', ticker: 'ORL', exchange: Exchange.TASE,
                date: '2023-02-01', type: 'SELL', qty: 2000, price: 55, currency: Currency.ILA,
                originalQty: 1000, originalPrice: 110, splitRatio: 2,
                splitAdjustedQty: 2000, splitAdjustedPrice: 55
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p1_ORL');
        expect(holding).toBeDefined();
        // 2,000 * 0.55 ILS = 1,100 ILS proceeds. Cost was 1,000 ILS. Net gain = 100 ILS.
        expect(holding?.realizedGainNet.amount).toBeCloseTo(100, 0.1);
    });
});
