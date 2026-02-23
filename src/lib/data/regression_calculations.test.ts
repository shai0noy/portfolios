import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { groupHoldingLayers } from './holding_utils';
import { Currency, Exchange, type ExchangeRates, type Transaction, type Portfolio } from '../types';

describe('Regression Tests: Financial Calculations', () => {
    // Setup Exchange Rates:
    // 2023-01-01: USD 1 = ILS 3.5
    // 2023-01-10: USD 1 = ILS 3.5 (Stable for Sell)
    // Current:    USD 1 = ILS 4.0 (Depreciated ILS)
    const mockRates: ExchangeRates = {
        current: { USD: 1, ILS: 4.0 }, 
        '2023-01-01': { USD: 1, ILS: 3.5 },
        '2023-01-10': { USD: 1, ILS: 3.5 }
    };

    const p1: Portfolio = {
        id: 'p1', name: 'ILS Portfolio', currency: Currency.ILS,
        taxPolicy: 'IL_REAL_GAIN', cgt: 0.25, incTax: 0.25,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as any;

    it('should calculate Nominal Gain correctly using historical rates (Prevent $7 vs $5 bug)', () => {
        // Scenario:
        // Buy 1 @ $100 (Rate 3.5) -> Cost = 350 ILS
        // Sell 1 @ $105 (Rate 3.5) -> Proceeds = 367.5 ILS
        // Nominal Gain (USD) = $5.
        // Nominal Gain (ILS) = 17.5 ILS.
        
        // If we used CURRENT rate (4.0) for proceeds:
        // Proceeds would be $105 * 4.0 = 420 ILS.
        // Cost would be 350 ILS.
        // Gain would be 70 ILS ($17.5 USD equivalent at 4.0).
        // This is WRONG. The gain was realized in the past.
        
        // More importantly for the "Nominal Gain" display in USD:
        // It should match $105 - $100 = $5.
        // If we derived it from current rates without storing historical vars:
        // (420 ILS - 350 ILS) / 4.0 = 17.5 USD. -> WRONG ($17.5 vs $5).

        const engine = new FinanceEngine([p1], mockRates, null);
        
        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p1', ticker: 'TEST', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 1, price: 100, currency: Currency.USD
            },
            {
                numericId: 2, portfolioId: 'p1', ticker: 'TEST', exchange: Exchange.NASDAQ,
                date: '2023-01-10', type: 'SELL', qty: 1, price: 105, currency: Currency.USD
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p1_TEST');
        expect(holding).toBeDefined();

        // Check Proceeds Total
        // Should have valUSD = 105
        expect(holding?.proceedsTotal.valUSD).toBe(105);
        
        // Check Cost of Sold Total
        // Should have valUSD = 100
        expect(holding?.costOfSoldTotal.valUSD).toBe(100);

        // Check Realized Gain Net (ILS)
        // 367.5 - 350 = 17.5 ILS
        expect(holding?.realizedGainNet.amount).toBeCloseTo(17.5, 0.01);
    });

    it('should track accurate cost basis in USD even when portfolio is ILS', () => {
        // Buy 1 @ $100 (Rate 3.5)
        // Cost Basis (ILS) = 350.
        // Cost Basis (USD) = 100.
        // Current Rate = 4.0.
        // If we convert 350 / 4.0 = 87.5 USD. -> WRONG.
        // We want to see 100 USD.

        const engine = new FinanceEngine([p1], mockRates, null);
        const txns: Transaction[] = [
            {
                numericId: 1, portfolioId: 'p1', ticker: 'TEST2', exchange: Exchange.NASDAQ,
                date: '2023-01-01', type: 'BUY', qty: 1, price: 100, currency: Currency.USD
            }
        ] as any;

        engine.processEvents(txns, []);
        const holding = engine.holdings.get('p1_TEST2');
        
        // activeLots[0].costTotal
        const lot = holding?.activeLots[0];
        expect(lot?.costTotal.valUSD).toBe(100);
        expect(lot?.costTotal.valILS).toBe(350);
        
        // costBasisVested
        expect(holding?.costBasisVested.valUSD).toBe(100);
    });
    it('should use historical cost basis in GroupHoldingLayers (UI)', () => {
        // Mock a layer that has a historical cost
        // Cost: 350 ILS.
        // valUSD: 100.
        // Current Rate: ILS 4.0 = USD 1.
        // If converted at current rate: 350 / 4 = 87.5 USD.
        // We expect: 100 USD.

        const mockLayer = {
            id: 'lot1',
            portfolioId: 'p1',
            originalTxnId: 'txn1',
            costTotal: { amount: 350, currency: Currency.ILS, valUSD: 100 },
            costPerUnit: { amount: 350, currency: Currency.ILS, valUSD: 100 }, 
            feesBuy: { amount: 0, currency: Currency.ILS },
            qty: 1,
            date: new Date('2023-01-01'),
            isVested: true,
            adjustedCost: 100
        };

        const result = groupHoldingLayers(
            [mockLayer], 
            [], 
            mockRates, 
            Currency.USD, 
            { p1: 'Portfolio 1' }, 
            {} as any, 
            Currency.USD
        );

        expect(result).toHaveLength(1);
        const group = result[0];
        
        // Check Original Cost 
        // Should be 100 (from valUSD), NOT 87.5
        expect(group.layers[0].originalCost).toBe(100);
        
        // Also check the stats summary
        expect(group.stats.cost).toBe(100);
    });
});

