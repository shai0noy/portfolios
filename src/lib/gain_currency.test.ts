
import { describe, it, expect } from 'vitest';
import { Holding, Lot } from './data/model';
import { Currency, Exchange } from './types';
import { MultiCurrencyValue } from './data/multiCurrency';

describe('Gain Calculation with Currency Fluctuation', () => {
    // Current Rates: 1 USD = 4.0 ILS
    const currentRates = {
        current: { USD: 1, ILS: 4.0 },
        historical: {}
    };

    // Historical Rates (1 week ago): 1 USD = 3.5 ILS
    const historicalRates = {
        USD: 1, 
        ILS: 3.5
    };

    it('should account for currency fluctuation (FX Gain) when initial rates are provided', () => {
        // Portfolio in ILS
        const h = new Holding('p1', 'AAPL', Exchange.NASDAQ, Currency.USD, Currency.ILS);
        h.qtyVested = 1;
        
        // Lot bought long ago (so it's "Held" during the period)
        const lot: Lot = {
            id: 'l1', ticker: 'AAPL', date: new Date('2024-01-01'), qty: 1,
            costPerUnit: { amount: 50, currency: Currency.USD, rateToPortfolio: 3.0 },
            costTotal: { amount: 50, currency: Currency.USD, rateToPortfolio: 3.0 },
            feesBuy: { amount: 0, currency: Currency.USD, rateToPortfolio: 1 },
            cpiAtBuy: 100, isVested: true, originalTxnId: 't1'
        };
        (h as any)._lots = [lot];
        
        // Current Price: $100 (Unchanged from start of period for this test)
        h.currentPrice = 100;

        // History Provider: Price was $100 one week ago too
        const provider = (ticker: string) => ({
            historical: [
                { date: new Date('2026-02-01'), price: 100 },
                { date: new Date('2026-02-11'), price: 100 }
            ]
        });

        // 1. Without initialRates (Buggy / Current behavior)
        // It uses current rate (4.0) for both Initial and Final
        // Initial: 1 * 100 * 4.0 = 400 ILS
        // Final: 1 * 100 * 4.0 = 400 ILS
        // Gain: 0 ILS
        const resBuggy = h.generateGainForPeriod(new Date('2026-02-04'), provider, currentRates);
        expect(resBuggy.gain.valILS).toBe(0); 

        // 2. With initialRates (Correct behavior we want to implement)
        // It SHOULD use historical rate (3.5) for Initial
        // Initial: 1 * 100 * 3.5 = 350 ILS
        // Final: 1 * 100 * 4.0 = 400 ILS
        // Gain: 50 ILS
        
        // NOTE: Function signature not yet updated, so this part would fail compilation if I strictly checked types or ran it now with arguments.
        // For reproduction, I will just assert the buggy behavior first or mock the change?
        // Actually, I can pass the extra arg, JS will ignore it, and I assert 0.
        // Then I implement fix and assert 50.
        
        const resFixed = h.generateGainForPeriod(
            new Date('2026-02-04'), 
            provider, 
            currentRates, 
            historicalRates // This arg is ignored currently
        );
        
        // Currently expect 0 (since arg is ignored) - demonstrating the bug if we WANT FX gain.
        // After fix, this should be 50.
        // expect(resFixed.gain.valILS).toBe(50); 
    });
});
