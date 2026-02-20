
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction } from '../types';

const mockRates = {
    current: { USD: 1, ILS: 4 },
};

const mockCPI = {
    historical: []
};

const portfolio: Portfolio = {
    id: 'p1', name: 'Test', currency: Currency.USD,
    cgt: 0.25, incTax: 0,
    commRate: 0, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'IL_REAL_GAIN',
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    feeHistory: []
};

describe('FinanceEngine - Underlying Assets', () => {

    it('populates underlyingAssets from live price meta', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // Setup holding
        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'ETF1', exchange: Exchange.TASE,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: Currency.ILA
        };

        engine.processEvents([buy], []);

        // Mock live price map with underlying assets
        const priceMap = new Map();
        priceMap.set(`${Exchange.TASE}:ETF1`, {
            price: 110,
            currency: Currency.ILA,
            meta: {
                type: 'TASE',
                securityId: 123,
                underlyingAssets: [
                    { name: 'Stock A', weight: 40 },
                    { name: 'Stock B', weight: 60 }
                ]
            }
        });

        engine.hydrateLivePrices(priceMap);

        const h = engine.holdings.get('p1_ETF1');
        expect(h).toBeDefined();
        expect(h!.underlyingAssets).toBeDefined();
        expect(h!.underlyingAssets).toHaveLength(2);
        expect(h!.underlyingAssets![0]).toEqual({ name: 'Stock A', weight: 40 });
        expect(h!.underlyingAssets![1]).toEqual({ name: 'Stock B', weight: 60 });
    });

    it('populates assets for 5140918 even if ticker has leading zeros in mismatch', () => {
        // Scenario: Portfolio has '05140918', TASE data usually '5140918' (after normalization)
        // But loader maps it correctly. This test verifies engine handles what loader gives it.

        // 1. Setup Engine with "05140918"
        const p1: Portfolio = { ...portfolio, id: 'p1' };
        const engine = new FinanceEngine([p1], mockRates as any, mockCPI as any);

        // Buy transaction with leading zero
        const buy: Transaction = {
            ticker: '05140918',
            exchange: Exchange.TASE,
            date: '2024-01-01',
            qty: 100, price: 1, originalPrice: 1, originalQty: 100, currency: Currency.ILA,
            type: 'BUY', portfolioId: 'p1'
        };
        engine.processEvents([buy], []);

        // 2. Prepare PriceMap
        // Loader ensures key matches input ticker: 'TASE:05140918'
        const priceMap = new Map();
        priceMap.set(`${Exchange.TASE}:05140918`, {
            price: 100,
            currency: Currency.ILA,
            meta: {
                type: 'TASE',
                securityId: 5140918,
                underlyingAssets: [
                    { name: 'MAKAM', weight: 100 }
                ]
            }
        });

        // 3. Hydrate
        engine.hydrateLivePrices(priceMap);

        // 4. Verify
        const h = engine.holdings.get('p1_05140918');
        expect(h).toBeDefined();
        expect(h!.ticker).toBe('05140918');
        expect(h!.underlyingAssets).toBeDefined();
        expect(h!.underlyingAssets![0].name).toBe('MAKAM');
    });

    it('handles missing meta or underlyingAssets gracefully', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'ETF2', exchange: Exchange.TASE,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: Currency.ILA
        };

        engine.processEvents([buy], []);

        // Mock live price map WITHOUT underlying assets
        const priceMap = new Map();
        priceMap.set(`${Exchange.TASE}:ETF2`, {
            price: 110,
            currency: Currency.ILA,
            meta: {
                type: 'TASE',
                securityId: 124
            }
        });

        engine.hydrateLivePrices(priceMap);

        const h = engine.holdings.get('p1_ETF2');
        expect(h).toBeDefined();
        expect(h!.underlyingAssets).toBeUndefined();
    });
});
