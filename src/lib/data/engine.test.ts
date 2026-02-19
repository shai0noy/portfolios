import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction } from '../types';
import type { DividendEvent } from './model';

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
    taxPolicy: 'IL_REAL_GAIN',
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
        const div1: DividendEvent = { date: new Date('2023-06-01'), ticker: 'AAPL', exchange: Exchange.NASDAQ, amount: 1, source: 'TEST' };
        
        // Div in 2024 (5% fee)
        const div2: DividendEvent = { date: new Date('2024-06-01'), ticker: 'AAPL', exchange: Exchange.NASDAQ, amount: 1, source: 'TEST' };

        engine.processEvents([buy], [div1, div2]);
        
        const h = engine.holdings.get('p1_AAPL');
        expect(h).toBeDefined();
        
        // Div 1: 10 shares * $1 = $10. Fee 10% = $1.
        // Div 2: 10 shares * $1 = $10. Fee 5% = $0.5.
        // Total Fee: $1.5
        // Total Dividends (Net): (10 - 1 - 2.5) + (10 - 0.5 - 2.5) = 6.5 + 7.0 = 13.5

        const totalDivFees = h!.dividends.reduce((acc, d) => acc + d.feeAmountPC, 0);
        expect(totalDivFees).toBeCloseTo(1.5);

        const totalDivsNet = h!.dividendsTotal;
        expect(totalDivsNet.amount).toBeCloseTo(13.5);
    });

    it('calculates real gain tax with inflation', () => {
        const ilPortfolio: Portfolio = { ...portfolio, id: 'p2', currency: Currency.ILS, taxPolicy: 'IL_REAL_GAIN' };
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
        expect(h!.realizedGainNet.amount).toBeCloseTo(10); // Nominal Net Gain (no fees) matches Nominal Gain here

        // Verify via Realized Lots
        expect(h!.realizedLots.length).toBe(1);
        const lot = h!.realizedLots[0];

        expect(lot.realizedTaxableGainILS).toBeCloseTo(9); // Real
        expect(lot.realizedTax).toBeCloseTo(2.25);
        expect(h!.realizedCapitalGainsTax).toBeCloseTo(2.25);
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
        
        // Total Qty: 20. Total Fees Paid: $30.
        // Lots:
        // L1: 10 units, Fee $10. ($1/unit)
        // L2: 10 units, Fee $20. ($2/unit)

        // Sell 5 shares. FIFO -> Sold from L1.
        const sell: Transaction = {
            date: '2023-01-03', type: 'SELL', portfolioId: 'p1', ticker: 'FEE', exchange: Exchange.NASDAQ,
            qty: 5, price: 150, originalQty: 5, originalPrice: 150, currency: Currency.USD, commission: 5
        };
        // Sell Comm: $5.
        // Allocated Buy Comm: 5 units from L1 * $1 = $5.
        // Net Gain = (5 * 150) - (5 * 100) - 5 (BuyFee) - 5 (SellFee) = 750 - 500 - 10 = 240.

        engine.processEvents([buy1, buy2, sell], []);
        
        const h = engine.holdings.get('p1_FEE');
        expect(h).toBeDefined();

        // Total Fees on Holding (Active + Realized) = $10 + $20 + $5 = $35.
        // Active Lots Fees:
        // L1 Remainder (5 units): $5.
        // L2 (10 units): $20.
        // Total Active Buy Fees: $25.
        // Realized Buy Fees: $5.
        // Realized Sell Fees: $5.

        const feesActive = h!.activeLots.reduce((acc, l) => acc + l.feesBuy.amount, 0);
        expect(feesActive).toBe(25);

        const feesRealized = h!.realizedLots.reduce((acc, l) => acc + l.feesBuy.amount + (l.soldFees?.amount || 0), 0);
        // Realized Fees = 5 (Buy) + 5 (Sell) = 10.
        expect(feesRealized).toBe(10);

        expect(h!.feesTotal.amount).toBe(35);

        // Check specifics on the realized lot
        expect(h!.realizedLots.length).toBe(1);
        const l = h!.realizedLots[0];
        expect(l.feesBuy.amount).toBe(5);
        expect(l.soldFees!.amount).toBe(5);
        expect(l.realizedGainNet).toBe(240);
    });

    it('calculates correct realized gains when multiple sells consume a single buy lot', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        const p1 = portfolio; // Using the existing portfolio

        const tBuy: Transaction = {
            portfolioId: p1.id,
            ticker: 'SPLIT',
            date: '2023-01-01',
            type: 'BUY',
            qty: 100,
            price: 10, // Cost 1000
            originalQty: 100,
            originalPrice: 10,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        const tSell1: Transaction = {
            portfolioId: p1.id,
            ticker: 'SPLIT',
            date: '2023-06-01',
            type: 'SELL',
            qty: 40,
            price: 20, // 800 proceeds, Cost 400, Gain 400
            originalQty: 40,
            originalPrice: 20,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        const tSell2: Transaction = {
            portfolioId: p1.id,
            ticker: 'SPLIT',
            date: '2023-07-01',
            type: 'SELL',
            qty: 60,
            price: 25, // 1500 proceeds, Cost 600, Gain 900
            originalQty: 60,
            originalPrice: 25,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        engine.processEvents([tBuy, tSell1, tSell2], []);

        const h = engine.holdings.get(`${p1.id}_SPLIT`);
        expect(h).toBeDefined();
        expect(h!.realizedGainNet.amount).toBeCloseTo(400 + 900); // 1300
        expect(h!.qtyTotal).toBe(0);
    });

    it('full transfer out results in zero quantity and no ghost holding', () => {
        const p1: Portfolio = { ...portfolio, id: 'p1_ghost', name: 'Fixed Inc' };
        const p2: Portfolio = { ...portfolio, id: 'p2_ghost', name: 'Stocks' };
        const engine = new FinanceEngine([p1, p2], mockRates as any, mockCPI as any);

        // Buy 100 units in P1
        const t1: Transaction = {
            portfolioId: p1.id,
            ticker: 'GHOST',
            date: '2023-01-01',
            type: 'BUY',
            qty: 100,
            price: 10,
            originalQty: 100,
            originalPrice: 10,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        // Transfer all 100 units to P2
        const t2: Transaction = {
            portfolioId: p1.id,
            ticker: 'GHOST',
            date: '2023-02-01',
            type: 'SELL_TRANSFER',
            qty: 100,
            price: 15,
            originalQty: 100,
            originalPrice: 15,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        const t3: Transaction = {
            portfolioId: p2.id,
            ticker: 'GHOST',
            date: '2023-02-01',
            type: 'BUY_TRANSFER',
            qty: 100,
            price: 15,
            originalQty: 100,
            originalPrice: 15,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        // Manual rate injection for test
        // (engine as any).exchangeRates = {
        //      '2023-01-01': { 'ILS': 3.5 },
        //      '2023-02-01': { 'ILS': 3.6 }
        // }; // Not needed for this test as currency is USD

        engine.processEvents([t1, t2, t3], []);

        // Check P1 holding
        const h1 = engine.holdings.get(`${p1.id}_GHOST`);
        expect(h1).toBeDefined();
        expect(h1!.qtyTotal).toBe(0);
        expect(h1!.activeLots.length).toBe(0);

        // Assert Realized Gain is 0 for the transfer
        expect(h1!.realizedGainNet.amount).toBe(0);

        // The engine.getHoldingsForPortfolio method is not directly available in this test setup.
        // We can check the holdings map directly.
        const p1HoldingsKeys = Array.from(engine.holdings.keys()).filter(key => key.startsWith(p1.id));
        const ghostHoldingKey = p1HoldingsKeys.find(key => key.includes('GHOST'));

        expect(ghostHoldingKey).toBeDefined(); // Should still exist in the map, but with 0 qty
        const ghost = engine.holdings.get(ghostHoldingKey!);
        expect(ghost).toBeDefined();
        expect(ghost?.qtyTotal).toBe(0);
        expect(ghost?.realizedGainNet.amount).toBe(0);
    });

    it('handles same-day BUY and SELL_TRANSFER correctly (BUY before SELL)', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        const p1 = portfolio;

        const tBuy: Transaction = {
            portfolioId: p1.id,
            ticker: 'SAMEDAY',
            date: '2023-01-01',
            type: 'BUY',
            qty: 100,
            price: 10,
            originalQty: 100,
            originalPrice: 10,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        const tSellTransfer: Transaction = {
            portfolioId: p1.id,
            ticker: 'SAMEDAY',
            date: '2023-01-01',
            type: 'SELL_TRANSFER',
            qty: 100,
            price: 10,
            originalQty: 100,
            originalPrice: 10,
            currency: Currency.USD,
            exchange: Exchange.NASDAQ
        };

        engine.processEvents([tBuy, tSellTransfer], []);

        const h = engine.holdings.get(`${p1.id}_SAMEDAY`);
        expect(h).toBeDefined();
        // Should be 0 if SELL happens AFTER BUY
        expect(h!.qtyTotal).toBe(0);
    });

    it('handles standard lifecycle: Buy, Dividend, Partial Sell', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        const buy: Transaction = {
            portfolioId: 'p1', date: '2023-01-01', type: 'BUY', ticker: 'AAPL', exchange: Exchange.NASDAQ,
            originalQty: 10, qty: 10, originalPrice: 150, price: 150, currency: Currency.USD, commission: 5
        };

        const sell: Transaction = {
            portfolioId: 'p1', date: '2023-06-01', type: 'SELL', ticker: 'AAPL', exchange: Exchange.NASDAQ,
            originalQty: 5, qty: 5, originalPrice: 180, price: 180, currency: Currency.USD, commission: 5
        };

        const div: DividendEvent = {
            ticker: 'AAPL', exchange: Exchange.NASDAQ, date: new Date('2023-03-01'), amount: 0.23, source: 'TEST'
        };

        engine.processEvents([buy, sell], [div]);

        const h = engine.holdings.get('p1_AAPL');
        expect(h).toBeDefined();

        // 1. Check Active Lots
        // Bought 10, Sold 5. Remaining 5.
        expect(h!.activeLots.length).toBe(1);
        expect(h!.activeLots[0].qty).toBe(5);

        // 2. Check Realized Lots
        // Sold 5.
        expect(h!.realizedLots.length).toBe(1);
        expect(h!.realizedLots[0].qty).toBe(5);

        // 3. Check Dividend
        // 10 shares held at dividend date. 10 * 0.23 = 2.3.
        expect(h!.dividends.length).toBe(1);
        expect(h!.dividends[0].grossAmount.amount).toBeCloseTo(2.3);

        // 4. Check Realized Gain
        // Proceeds: 5 * 180 = 900.
        // Cost: 5 * 150 = 750.
        // Buy Fee (Allocated): (5/10) * 5 = 2.5.
        // Sell Fee: 5.
        // Net Gain = 900 - 750 - 2.5 - 5 = 142.5.
        expect(h!.realizedGainNet.amount).toBeCloseTo(142.5);
    });
    it('uses transaction price for orphan BUY_TRANSFER (no cost basis override)', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // Orphan Transfer: No matching SELL_TRANSFER to populate the bucket.
        // Price: 100. Qty: 10. Value: 1000.
        // If cost basis override logic was buggy (defaulting to 0), cost would be 0.
        // Fix should make it use 100 * 10 = 1000.
        const transferBuy: Transaction = {
            date: '2023-01-01', type: 'BUY_TRANSFER', portfolioId: 'p1', ticker: 'ORPHAN', exchange: Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: Currency.USD
        };

        engine.processEvents([transferBuy], []);

        const h = engine.holdings.get('p1_ORPHAN');
        expect(h).toBeDefined();

        // Check Cost Basis
        // Should be 1000 (10 * 100) NOT 0.
        expect(h!.costBasisVested.amount).toBe(1000);

        // Active Lot should also have correct cost
        expect(h!.activeLots.length).toBe(1);
        expect(h!.activeLots[0].costTotal.amount).toBe(1000);
    });
    it('preserves cost basis in SELL_TRANSFER -> BUY_TRANSFER chain', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // 1. Buy in P1: 10 @ 100. Cost 1000.
        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'TRANS', exchange: Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: Currency.USD
        };

        // 2. Sell Transfer from P1: 10 units.
        // Should put 1000 Cost Basis into bucket.
        const sellTransfer: Transaction = {
            date: '2023-02-01', type: 'SELL_TRANSFER', portfolioId: 'p1', ticker: 'TRANS', exchange: Exchange.NASDAQ,
            qty: 10, price: 150, originalQty: 10, originalPrice: 150, currency: Currency.USD
        };

        // 3. Buy Transfer to P1
        const buyTransfer: Transaction = {
            date: '2023-02-01', type: 'BUY_TRANSFER', portfolioId: 'p1', ticker: 'TRANS', exchange: Exchange.NASDAQ,
            qty: 10, price: 150, originalQty: 10, originalPrice: 150, currency: Currency.USD
        };

        engine.processEvents([buy, sellTransfer, buyTransfer], []);

        const h = engine.holdings.get('p1_TRANS');
        expect(h).toBeDefined();

        // Check that cost basis is preserved (1000) not reset to transfer price (1500)
        expect(h!.qtyVested).toBe(10);
        expect(h!.costBasisVested.amount).toBe(1000);
    });
});
