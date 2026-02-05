import { calculateDashboardSummary, type DashboardHoldingDisplay, type DashboardSummaryData } from './dashboard';
import { Currency, Exchange, type Portfolio, type ExchangeRates } from './types';
import { FinanceEngine } from './data/engine';
import { UnifiedHolding } from './data/model';

// --- MOCKS ---

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 }, // 1 USD = 4 ILS
    ago1m: { USD: 1, ILS: 4 }
};

const mockPortfolios = [
    {
        id: 'p1', name: 'US Portfolio', currency: Currency.USD,
        taxPolicy: 'REAL_GAIN', cgt: 0.25, incTax: 0.25,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as unknown as Portfolio,
    {
        id: 'p2', name: 'IL Portfolio', currency: Currency.ILS,
        taxPolicy: 'REAL_GAIN', cgt: 0.25, incTax: 0.25,
        commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
        holdings: []
    } as unknown as Portfolio
];

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

function createMockEngine(holdings: Partial<UnifiedHolding>[]) {
    const engine = new FinanceEngine(mockPortfolios, mockRates, null);
    holdings.forEach(h => {
        const fullHolding = {
            id: h.id || `${h.portfolioId}_${h.ticker}`,
            key: h.key || h.id || `${h.portfolioId}_${h.ticker}`,
            portfolioId: h.portfolioId || 'p1',
            ticker: h.ticker || 'MOCK',
            exchange: h.exchange || Exchange.NASDAQ,
            stockCurrency: h.stockCurrency || Currency.USD,
            portfolioCurrency: h.portfolioCurrency || Currency.USD,
            currentPrice: h.currentPrice || 0,
            dayChangePct: h.dayChangePct || 0,
            
            qtyVested: h.qtyVested ?? 0,
            qtyUnvested: h.qtyUnvested ?? 0,
            totalQty: (h.qtyVested ?? 0) + (h.qtyUnvested ?? 0),
            
            marketValueVested: h.marketValueVested ?? 0,
            marketValueUnvested: h.marketValueUnvested ?? 0,
            unrealizedGainVested: h.unrealizedGainVested ?? 0,
            
            costBasisPortfolioCurrency: h.costBasisPortfolioCurrency ?? 0,
            costBasisVestedPortfolioCurrency: h.costBasisVestedPortfolioCurrency ?? 0,
            costOfSoldPortfolioCurrency: h.costOfSoldPortfolioCurrency ?? 0,
            proceedsPortfolioCurrency: h.proceedsPortfolioCurrency ?? 0,
            realizedGainPortfolioCurrency: h.realizedGainPortfolioCurrency ?? 0,
            
            dividendsPortfolioCurrency: h.dividendsPortfolioCurrency ?? 0,
            totalFeesPortfolioCurrency: h.totalFeesPortfolioCurrency ?? 0,
            
            realizedTaxLiabilityILS: h.realizedTaxLiabilityILS ?? 0,
            unrealizedTaxLiabilityILS: h.unrealizedTaxLiabilityILS ?? 0,
            unrealizedTaxableGainILS: h.unrealizedTaxableGainILS ?? 0,
            
            costBasisILS: h.costBasisILS ?? 0,
            weightedAvgCPI: 100,
            
            transactions: [],
            dividends: [],
            recurringFees: [],
            // Defaults
            displayName: h.ticker || 'MOCK',
            sector: '',
            avgCost: 0,
            returnPct: 0,
            feesBuyPortfolioCurrency: 0,
            feesSellPortfolioCurrency: 0,
            feesDivPortfolioCurrency: 0,
            feesMgmtPortfolioCurrency: 0,
            unallocatedBuyFeesPC: 0,
            totalSharesAcquired: 0,
            realizedTaxableGain: 0,
            dividendsStockCurrency: 0,
            dividendsILS: 0,
            dividendsUSD: 0,
            costBasisStockCurrency: 0,
            costBasisUSD: 0,
        } as UnifiedHolding;
        
        engine.holdings.set(fullHolding.id, fullHolding);
    });
    return engine;
}

function testBasicSummary() {
    console.log('\n--- Test: Basic Summary Aggregation ---');
    const engine = createMockEngine([{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, qtyUnvested: 0,
        currentPrice: 100, 
        marketValueVested: 1000,
        unrealizedGainVested: 100,
        realizedGainPortfolioCurrency: 0,
        costBasisVestedPortfolioCurrency: 900,
        costBasisPortfolioCurrency: 900,
        costBasisILS: 3600,
        unrealizedTaxableGainILS: 400,
        realizedTaxLiabilityILS: 0,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0.01,
    }]);

    // Data array must match keys
    const data = [{ key: 'p1_AAPL' }];
    const { summary } = calculateDashboardSummary(data, 'USD', mockRates, null, engine);
    
    assertClose(summary.aum, 1000, 0.01, 'AUM should be 1000');
    assertClose(summary.totalUnrealized, 100, 0.01, 'Unrealized Gain should be 100');
    assertClose(summary.totalUnrealizedGainPct, 0.1111, 0.0001, 'Unrealized Gain % (100/900)');
    assertClose(summary.totalDayChange, 10, 0.01, 'Day Change (1% of 1000)');
}

function testUnvestedExclusion() {
    console.log('\n--- Test: Unvested Exclusion from AUM ---');
    const engine = createMockEngine([{
        portfolioId: 'p1', ticker: 'RSU', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 5, qtyUnvested: 5,
        currentPrice: 100,
        marketValueVested: 500,
        marketValueUnvested: 500,
        unrealizedGainVested: 0,
        costBasisVestedPortfolioCurrency: 500,
        costBasisPortfolioCurrency: 1000, // Total cost
        costBasisILS: 2000,
        unrealizedTaxableGainILS: 0,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
    }]);

    const data = [{ key: 'p1_RSU' }];
    const { summary, holdings: enriched } = calculateDashboardSummary(data, 'USD', mockRates, null, engine);

    assertClose(summary.aum, 500, 0.01, 'AUM should only include Vested (5 * 100)');
    assertClose(summary.totalUnvestedValue, 500, 0.01, 'Unvested Value should be tracked separately');
    assertClose(enriched[0].display.marketValue, 500, 0.01, 'Holding Display Market Value should be Vested');
    assertClose(enriched[0].display.unvestedValue, 500, 0.01, 'Holding Display Unvested Value');
}

function testCurrencyConversionSummary() {
    console.log('\n--- Test: Currency Conversion (ILS Display) ---');
    const engine = createMockEngine([{
        portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 10, qtyUnvested: 0,
        currentPrice: 100,
        marketValueVested: 1000, // USD
        unrealizedGainVested: 100,
        costBasisVestedPortfolioCurrency: 900,
        costBasisILS: 3600,
        unrealizedTaxableGainILS: 400,
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
    }]);

    const data = [{ key: 'p1_AAPL' }];
    const { summary } = calculateDashboardSummary(data, 'ILS', mockRates, null, engine);

    assertClose(summary.aum, 4000, 0.01, 'AUM in ILS (1000 * 4)');
    assertClose(summary.totalUnrealized, 400, 0.01, 'Unrealized in ILS (100 * 4)');
}

function testRealizedGainTax() {
    console.log('\n--- Test: Tax Calculation (Realized) ---');
    const engine = createMockEngine([{
        portfolioId: 'p1', ticker: 'SOLD', exchange: Exchange.NASDAQ,
        stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
        qtyVested: 0, qtyUnvested: 0,
        marketValueVested: 0,
        unrealizedGainVested: 0,
        realizedGainPortfolioCurrency: 100, // 100 USD Realized
        dividendsPortfolioCurrency: 0,
        costBasisILS: 0,
        realizedTaxableGain: 100,
        // Mocking the liability (Engine usually calculates this)
        realizedTaxLiabilityILS: 100, // 400 * 0.25 = 100
        totalFeesPortfolioCurrency: 0,
        dayChangePct: 0,
    }]);

    const data = [{ key: 'p1_SOLD' }];
    const { summary } = calculateDashboardSummary(data, 'USD', mockRates, null, engine);

    assertClose(summary.totalRealized, 100, 0.01, 'Total Realized (Gross)');
    assertClose(summary.realizedGainAfterTax, 75, 0.01, 'Realized After Tax (100 - 25)');
}

export function runDashboardTests() {
    try {
        testBasicSummary();
        testUnvestedExclusion();
        testCurrencyConversionSummary();
        testRealizedGainTax();
        console.log('\n🎉 All Dashboard tests passed!');
    } catch (e) {
        console.error('\n💥 Dashboard tests failed.');
        console.error(e);
    }
}

// Auto-run if executed directly (not recommended for module but kept for compat)
// runDashboardTests();
