"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const engine_1 = require("./engine");
const types_1 = require("../types");
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
const portfolio = {
    id: 'p1', name: 'Test', currency: types_1.Currency.USD,
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
(0, vitest_1.describe)('FinanceEngine', () => {
    (0, vitest_1.it)('calculates dividend fees based on history', () => {
        const engine = new engine_1.FinanceEngine([portfolio], mockRates, mockCPI);
        // Setup holding
        const buy = {
            date: '2022-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: types_1.Currency.USD, originalPriceUSD: 100
        };
        // Div in 2023 (10% fee)
        const div1 = { date: new Date('2023-06-01'), ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ, amount: 1, source: 'TEST' };
        // Div in 2024 (5% fee)
        const div2 = { date: new Date('2024-06-01'), ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ, amount: 1, source: 'TEST' };
        engine.processEvents([buy], [div1, div2]);
        const h = engine.holdings.get('p1_AAPL');
        (0, vitest_1.expect)(h).toBeDefined();
        // Div 1: 10 shares * $1 = $10. Fee 10% = $1.
        // Div 2: 10 shares * $1 = $10. Fee 5% = $0.5.
        // Total Fee: $1.5
        // Total Dividends (Net): (10 - 1 - 2.5) + (10 - 0.5 - 2.5) = 6.5 + 7.0 = 13.5
        const totalDivFees = h.dividends.reduce((acc, d) => acc + d.feeAmountPC, 0);
        (0, vitest_1.expect)(totalDivFees).toBeCloseTo(1.5);
        const totalDivsNet = h.dividendsTotal;
        (0, vitest_1.expect)(totalDivsNet).toBeCloseTo(13.5);
    });
    (0, vitest_1.it)('calculates real gain tax with inflation', () => {
        const ilPortfolio = { ...portfolio, id: 'p2', currency: types_1.Currency.ILS, taxPolicy: 'REAL_GAIN' };
        // Rates: USD=3.5 in 2023, USD=4.0 in 2024.
        const engine = new engine_1.FinanceEngine([ilPortfolio], mockRates, mockCPI);
        const buy = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p2', ticker: 'TA35', exchange: types_1.Exchange.TASE,
            qty: 10, price: 100, originalPrice: 100, originalQty: 10, currency: types_1.Currency.ILA, originalPriceILA: 100 // 100 Agorot = 1 ILS
        };
        // Cost Basis: 10 * 1 ILS = 10 ILS.
        // CPI at Jan 2023: 100.
        const sell = {
            date: '2024-01-01', type: 'SELL', portfolioId: 'p2', ticker: 'TA35', exchange: types_1.Exchange.TASE,
            qty: 10, price: 200, originalPrice: 200, originalQty: 10, currency: types_1.Currency.ILA, originalPriceILA: 200 // 200 Agorot = 2 ILS
        };
        // Proceeds: 10 * 2 ILS = 20 ILS.
        // Nominal Gain: 10 ILS.
        // CPI at Jan 2024: 110. Inflation = 10%.
        // Inflation Adj Cost: 10 * 1.1 = 11 ILS.
        // Real Gain: 20 - 11 = 9 ILS.
        // Tax (25%): 2.25 ILS.
        engine.processEvents([buy, sell], []);
        const h = engine.holdings.get('p2_TA35');
        (0, vitest_1.expect)(h).toBeDefined();
        (0, vitest_1.expect)(h.realizedGainNet).toBeCloseTo(10); // Nominal Net Gain (no fees) matches Nominal Gain here
        // Verify via Realized Lots
        (0, vitest_1.expect)(h.realizedLots.length).toBe(1);
        const lot = h.realizedLots[0];
        (0, vitest_1.expect)(lot.realizedTaxableGainILS).toBeCloseTo(9); // Real
        (0, vitest_1.expect)(lot.realizedTax).toBeCloseTo(2.25);
        (0, vitest_1.expect)(h.realizedTax).toBeCloseTo(2.25);
    });
    (0, vitest_1.it)('allocates buy fees on sell and reduces unallocated fees', () => {
        const engine = new engine_1.FinanceEngine([portfolio], mockRates, mockCPI);
        // Buy 1: 10 shares @ $100. Comm $10.
        const buy1 = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'FEE', exchange: types_1.Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: types_1.Currency.USD, commission: 10
        };
        // Buy 2: 10 shares @ $100. Comm $20.
        const buy2 = {
            date: '2023-01-02', type: 'BUY', portfolioId: 'p1', ticker: 'FEE', exchange: types_1.Exchange.NASDAQ,
            qty: 10, price: 100, originalQty: 10, originalPrice: 100, currency: types_1.Currency.USD, commission: 20
        };
        // Total Qty: 20. Total Fees Paid: $30.
        // Lots:
        // L1: 10 units, Fee $10. ($1/unit)
        // L2: 10 units, Fee $20. ($2/unit)
        // Sell 5 shares. FIFO -> Sold from L1.
        const sell = {
            date: '2023-01-03', type: 'SELL', portfolioId: 'p1', ticker: 'FEE', exchange: types_1.Exchange.NASDAQ,
            qty: 5, price: 150, originalQty: 5, originalPrice: 150, currency: types_1.Currency.USD, commission: 5
        };
        // Sell Comm: $5.
        // Allocated Buy Comm: 5 units from L1 * $1 = $5.
        // Net Gain = (5 * 150) - (5 * 100) - 5 (BuyFee) - 5 (SellFee) = 750 - 500 - 10 = 240.
        engine.processEvents([buy1, buy2, sell], []);
        const h = engine.holdings.get('p1_FEE');
        (0, vitest_1.expect)(h).toBeDefined();
        // Total Fees on Holding (Active + Realized) = $10 + $20 + $5 = $35.
        // Active Lots Fees:
        // L1 Remainder (5 units): $5.
        // L2 (10 units): $20.
        // Total Active Buy Fees: $25.
        // Realized Buy Fees: $5.
        // Realized Sell Fees: $5.
        const feesActive = h.activeLots.reduce((acc, l) => acc + l.feesBuy.amount, 0);
        (0, vitest_1.expect)(feesActive).toBe(25);
        const feesRealized = h.realizedFees; // Includes Buy Fees of realized lots + Sell Fees
        // Realized Fees = 5 (Buy) + 5 (Sell) = 10.
        (0, vitest_1.expect)(feesRealized).toBe(10);
        (0, vitest_1.expect)(h.feesTotal).toBe(35);
        // Check specifics on the realized lot
        (0, vitest_1.expect)(h.realizedLots.length).toBe(1);
        const l = h.realizedLots[0];
        (0, vitest_1.expect)(l.feesBuy.amount).toBe(5);
        (0, vitest_1.expect)(l.soldFees.amount).toBe(5);
        (0, vitest_1.expect)(l.realizedGainNet).toBe(240);
    });
    (0, vitest_1.it)('handles standard lifecycle: Buy, Dividend, Partial Sell', () => {
        const engine = new engine_1.FinanceEngine([portfolio], mockRates, mockCPI);
        const buy = {
            portfolioId: 'p1', date: '2023-01-01', type: 'BUY', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ,
            originalQty: 10, qty: 10, originalPrice: 150, price: 150, currency: types_1.Currency.USD, commission: 5
        };
        const sell = {
            portfolioId: 'p1', date: '2023-06-01', type: 'SELL', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ,
            originalQty: 5, qty: 5, originalPrice: 180, price: 180, currency: types_1.Currency.USD, commission: 5
        };
        const div = {
            ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ, date: new Date('2023-03-01'), amount: 0.23, source: 'TEST'
        };
        engine.processEvents([buy, sell], [div]);
        const h = engine.holdings.get('p1_AAPL');
        (0, vitest_1.expect)(h).toBeDefined();
        // 1. Check Active Lots
        // Bought 10, Sold 5. Remaining 5.
        (0, vitest_1.expect)(h.activeLots.length).toBe(1);
        (0, vitest_1.expect)(h.activeLots[0].qty).toBe(5);
        // 2. Check Realized Lots
        // Sold 5.
        (0, vitest_1.expect)(h.realizedLots.length).toBe(1);
        (0, vitest_1.expect)(h.realizedLots[0].qty).toBe(5);
        // 3. Check Dividend
        // 10 shares held at dividend date. 10 * 0.23 = 2.3.
        (0, vitest_1.expect)(h.dividends.length).toBe(1);
        (0, vitest_1.expect)(h.dividends[0].grossAmount.amount).toBeCloseTo(2.3);
        // 4. Check Realized Gain
        // Proceeds: 5 * 180 = 900.
        // Cost: 5 * 150 = 750.
        // Buy Fee (Allocated): (5/10) * 5 = 2.5.
        // Sell Fee: 5.
        // Net Gain = 900 - 750 - 2.5 - 5 = 142.5.
        (0, vitest_1.expect)(h.realizedGainNet).toBeCloseTo(142.5);
    });
});
