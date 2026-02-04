import { calculateDashboardSummary, type DashboardHoldingDisplay, type DashboardSummaryData } from './dashboard';
import { Currency, Exchange, type DashboardHolding, type Portfolio, type ExchangeRates } from './types';

// --- MOCKS ---

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 }, // 1 USD = 4 ILS
    ago1m: { USD: 1, ILS: 4 }
};

const mockPortfolios = new Map<string, Portfolio>();
mockPortfolios.set('p1', {
    id: 'p1', name: 'US Portfolio', currency: Currency.USD,
    taxPolicy: 'REAL_GAIN', cgt: 0.25, incTax: 0.25,
    commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
    holdings: []
});
mockPortfolios.set('p2', {
    id: 'p2', name: 'IL Portfolio', currency: Currency.ILS,
    taxPolicy: 'REAL_GAIN', cgt: 0.25, incTax: 0.25,
    commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
    holdings: []
});

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

function testBasicSummary() {
    console.log('
--- Test: Basic Summary Aggregation ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, qtyUnvested: 0, totalQty: 10,
        currentPrice: 100, avgCost: 90,
        marketValuePortfolioCurrency: 1000,
        unrealizedGainPortfolioCurrency: 100,
        realizedGainPortfolioCurrency: 0,
        dividendsPortfolioCurrency: 0,
        costBasisPortfolioCurrency: 900,
        // ... (other fields not strictly needed for this test if calculateDashboardSummary re-calculates)
        // Note: calculateDashboardSummary recalculates MOST display values from:
        // currentPrice, stockCurrency, qtyVested, etc.
        // It relies on holding fields like: currentPrice, stockCurrency, portfolioCurrency, costBasisILS, etc.
        // But importantly, it calls `calculateHoldingDisplayValues` internally.
        // So we just need to set up the raw fields correctly.
        costBasisILS: 3600, // 900 USD * 4
        unrealizedTaxableGainILS: 400, // 100 USD * 4
        realizedGainILS: 0,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0.01,
        // Mocking display values that useDashboardData would have set:
        mvVested: 1000, mvUnvested: 0,
    } as any];

    const { summary } = calculateDashboardSummary(holdings, 'USD', mockRates, mockPortfolios);
    
    assertClose(summary.aum, 1000, 0.01, 'AUM should be 1000');
    assertClose(summary.totalUnrealized, 100, 0.01, 'Unrealized Gain should be 100');
    assertClose(summary.totalUnrealizedGainPct, 0.1111, 0.0001, 'Unrealized Gain % (100/900)');
    assertClose(summary.totalDayChange, 10, 0.01, 'Day Change (1% of 1000)');
}

function testUnvestedExclusion() {
    console.log('
--- Test: Unvested Exclusion from AUM ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'RSU', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 5, qtyUnvested: 5, totalQty: 10, // 50% vested
        currentPrice: 100, avgCost: 50,
        // Calculations in useDashboardData would set these:
        mvVested: 500, mvUnvested: 500,
        costBasisPortfolioCurrency: 500, // 50 * 10 = 500 total? No avgCost is per share.
        // useDashboardData loop:
        // h.mvVested = h.qtyVested * price
        // h.marketValuePortfolioCurrency = h.mvVested (OVERRIDE)
        // So input holding to calculateDashboardSummary should already have these set if it comes from useDashboardData.
        // But calculateDashboardSummary calls `calculateHoldingDisplayValues(h, ...)` which uses `h.marketValuePortfolioCurrency`.
        // So we must ensure input `marketValuePortfolioCurrency` reflects VESTED only.
        marketValuePortfolioCurrency: 500, // Vested Only
        costBasisILS: 2000, // 500 USD * 4
        unrealizedTaxableGainILS: 0,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
    } as any];

    const { summary, holdings: enriched } = calculateDashboardSummary(holdings, 'USD', mockRates, mockPortfolios);

    assertClose(summary.aum, 500, 0.01, 'AUM should only include Vested (5 * 100)');
    assertClose(summary.totalUnvestedValue, 500, 0.01, 'Unvested Value should be tracked separately');
    assertClose(enriched[0].display.marketValue, 500, 0.01, 'Holding Display Market Value should be Vested');
    assertClose(enriched[0].display.unvestedValue, 500, 0.01, 'Holding Display Unvested Value');
}

function testCurrencyConversionSummary() {
    console.log('
--- Test: Currency Conversion (ILS Display) ---');
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, qtyUnvested: 0, totalQty: 10,
        currentPrice: 100, avgCost: 90,
        marketValuePortfolioCurrency: 1000, // USD
        unrealizedGainPortfolioCurrency: 100,
        costBasisILS: 3600,
        unrealizedTaxableGainILS: 400,
        realizedGainILS: 0,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
        mvVested: 1000, mvUnvested: 0
    } as any];

    // Display in ILS (Rate 4)
    const { summary } = calculateDashboardSummary(holdings, 'ILS', mockRates, mockPortfolios);

    assertClose(summary.aum, 4000, 0.01, 'AUM in ILS (1000 * 4)');
    assertClose(summary.totalUnrealized, 400, 0.01, 'Unrealized in ILS (100 * 4)');
}

function testRealizedGainTax() {
    console.log('
--- Test: Tax Calculation (Realized) ---');
    // Portfolio p1 has 25% tax.
    // Holding has realized gain of 100 USD.
    // Taxable Gain ILS = 400.
    // Tax Liability ILS = 400 * 0.25 = 100 ILS.
    // Tax Liability USD = 100 / 4 = 25 USD.
    // Net Realized USD = 100 - 25 = 75.
    
    const holdings: DashboardHolding[] = [{
        portfolioId: 'p1', ticker: 'SOLD', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 0, totalQty: 0,
        currentPrice: 100, avgCost: 0,
        marketValuePortfolioCurrency: 0,
        unrealizedGainPortfolioCurrency: 0,
        realizedGainPortfolioCurrency: 100, // 100 USD Realized
        dividendsPortfolioCurrency: 0,
        costBasisILS: 0,
        realizedTaxableGainILS: 400, // 100 USD * 4
        unrealizedTaxableGainILS: 0,
        realizedGainILS: 400,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
        mvVested: 0, mvUnvested: 0
    } as any];

    const { summary } = calculateDashboardSummary(holdings, 'USD', mockRates, mockPortfolios);

    assertClose(summary.totalRealized, 100, 0.01, 'Total Realized (Gross)');
    assertClose(summary.realizedGainAfterTax, 75, 0.01, 'Realized After Tax (100 - 25)');
}

export function runDashboardTests() {
    try {
        testBasicSummary();
        testUnvestedExclusion();
        testCurrencyConversionSummary();
        testRealizedGainTax();
        console.log('
🎉 All Dashboard tests passed!');
    } catch (e) {
        console.error('
💥 Dashboard tests failed.');
        console.error(e);
    }
}

runDashboardTests();
