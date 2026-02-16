import { test } from 'vitest';
import { calculatePortfolioPerformance } from './performance';
import { Currency, Exchange, type DashboardHolding, type Transaction, type ExchangeRates } from './types';

// --- MOCKS ---

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 },
    ago1m: { USD: 1, ILS: 3.5 }
};

const mockHistory: Record<string, { date: Date, price: number }[]> = {
    'NASDAQ:DRIP': [
        { date: new Date('2024-01-02'), price: 100 },
        { date: new Date('2024-01-03'), price: 100 },
    ],
    'NASDAQ:AAPL': [
        { date: new Date('2024-01-01'), price: 100 },
        { date: new Date('2024-01-02'), price: 102 },
        { date: new Date('2024-01-03'), price: 105 },
        { date: new Date('2024-01-04'), price: 110 },
        { date: new Date('2024-01-05'), price: 115 },
    ]
};

const mockFetchHistory = async (ticker: string, exchange: Exchange, _signal?: AbortSignal) => {
    const key = `${exchange}:${ticker}`;
    const hist = mockHistory[key];
    if (!hist) return null;
    return {
        historical: hist,
        dividends: [],
        splits: [],
        fromCache: true,
        fromCacheMax: true
    } as any;
};

// --- HELPERS ---

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(message);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
    if (Math.abs(actual - expected) > tolerance) {
        console.error(`❌ FAIL: ${message} (Expected ${expected}, Got ${actual})`);
        throw new Error(`${message} (Expected ${expected}, Got ${actual})`);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

// --- TESTS ---

async function testBasicBuyAndHold() {
    console.log('\n--- Test: Basic Buy & Hold (USD Stock, USD Display) ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10,
    } as any];
    const txns: Transaction[] = [{
        date: new Date('2024-01-02T00:00:00Z') as any, portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        type: 'BUY', qty: 10, price: 102, originalQty: 10, originalPrice: 102
    } as any];
    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    // Debug logging
    // console.log('Points Dates:', points.map(p => p.date.toISOString()));

    const p1 = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    assert(!!p1, 'Point for buy date exists');
    if (p1) {
        assertClose(p1.holdingsValue, 1020, 0.01, 'MV at buy date');
        assertClose(p1.gainsValue, 0, 0.01, 'Gains at buy date');
    }
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p2) {
        assertClose(p2.holdingsValue, 1050, 0.01, 'MV next day');
        assertClose(p2.gainsValue, 30, 0.01, 'Gains next day');
    }
}

async function testCurrencyConversion() {
    console.log('\n--- Test: Currency Conversion (USD Stock, ILS Display) ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10
    } as any];
    const txns: Transaction[] = [{
        date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        type: 'BUY', qty: 10, price: 102, originalQty: 10, originalPrice: 102
    } as any];
    const { points } = await calculatePortfolioPerformance(holdings, txns, 'ILS', mockRates, undefined, undefined, mockFetchHistory);
    const p1 = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    if (p1) {
        assertClose(p1.holdingsValue, 4080, 0.01, 'MV in ILS');
        assertClose(p1.gainsValue, 0, 0.01, 'Gains in ILS');
    }
}

async function testPartialSell() {
    console.log('\n--- Test: Partial Sell ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 5, totalQty: 5
    } as any];
    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 102 } as any,
        { date: '2024-01-04', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'SELL', qty: 5, price: 110 } as any
    ];
    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    const pBefore = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (pBefore) assertClose(pBefore.gainsValue, 30, 0.01, 'Gains before sell');
    const pAfter = points.find(p => p.date.toISOString().startsWith('2024-01-04'));
    if (pAfter) {
        assertClose(pAfter.holdingsValue, 550, 0.01, 'MV after sell');
        assertClose(pAfter.gainsValue, 80, 0.01, 'Total gains after sell');
    }
}

async function testDividends() {
    console.log('\n--- Test: Dividends ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10
    } as any];
    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'DIVIDEND', qty: 0, price: 5, originalPrice: 5 }
    ];
    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    const p = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p) assertClose(p.gainsValue, 55, 0.01, 'Gains with dividend');
}

async function testDRIP() {
    console.log('\n--- Test: DRIP (Dividend Reinvestment) ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'DRIP', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10.5, totalQty: 10.5
    } as any];
    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'DRIP', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'DRIP', exchange: Exchange.NASDAQ, type: 'DIVIDEND', qty: 0.5, price: 50, originalPrice: 50 } as any
    ];
    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);

    // Day 1 (Jan 2): Buy 10 @ 100. Val=1000. Cost=1000.
    // Day 2 (Jan 3): Price 100.
    // Holdings: 10.5 shares @ 100 = 1050.
    // Cost Basis: 1000 (Initial) + 50 (Reinvested Div) = 1050.
    // Gains Value: (1050 - 1050) + 50 (Div Income) = 50.

    const p = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p) {
        assertClose(p.holdingsValue, 1050, 0.01, 'Holdings Value (inc DRIP)');
        assertClose(p.costBasis, 1050, 0.01, 'Cost Basis (inc DRIP)');
        assertClose(p.gainsValue, 50, 0.01, 'Total Gains (Div Income)');
    }
}

async function testTWR() {
    console.log('\n--- Test: TWR with Deposit (End of Day Flow) ---');
    // Day 1: Buy 10 @ 102. MV=1020. Flow +1020. Prev=0.
    // TWR Calc: Denom = 0. TWR = 1.0.
    // End Day 1: Prev=1020.
    
    // Day 2: Price 105. MV=1050. Flow +1050 (New Buy). Net Flow = +1050.
    // TWR Calc: Denom = 1020 (Start Cap).
    // Market Gain = (TotalMV(2100) - Flow(1050)) - Prev(1020) = 1050 - 1020 = 30.
    // Day Return = 30 / 1020 = 2.94%.
    
    // Day 2 Holdings: 10@105 (Old) + 10@105 (New). Total 20 @ 105 = 2100.
    
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 20, totalQty: 20
    } as any];

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 102 } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 105 } as any
    ];

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p2) {
        assert(p2.twr > 1.0, 'TWR should increase');
        assertClose(p2.twr, 1.0294, 0.0001, 'TWR Calculation correct');
    }
}

async function testMissingPriceData() {
    console.log('\n--- Test: Missing Price Data (Forward Fill) ---');
    
    // History has Jan 1 and Jan 5. Missing Jan 2, 3, 4.
    // We add a "Dense" ticker to ensure time steps exist for Jan 2,3,4.
    const holdings: DashboardHolding[] = [
        {
            portfolioId: 'p1', ticker: 'GAP', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, totalQty: 10
        } as any,
        {
            portfolioId: 'p1', ticker: 'DENSE', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, totalQty: 1
        } as any
    ];

    // Mock history
    const customHistory = {
        'NASDAQ:GAP': [
            { date: new Date('2024-01-01'), price: 100 },
            // ... gap ...
            { date: new Date('2024-01-05'), price: 110 },
        ],
        'NASDAQ:DENSE': [
            { date: new Date('2024-01-01'), price: 10 },
            { date: new Date('2024-01-02'), price: 10 },
            { date: new Date('2024-01-03'), price: 10 }, // Target date
            { date: new Date('2024-01-04'), price: 10 },
            { date: new Date('2024-01-05'), price: 10 },
        ]
    };
    
    const fetchGap = async (t: string) => ({ historical: (customHistory as any)[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        { date: '2024-01-01', portfolioId: 'p1', ticker: 'GAP', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
        { date: '2024-01-01', portfolioId: 'p1', ticker: 'DENSE', exchange: Exchange.NASDAQ, type: 'BUY', qty: 1, price: 10 } as any
    ];

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchGap);
    
    const pGap = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    
    assert(!!pGap, 'Should generate a point even if price is missing for GAP');
    if (pGap) {
        // GAP: 10 * 100 (Forward Fill) = 1000
        // DENSE: 1 * 10 = 10
        // Total: 1010
        assertClose(pGap.holdingsValue, 1010, 0.1, 'Should forward-fill last known price during gap');
    }
}

async function testIntradayWash() {
    console.log('\n--- Test: Intraday Wash (Day Trading) ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'DAY', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, totalQty: 0
    } as any];

    // Mock history
    const customHistory = {
        'NASDAQ:DAY': [
            { date: new Date('2024-01-02'), price: 105 } // Price doesn't matter for 0 qty
        ]
    };
    const fetchCustom = async (t: string) => ({ historical: (customHistory as any)[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'DAY', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any, // Cost 1000
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'DAY', exchange: Exchange.NASDAQ, type: 'SELL', qty: 10, price: 110 } as any  // Proceeds 1100
    ];

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchCustom);
    const p = points.find(p => p.date.toISOString().startsWith('2024-01-02'));

    if (p) {
        assertClose(p.holdingsValue, 0, 0.01, 'End of day holdings should be 0');
        // Realized gain of 100 should be visible
        assertClose(p.gainsValue, 100, 0.01, 'Realized gain should be captured');
    }
}

async function testZeroStartTWR() {
    console.log('\n--- Test: Zero Start TWR ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'ZERO', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, totalQty: 10
    } as any];

    const customHistory = {
        'NASDAQ:ZERO': [
            { date: new Date('2024-01-02'), price: 100 },
            { date: new Date('2024-01-03'), price: 110 }
        ]
    };
    const fetchCustom = async (t: string) => ({ historical: (customHistory as any)[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        // Day 2: Deposit/Buy
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'ZERO', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any
    ];

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchCustom);
    
    // Check Day 2 (Day of deposit)
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    if (p2) {
        // TWR should be 1.0 (No return on the day money arrived)
        assertClose(p2.twr, 1.0, 0.001, 'TWR should be 1.0 on funding day');
    }
}

async function testHistoricalCostBasis() {
    console.log('\n--- Test: Historical Cost Basis (originalPriceILA) ---');
    // Scenario: Buy USD stock when 1 USD = 3.5 ILS.
    // Display in ILS. Current Rate 1 USD = 4.0 ILS.
    // Cost should be 3.5 * Price. Value should be 4.0 * Price.

    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'HIST', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10
    } as any];

    const txns: Transaction[] = [{
        date: new Date('2024-01-02T00:00:00Z') as any, portfolioId: 'p1', ticker: 'HIST', exchange: Exchange.NASDAQ,
        type: 'BUY', qty: 10, price: 100,
        originalQty: 10, originalPrice: 100,
        currency: Currency.USD,
        // Historical Cost: 100 USD * 3.5 = 350 ILS (35000 Agorot)
        originalPriceILA: 35000
    } as any];

    // Mock rates: Current 1 USD = 4.0 ILS
    const rates: ExchangeRates = {
        current: { USD: 1, ILS: 4.0 },
        ago1m: { USD: 1, ILS: 3.5 }
    };

    // Mock History: Price 100 USD all the time
    const customHistory = {
        'NASDAQ:HIST': [
            { date: new Date('2024-01-02'), price: 100 },
            { date: new Date('2024-01-03'), price: 100 },
        ]
    };
    const fetchCustom = async (t: string) => ({ historical: (customHistory as any)[`NASDAQ:${t}`], fromCache: true } as any);

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'ILS', rates, undefined, undefined, fetchCustom);

    const p = points.find(p => p.date.toISOString().startsWith('2024-01-03'));

    if (p) {
        // Value: 10 * 100 * 4.0 = 4000 ILS.
        assertClose(p.holdingsValue, 4000, 0.01, 'Holdings Value (Current Rate)');

        // Cost Basis: Should use originalPriceILA -> 35000 agorot / 100 * 10 = 3500 ILS.
        // If it used Current Rate: 100 * 10 * 4.0 = 4000 ILS.
        assertClose(p.costBasis, 3500, 0.01, 'Cost Basis (Historical Rate)');

        // Gains: 4000 - 3500 = 500 ILS.
        assertClose(p.gainsValue, 500, 0.01, 'Gains = Value - Historical Cost');
    }
}

async function testFIFOCostBasis() {
    // Tests that SELL uses FIFO (First-In-First-Out) for Cost Basis, not Average Cost.
    // Buy 1 @ 10, Buy 1 @ 20. Sell 1.
    // FIFO: Sell the 10. Remaining Cost = 20.
    // AvgCost: Sell 1 @ 15. Remaining Cost = 15.

    const holdings: any[] = [];
    const txns: Transaction[] = [
        {
            date: new Date('2024-01-01T00:00:00Z') as any, portfolioId: 'p1', ticker: 'FIFO', exchange: Exchange.NASDAQ,
            type: 'BUY', qty: 1, price: 10, originalPrice: 10,
            currency: Currency.USD
        } as any,
        {
            date: new Date('2024-01-02T00:00:00Z') as any, portfolioId: 'p1', ticker: 'FIFO', exchange: Exchange.NASDAQ,
            type: 'BUY', qty: 1, price: 20, originalPrice: 20,
            currency: Currency.USD
        } as any,
        {
            date: new Date('2024-01-03T00:00:00Z') as any, portfolioId: 'p1', ticker: 'FIFO', exchange: Exchange.NASDAQ,
            type: 'SELL', qty: 1, price: 30, originalPrice: 30,
            currency: Currency.USD
        } as any
    ];

    const rates: ExchangeRates = { current: { USD: 1, ILS: 1 } } as any; // Simple 1:1

    // Mock History: Price 30 USD all the time for FIFO
    const customHistory = {
        'NASDAQ:FIFO': [
            { date: new Date('2024-01-01'), price: 10 },
            { date: new Date('2024-01-02'), price: 20 },
            { date: new Date('2024-01-03'), price: 30 },
        ]
    };
    const fetchCustom = async (t: string) => ({ historical: (customHistory as any)[`NASDAQ:${t}`], fromCache: true } as any);

    const { points } = await calculatePortfolioPerformance(holdings, txns, 'USD', rates, undefined, undefined, fetchCustom);

    // Check points after sell (Jan 3 or later)
    const pAfter = points.find(p => p.date.toISOString().startsWith('2024-01-03'));

    if (pAfter) {
        // Remaining Qty = 1.
        // FIFO Cost Basis = 20.
        // Avg Cost Basis would be 15.

        console.log(`[Test FIFO] Cost Basis: ${pAfter.costBasis}`);
        assertClose(pAfter.costBasis, 20, 0.01, 'FIFO Cost Basis (Should be 20)');

        // Gains Calculation check
        // Realized Gain from Sell: Proceeds 30 - Cost 10 = 20.
        // Unrealized Gain on Remaining: Value (30 * 1) - Cost 20 = 10. (Assuming price stays 30)
        // Total Gains = Realized (20) + Unrealized (10) = 30.
        // Holdings Value = 30.
        // Cost Basis = 20.
        // gainsValue = Holdings(30) - Cost(20) + Realized(20) = 30.

        assertClose(pAfter.gainsValue, 30, 0.01, 'Total Gains (Realized + Unrealized)');
    } else {
        throw new Error('No point found for Jan 3');
    }
}

export async function runTests() {
    try {
        await testBasicBuyAndHold();
        await testCurrencyConversion();
        await testPartialSell();
        await testDividends();
        await testTWR();
        await testMissingPriceData();
        await testIntradayWash();
        await testZeroStartTWR();
        await testHistoricalCostBasis();
        await testFIFOCostBasis(); // Added new test
        console.log('\n🎉 All performance tests passed!');
    } catch (e) {
        console.error('\n💥 Performance tests failed.');
        console.error(e);
        throw e;
    }
}

test('Performance Tests', async () => {
    await runTests();
});
