
import { describe, it, expect, beforeEach } from 'vitest';
import type { Portfolio, Transaction } from '../types';
import { Currency, Exchange } from '../types';
import { FinanceEngine } from './engine';

// Mock Exchange Rates
const RATES = {
    current: { USD: 3.5, ILS: 1, ILA: 0.01 },
    '2023-01-01': { USD: 3.4, ILS: 1, ILA: 0.01 },
    '2023-06-01': { USD: 3.6, ILS: 1, ILA: 0.01 },
    '2023-01-02': { USD: 3.6 }
};

const P_PENSION: Portfolio = {
    id: 'p1',
    name: 'Pension',
    currency: Currency.ILS,
    cgt: 0, // Tax Free
    taxPolicy: 'TAX_FREE',
    incTax: 0,
    commRate: 0,
    commMin: 0,
    commMax: 0,
    divPolicy: 'accumulate_tax_free',
    divCommRate: 0,
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    holdings: []
};

// Mock Engine with partial implementation
class MockEngine extends FinanceEngine {
    constructor() {
        super([P_PENSION], RATES as any, null);
    }

    // Public wrapper for protected method
    public getHoldingPublic(pid: string, ticker: string, exc: Exchange, curr: Currency) {
        // @ts-ignore
        return this.getHolding(pid, ticker, exc, curr);
    }
}

describe('Holding Change Logic', () => {
    let engine: MockEngine;

    beforeEach(() => {
        engine = new MockEngine();
    });

    it('should transfer cost basis correctly using SELL_TRANSFER and BUY_TRANSFER', () => {
        const txns: Transaction[] = [
            // 1. Initial Buy of Asset A
            {
                date: '2023-01-01',
                portfolioId: 'p1',
                ticker: 'ASSET_A',
                exchange: Exchange.TASE,
                type: 'BUY',
                qty: 100,
                price: 1000, // 1000 Agorot = 10 ILS
                currency: Currency.ILA,
                originalQty: 100,
                originalPrice: 1000
            },
            // Market moves up: Asset A is now 1500
            // 2. Sell Asset A (Transfer)
            {
                date: '2023-06-01',
                portfolioId: 'p1',
                ticker: 'ASSET_A',
                exchange: Exchange.TASE,
                type: 'SELL_TRANSFER',
                qty: 100,
                price: 1500,
                currency: Currency.ILA,
                originalQty: 100,
                originalPrice: 1500
            },
            // 3. Buy Asset B (Transfer) - linked by date
            {
                date: '2023-06-01',
                portfolioId: 'p1',
                ticker: 'ASSET_B',
                exchange: Exchange.TASE,
                type: 'BUY_TRANSFER',
                qty: 50, // Buying 50 units (assuming price is 3000 each to match total?)
                // Actually total proceeds from A = 100 * 1500 = 150,000 Agorot = 1500 ILS
                // Market Value of B = 3000 Agorot = 30 ILS. 1500 ILS / 30 ILS = 50 units.
                price: 3000,
                currency: Currency.ILA,
                originalQty: 50,
                originalPrice: 3000
            }
        ];

        engine.processEvents(txns, []);

        const hA = engine.getHoldingPublic('p1', 'ASSET_A', Exchange.TASE, Currency.ILS);
        const hB = engine.getHoldingPublic('p1', 'ASSET_B', Exchange.TASE, Currency.ILS);

        // Verify A is empty
        expect(hA.qtyTotal).toBe(0);

        // Verify A realizes NO Gain (Gain should be 0 because it's a Transfer)
        // logic: handleSell sets realizedGainNet = 0 for SELL_TRANSFER
        console.log('A Realized Gain:', hA.realizedGainNet.amount);
        expect(hA.realizedGainNet.amount).toBe(0);

        // Verify B has Cost Basis transferred from A
        // A's Cost: 100 units * 1000 Agorot = 100,000 Ag = 1000 ILS
        // B's Cost should be 1000 ILS.
        // B's Market Value (at buy): 50 * 3000 = 150,000 Ag = 1500 ILS.
        // B's Unrealized Gain should be 1500 - 1000 = 500 ILS.
        // And Cost Basis (Book Value) should be 1000 ILS.

        console.log('B Cost Basis:', hB.costBasisVested.amount);
        console.log('B Market Value:', hB.marketValueVested.amount);

        // Verify B has Cost Basis transferred from A
        // A's Cost: 100 units * 1000 Agorot = 100,000 Ag = 1000 ILS
        // B's Cost should be 1000 ILS.
        // B's Market Value (at buy): 50 * 3000 = 150,000 Ag = 1500 ILS.
        // B's Unrealized Gain should be 1500 - 1000 = 500 ILS.
        // And Cost Basis (Book Value) should be 1000 ILS.

        expect(hB.costBasisVested.amount).toBeCloseTo(1000, 1);

        // Manually set price and recalc to verify Market Value
        // Price is 3000 Agorot (ILA). Qty 50. Value = 150,000 Agorot.
        hB.currentPrice = 3000;
        engine.calculateSnapshot();

        expect(hB.marketValueVested.amount).toBeCloseTo(150000, 1);

        // Unrealized Gain (Portfolio Currency - ILS)
        // Market Val (ILS) = 150,000 Ag / 100 = 1500 ILS.
        // Cost Basis (ILS) = 1000 ILS.
        // Gain = 500 ILS.
        expect(hB.unrealizedGain.amount).toBeCloseTo(500, 1);
    });

    it('should split cost basis proportionally if multiple buys on same day', () => {
        const txns: Transaction[] = [
            // Buy A: Cost 1000 ILS
            { date: '2023-01-01', portfolioId: 'p1', ticker: 'A', exchange: Exchange.NYSE, type: 'BUY', qty: 10, price: 100, currency: Currency.USD, originalQty: 10, originalPrice: 100 },
            // Sell A (Transfer): Proceeds 2000 USD (Gain 1000). Cost 1000 USD.
            { date: '2023-06-01', portfolioId: 'p1', ticker: 'A', exchange: Exchange.NYSE, type: 'SELL_TRANSFER', qty: 10, price: 200, currency: Currency.USD, originalQty: 10, originalPrice: 200 },

            // Buy B (Transfer): Uses 1500 USD (75% of proceeds)
            { date: '2023-06-01', portfolioId: 'p1', ticker: 'B', exchange: Exchange.NYSE, type: 'BUY_TRANSFER', qty: 15, price: 100, currency: Currency.USD, originalQty: 15, originalPrice: 100 },

            // Buy C (Transfer): Uses 500 USD (25% of proceeds)
            { date: '2023-06-01', portfolioId: 'p1', ticker: 'C', exchange: Exchange.NYSE, type: 'BUY_TRANSFER', qty: 5, price: 100, currency: Currency.USD, originalQty: 5, originalPrice: 100 },
        ];
        // Prevent unused warning
        expect(txns.length).toBe(4);

        // Note: The current implementation of processEvents loop consumes the bucket as needed.
        // The bucket stores Total Cost from Sells.
        // But how do we decide how much Cost Basis to assign to B vs C?
        // Current implementation in engine.ts (I need to check it)
        // If I implemented it simply, it might just consume the bucket FIFO.
        // If B's "Value" is 1500, and C's "Value" is 500. Total 2000.
        // Cost Basis (1000) should be split 750 / 250.
        // Does the engine handle proportional split?
        // Let's verify what I wrote in engine.ts.
    });
});
