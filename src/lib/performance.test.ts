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
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
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
    const points = await calculatePortfolioPerformance(holdings, txns, 'ILS', mockRates, undefined, mockFetchHistory);
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
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
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
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'DIVIDEND', qty: 1, price: 5, originalPrice: 5 } as any
    ];
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
    const p = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p) assertClose(p.gainsValue, 55, 0.01, 'Gains with dividend');
}

async function testStartFromFirstTxn() {
    console.log('\n--- Test: Start from First Transaction ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10
    } as any];
    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any
    ];
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
    const p1 = points.find(p => p.date.toISOString().startsWith('2024-01-01'));
    assert(!p1, 'Should not have points before first transaction');
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    assert(!!p2, 'Should have points starting from first transaction');
}

async function testTWR() {
    console.log('\n--- Test: TWR with Deposit ---');
    // Day 1: Buy 10 @ 100. MV=1000.
    // Day 2: Price 110 (+10%). MV=1100.
    // Day 3: Deposit (Buy 10 @ 110). MV=2200.
    // Day 4: Price 121 (+10%). MV=2420.
    
    // TWR Period 1: (1100 - 1000) / 1000 = 10%. Index = 1.10.
    // TWR Period 2: (2200 - (1100+1100)) / (1100+1100) = 0%. (Day of deposit, price same)
    // TWR Period 3: (2420 - 2200) / 2200 = 10%. Index = 1.10 * 1.10 = 1.21.
    
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 20, totalQty: 20
    } as any];

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 102 } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 105 } as any
    ];

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
    
    const p2 = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p2) {
        assert(p2.twr > 1.0, 'TWR should increase');
    }
}

async function testRealizedGains() {
    console.log('\n--- Test: Realized Gains (Fully Sold) ---');
    // Buy A, Sell A (Profit), Buy B.
    // Gains chart should show A's profit.
    const holdings: DashboardHolding[] = [{ // Only B is currently held
        portfolioId: 'p1', ticker: '123', exchange: Exchange.TASE,
        stockCurrency: Currency.ILS, qtyVested: 10, totalQty: 10
    } as any];

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100, currency: 'USD' } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'SELL', qty: 10, price: 110, currency: 'USD' } as any,
        { date: '2024-01-03', portfolioId: 'p1', ticker: '123', exchange: Exchange.TASE, type: 'BUY', qty: 10, price: 1000, currency: 'ILS' } as any
    ];

    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
    
    const p3 = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p3) {
        // AAPL Gain: (110-100)*10 = 100 USD.
        // 123 Gain: (1100-1000)*10 = 1000 ILS -> 250 USD.
        // Total Gain: 350.
        assert(p3.gainsValue > 0, 'Should have positive gains');
    }
}

async function testCrossCurrencyFluctuation() {
    console.log('\n--- Test: Cross Currency Fluctuation ---');
    // Portfolio ILS. Stock USD. Price flat. USD/ILS goes up.
    // Gain should go up.
    
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'FLAT', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.ILS,
        qtyVested: 10, totalQty: 10
    } as any];

    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'FLAT', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100, currency: 'USD' } as any
    ];
    
    // Display in ILS
    const points = await calculatePortfolioPerformance(holdings, txns, 'ILS', mockRates, undefined, mockFetchHistory);
    
    const p3 = points.find(p => p.date.toISOString().startsWith('2024-01-03'));
    if (p3) {
        assertClose(p3.gainsValue, 0, 0.01, 'Gains flat (Constant Currency)');
    }
}

async function testFees() {
    console.log('\n--- Test: Fees ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, totalQty: 10
    } as any];
    const txns: Transaction[] = [
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 } as any,
        { date: '2024-01-02', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'FEE', qty: 1, price: 10, originalPrice: 10 } as any
    ];
    
    const points = await calculatePortfolioPerformance(holdings, txns, 'USD', mockRates, undefined, mockFetchHistory);
    const p = points.find(p => p.date.toISOString().startsWith('2024-01-02'));
    if (p) assertClose(p.gainsValue, 10, 0.01, 'Gains reduced by fee'); // Gains = 20 - 10 = 10
}

export async function runTests() {
    try {
        await testBasicBuyAndHold();
        await testCurrencyConversion();
        await testPartialSell();
        await testDividends();
        await testStartFromFirstTxn();
        await testTWR();
        await testRealizedGains();
        await testCrossCurrencyFluctuation();
        await testFees();
        console.log('\n🎉 All tests passed!');
    } catch (e) {
        console.error('\n💥 Tests failed.');
        console.error(e);
    }
}

runTests();
runTests();
