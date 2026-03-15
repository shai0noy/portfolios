import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction } from '../types';

describe('Holding Metrics (avgHoldingTimeYears, avgYearlyReturn)', () => {
    const portfolio: Portfolio = {
        id: 'p1', name: 'Test', currency: Currency.USD,
        cgt: 0, incTax: 0, commRate: 0, commMin: 0, commMax: 0,
        divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'TAX_FREE',
        mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
        feeHistory: []
    };

    const mockRates = { current: { USD: 1, ILS: 4 } };
    const mockCPI = { historical: [] };

    beforeEach(() => {
        // Set fixed date for tests: Jan 1, 2025
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calculates average holding time for active lots (current holding)', () => {
        const engine = new FinanceEngine([portfolio], mockRates, mockCPI as any);

        engine.processEvents([
            // Buy 100 shares 1 year ago (Jan 1, 2024)
            {
                id: '1', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
                type: 'BUY', date: '2024-01-01', qty: 100, price: 100, currency: Currency.USD
            } as unknown as Transaction,
            // Buy 100 shares 0.5 years ago (July 2, 2024 is approx 0.5 years)
            {
                id: '2', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
                type: 'BUY', date: '2024-07-02', qty: 100, price: 150, currency: Currency.USD
            } as unknown as Transaction
        ], []);

        engine.hydrateLivePrices(new Map([['NASDAQ:AAPL', { price: 200, currency: Currency.USD, type: { type: 'Equity' } } as any]]));
        
        const holding = engine.holdings.get('p1_AAPL');
        expect(holding).toBeDefined();

        // 100 shares held for 1 year, 100 shares held for ~0.5 years => avg approx 0.75 years
        expect(holding!.avgHoldingTimeYears).toBeCloseTo(0.75, 2);
    });

    it('calculates average holding time for realized lots (sold holding)', () => {
        const engine = new FinanceEngine([portfolio], mockRates, mockCPI as any);

        engine.processEvents([
            // Buy 100 shares exactly 2 years ago (Jan 1, 2023)
            {
                id: '1', portfolioId: 'p1', ticker: 'MSFT', exchange: Exchange.NASDAQ,
                type: 'BUY', date: '2023-01-01', qty: 100, price: 100, currency: Currency.USD
            } as unknown as Transaction,
            // Sell all shares exactly 1 year ago (Jan 1, 2024)
            {
                id: '2', portfolioId: 'p1', ticker: 'MSFT', exchange: Exchange.NASDAQ,
                type: 'SELL', date: '2024-01-01', qty: 100, price: 200, currency: Currency.USD
            } as unknown as Transaction
        ], []);
        
        engine.hydrateLivePrices(new Map([['NASDAQ:MSFT', { price: 100, currency: Currency.USD, perfAll: 1.0, type: { type: 'Equity' } } as any]]));

        const holding = engine.holdings.get('p1_MSFT');
        expect(holding).toBeDefined();

        // Length of hold was exactly 1 year before selling. (Since system time is 2025, but soldDate is 2024)
        expect(holding!.avgHoldingTimeYears).toBeCloseTo(1.0, 2);
        
        // Return is +100 / 100 = 100% (1.0). Held for 1 year => 100% / 1 = 1.0 (or +100%/y)
        expect(holding!.avgYearlyReturn).toBeCloseTo(1.0, 2);
    });

    it('calculates avg yearly return with mixed active/realized lots', () => {
        const engine = new FinanceEngine([portfolio], mockRates, mockCPI as any);

        engine.processEvents([
            // Lot A: Buy 100 shares for $100 -> Held 2 years
            {
                id: '1', portfolioId: 'p1', ticker: 'TSLA', exchange: Exchange.NASDAQ,
                type: 'BUY', date: '2023-01-01', qty: 100, price: 100, currency: Currency.USD
            } as unknown as Transaction,
            // Lot B: Buy 100 shares for $100 -> Held 1 year
            {
                id: '2', portfolioId: 'p1', ticker: 'TSLA', exchange: Exchange.NASDAQ,
                type: 'BUY', date: '2024-01-01', qty: 100, price: 100, currency: Currency.USD
            } as unknown as Transaction,
            // Sell Lot A
            {
                id: '3', portfolioId: 'p1', ticker: 'TSLA', exchange: Exchange.NASDAQ,
                type: 'SELL', date: '2025-01-01', qty: 100, price: 150, currency: Currency.USD
            } as unknown as Transaction
        ], []);

        engine.hydrateLivePrices(new Map([['NASDAQ:TSLA', { price: 150, currency: Currency.USD, perfAll: 0.5, type: { type: 'Equity' } } as any]]));
        
        const holding = engine.holdings.get('p1_TSLA');
        
        // Total Cost (invested) = $20,000  (100 shares * $100 + 100 shares * $100)
        // Total Gains: Realized ($5K) + Unrealized ($5K) = $10K
        // perfAll = 0.5 (50%)
        // YearlyReturn = 0.5 / 1.5 = 0.33333 

        expect(holding!.avgHoldingTimeYears).toBeCloseTo(1.5, 2);
        expect(holding!.avgYearlyReturn).toBeCloseTo(0.5 / 1.5, 3);
    });

    it('returns 0 for holding time if no lots', () => {
        const engine = new FinanceEngine([portfolio], mockRates, mockCPI as any);
        
        // Create an empty holding via a mock transaction that buys 0
        engine.processEvents([{
            id: '4', portfolioId: 'p1', ticker: 'EMPTY', exchange: Exchange.NASDAQ,
            type: 'BUY', date: '2025-01-01', qty: 0, price: 100, currency: Currency.USD
        } as unknown as Transaction], []);
        
        const holding = engine.holdings.get('p1_EMPTY');

        expect(holding?.avgHoldingTimeYears).toBe(0);
        expect(holding?.avgYearlyReturn).toBeUndefined();
    });
});
