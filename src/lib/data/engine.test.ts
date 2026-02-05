import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, Portfolio, Transaction } from '../types';
import { DividendEvent } from './model';

const mockRates = {
    current: { USD: 1, ILS: 4 },
    '2023-01-01': { USD: 1, ILS: 3.5 },
    '2024-01-01': { USD: 1, ILS: 4.0 }
};

const mockCPI = {
    historical: [
        { date: new Date('2024-01-01'), price: 110 },
        { date: new Date('2023-01-01'), price: 100 },
    ]
};

const portfolio: Portfolio = {
    id: 'p1', name: 'Test', currency: Currency.USD,
    cgt: 0.25, incTax: 0,
    commRate: 0, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'REAL_GAIN',
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    feeHistory: [
        { startDate: '2023-01-01', divCommRate: 0.1, commRate: 0, commMin: 0, commMax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly' }, 
        { startDate: '2024-01-01', divCommRate: 0.05, commRate: 0, commMin: 0, commMax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly' }
    ]
};

describe('FinanceEngine', () => {
    it('calculates dividend fees based on history', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        
        // Setup holding
        const buy: Transaction = {
            date: '2022-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: Currency.USD, originalPriceUSD: 100
        };
        
        // Div in 2023 (10% fee)
        const div1: DividendEvent = { date: '2023-06-01', ticker: 'AAPL', exchange: Exchange.NASDAQ, amount: 1, source: 'TEST' };
        
        // Div in 2024 (5% fee)
        const div2: DividendEvent = { date: '2024-06-01', ticker: 'AAPL', exchange: Exchange.NASDAQ, amount: 1, source: 'TEST' };

        engine.processEvents([buy], [div1, div2]);
        
        const h = engine.holdings.get('p1_AAPL');
        expect(h).toBeDefined();
        
        // Div 1: 10 shares * $1 = $10. Fee 10% = $1.
        // Div 2: 10 shares * $1 = $10. Fee 5% = $0.5.
        // Total Fee: $1.5
        expect(h!.totalFeesPortfolioCurrency).toBeCloseTo(1.5);
        expect(h!.dividendsUSD).toBe(20); 
    });

    it('calculates real gain tax with inflation', () => {
        const ilPortfolio: Portfolio = { ...portfolio, id: 'p2', currency: Currency.ILS, taxPolicy: 'REAL_GAIN' };
        // Rates: USD=3.5 in 2023, USD=4.0 in 2024.
        const engine = new FinanceEngine([ilPortfolio], mockRates as any, mockCPI as any);

        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p2', ticker: 'TA35', exchange: Exchange.TASE,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: Currency.ILA, originalPriceILA: 100 // 100 Agorot = 1 ILS
        };
        // Cost Basis: 10 * 1 ILS = 10 ILS.
        // CPI at Jan 2023: 100.

        const sell: Transaction = {
            date: '2024-01-01', type: 'SELL', portfolioId: 'p2', ticker: 'TA35', exchange: Exchange.TASE,
            qty: 10, price: 200, originalPrice: 200, originalQty: 10, currency: Currency.ILA, originalPriceILA: 200 // 200 Agorot = 2 ILS
        };
        // Proceeds: 10 * 2 ILS = 20 ILS.
        // Nominal Gain: 10 ILS.
        // CPI at Jan 2024: 110. Inflation = 10%.
        // Inflation Adj Cost: 10 * 1.1 = 11 ILS.
        // Real Gain: 20 - 11 = 9 ILS.
        // Tax (25%): 2.25 ILS.

        engine.processEvents([buy, sell], []);
        
        const h = engine.holdings.get('p2_TA35');
        expect(h).toBeDefined();
        expect(h!.realizedGainPortfolioCurrency).toBeCloseTo(10); // Nominal
        expect(h!.realizedTaxableGain).toBeCloseTo(9); // Real
        expect(h!.realizedTaxLiabilityILS).toBeCloseTo(2.25);
    });

    it('allocates buy fees on sell and reduces unallocated fees', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        
        // Buy 1: 10 shares @ $100. Comm $10.
        const buy1: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'FEE', exchange: Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: Currency.USD, commission: 10
        };
        
        // Buy 2: 10 shares @ $100. Comm $20.
        const buy2: Transaction = {
            date: '2023-01-02', type: 'BUY', portfolioId: 'p1', ticker: 'FEE', exchange: Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: Currency.USD, commission: 20
        };
        
        // Total Qty: 20. Total Fees Paid: $30. Unallocated: $30.
        // Avg Fee per share: $30 / 20 = $1.5.

        // Sell 5 shares.
        const sell: Transaction = {
            date: '2023-01-03', type: 'SELL', portfolioId: 'p1', ticker: 'FEE', exchange: Exchange.NASDAQ,
            qty: 5, price: 150, originalQty: 5, originalPrice: 150, currency: Currency.USD, commission: 5
        };
        // Sell Comm: $5.
        // Allocated Buy Comm: 5 * $1.5 = $7.5.
        // Total Transaction Cost: $5 (Sell) + $7.5 (Buy) = $12.5.
        // Gross Gain: 5 * (150 - 100) = $250.
        // Net Gain: 250 - 12.5 = $237.5.

        engine.processEvents([buy1, buy2, sell], []);
        
        const h = engine.holdings.get('p1_FEE');
        expect(h).toBeDefined();
        expect(h!.feesBuyPortfolioCurrency).toBe(30); // Total accumulated
        expect(h!.feesSellPortfolioCurrency).toBe(5);
        expect(h!.unallocatedBuyFeesPC).toBe(22.5); // 30 - 7.5
        
        const txn = engine.transactions.find(t => t.type === 'SELL');
        expect(txn).toBeDefined();
        expect(txn!.allocatedBuyFeePC).toBe(7.5);
        expect(txn!.netGainPC).toBe(237.5);
    });
});
