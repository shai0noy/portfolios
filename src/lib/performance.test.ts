import { calculatePortfolioPerformance } from './performance';
import { Currency, Exchange, type DashboardHolding, type Transaction, type ExchangeRates } from './types';

// --- MOCKS ---

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 },
    ago1m: { USD: 1, ILS: 3.5 }
};

const mockHistory: Record<string, { date: Date, price: number }[]> = {
    'NASDAQ:AAPL': [
        { date: new Date('2024-01-01'), price: 100 },
        { date: new Date('2024-01-02'), price: 102 },
        { date: new Date('2024-01-03'), price: 105 },
        { date: new Date('2024-01-04'), price: 110 },
        { date: new Date('2024-01-05'), price: 108 },
    ],
    'TASE:123': [
        { date: new Date('2024-01-01'), price: 1000 },
        { date: new Date('2024-01-02'), price: 1000 },
        { date: new Date('2024-01-03'), price: 1100 },
        { date: new Date('2024-01-05'), price: 1200 },
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
        date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        type: 'BUY', qty: 10, price: 102, originalQty: 10, originalPrice: 102
    } as any];
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
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
    const points = await calculatePortfolioPerformance(holdings, txns, 'ILS', mockRates, undefined, undefined, mockFetchHistory);
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
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
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
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    const p = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p) assertClose(p.gainsValue, 55, 0.01, 'Gains with dividend');
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

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, mockFetchHistory);
    
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
    
    const fetchGap = async (t: string) => ({ historical: customHistory[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        { date: '2024-01-01', portfolioId: 'p1', ticker: 'GAP', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
        { date: '2024-01-01', portfolioId: 'p1', ticker: 'DENSE', exchange: Exchange.NASDAQ, type: 'BUY', qty: 1, price: 10 } as any
    ];

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchGap);
    
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
    const fetchCustom = async (t: string) => ({ historical: customHistory[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'DAY', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any, // Cost 1000
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'DAY', exchange: Exchange.NASDAQ, type: 'SELL', qty: 10, price: 110 } as any  // Proceeds 1100
    ];

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchCustom);
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
    const fetchCustom = async (t: string) => ({ historical: customHistory[`NASDAQ:${t}`], fromCache: true } as any);

    const txns: Transaction[] = [
        // Day 2: Deposit/Buy
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'ZERO', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any
    ];

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, undefined, fetchCustom);
    
    // Check Day 2 (Day of deposit)
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    if (p2) {
        // TWR should be 1.0 (No return on the day money arrived)
        assertClose(p2.twr, 1.0, 0.001, 'TWR should be 1.0 on funding day');
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
        console.log('\n🎉 All performance tests passed!');
    } catch (e) {
        console.error('\n💥 Performance tests failed.');
        console.error(e);
    }
}

runTests();
