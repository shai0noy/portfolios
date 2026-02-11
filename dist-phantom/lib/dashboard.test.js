"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dashboard_1 = require("./dashboard");
const types_1 = require("./types");
// --- MOCKS ---
const mockRates = {
    current: { USD: 1, ILS: 4, EUR: 0.9, GBP: 0.8 },
    ago1m: { USD: 1, ILS: 4 }
};
const mockPortfolios = new Map();
mockPortfolios.set('p1', {
    id: 'p1', name: 'US Portfolio', currency: types_1.Currency.USD,
    taxPolicy: 'REAL_GAIN', cgt: 0.25, incTax: 0.25,
    commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
    holdings: []
});
// --- HELPERS ---
function createMockEngine(holdingsData) {
    // Better: create a partial object that looks like FinanceEngine
    const engine = {
        holdings: new Map(),
        getGlobalSummary: () => ({ /* Mocked in test logic if needed */}),
    };
    // Mock getGlobalSummary to aggregate minimal data for dashboard summary
    engine.getGlobalSummary = (currency, keys) => {
        let aum = 0;
        let totalUnrealized = 0;
        let totalRealized = 0;
        let totalDayChange = 0;
        let totalCost = 0;
        let totalUnvestedValue = 0;
        let realizedGainAfterTax = 0;
        const rate = currency === 'ILS' ? 4 : 1; // Simple mock conversion
        engine.holdings.forEach(h => {
            if (!keys.has(h.id))
                return;
            // Simple sum (assuming USD source for simplicity in this mock)
            aum += h.marketValueVested.amount * rate;
            totalUnrealized += h.unrealizedGain.amount * rate;
            totalRealized += (h.realizedGainNet.amount + h.dividendsTotal.amount) * rate;
            totalUnvestedValue += h.marketValueUnvested.amount * rate;
            if (h.dayChangePct && h.marketValueVested.amount) {
                const changeVal = h.marketValueVested.amount * h.dayChangePct;
                totalDayChange += changeVal * rate;
            }
            // Tax handling for test
            let tax = 0;
            if (h.realizedTax) {
                tax = h.realizedTax * rate;
            }
            // realizedGainAfterTax = (Realized Gain + Divs) - Tax
            const gain = (h.realizedGainNet.amount + h.dividendsTotal.amount) * rate;
            realizedGainAfterTax += gain - tax;
        });
        return {
            aum,
            totalUnrealized,
            totalRealized,
            totalDayChange,
            totalUnvestedValue,
            realizedGainAfterTax,
            totalUnrealizedGainPct: totalCost > 0 ? totalUnrealized / totalCost : 0,
        };
    };
    holdingsData.forEach(h => {
        const fullHolding = {
            id: h.id || `${h.portfolioId}_${h.ticker}`,
            key: h.key || h.id || `${h.portfolioId}_${h.ticker}`,
            portfolioId: h.portfolioId || 'p1',
            ticker: h.ticker || 'MOCK',
            exchange: h.exchange || types_1.Exchange.NASDAQ,
            stockCurrency: h.stockCurrency || types_1.Currency.USD,
            portfolioCurrency: h.portfolioCurrency || types_1.Currency.USD,
            currentPrice: h.currentPrice || 0,
            dayChangePct: h.dayChangePct || 0,
            qtyVested: h.qtyVested ?? 0,
            qtyUnvested: h.qtyUnvested ?? 0,
            totalQty: (h.qtyVested ?? 0) + (h.qtyUnvested ?? 0),
            marketValueVested: h.marketValueVested || { amount: 0, currency: types_1.Currency.USD },
            marketValueUnvested: h.marketValueUnvested || { amount: 0, currency: types_1.Currency.USD },
            costBasisVested: h.costBasisVested || { amount: 0, currency: types_1.Currency.USD },
            unrealizedGain: h.unrealizedGain || { amount: 0, currency: types_1.Currency.USD },
            realizedGainNet: h.realizedGainNet || { amount: 0, currency: types_1.Currency.USD },
            proceedsTotal: h.proceedsTotal || { amount: 0, currency: types_1.Currency.USD },
            costOfSoldTotal: h.costOfSoldTotal || { amount: 0, currency: types_1.Currency.USD },
            dividendsTotal: h.dividendsTotal || { amount: 0, currency: types_1.Currency.USD },
            feesTotal: h.feesTotal || { amount: 0, currency: types_1.Currency.USD },
            realizedTaxLiabilityILS: h.realizedTaxLiabilityILS || 0,
            unrealizedTaxLiabilityILS: h.unrealizedTaxLiabilityILS || 0,
            unrealizedTaxableGainILS: h.unrealizedTaxableGainILS || 0,
            realizedTax: h.realizedTax || 0,
            addTransaction: () => { },
            addDividend: () => { },
        };
        engine.holdings.set(fullHolding.id, fullHolding);
    });
    return engine;
}
// --- TESTS ---
(0, vitest_1.describe)('Dashboard Summary Calculation', () => {
    (0, vitest_1.it)('should aggregate basic summary correctly', () => {
        const engine = createMockEngine([{
                portfolioId: 'p1', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 10, qtyUnvested: 0,
                currentPrice: 100,
                marketValueVested: { amount: 1000, currency: types_1.Currency.USD },
                unrealizedGain: { amount: 100, currency: types_1.Currency.USD },
                costBasisVested: { amount: 900, currency: types_1.Currency.USD },
                dayChangePct: 0.01,
            }]);
        const data = [{ key: 'p1_AAPL' }];
        const { summary } = (0, dashboard_1.calculateDashboardSummary)(data, 'USD', mockRates, mockPortfolios, engine);
        (0, vitest_1.expect)(summary.aum).toBeCloseTo(1000, 1);
        (0, vitest_1.expect)(summary.totalUnrealized).toBeCloseTo(100, 1);
        (0, vitest_1.expect)(summary.totalDayChange).toBeCloseTo(10, 1);
    });
    (0, vitest_1.it)('should exclude unvested from AUM', () => {
        const engine = createMockEngine([{
                portfolioId: 'p1', ticker: 'RSU', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 5, qtyUnvested: 5,
                currentPrice: 100,
                marketValueVested: { amount: 500, currency: types_1.Currency.USD },
                marketValueUnvested: { amount: 500, currency: types_1.Currency.USD },
                unrealizedGain: { amount: 0, currency: types_1.Currency.USD },
                costBasisVested: { amount: 500, currency: types_1.Currency.USD },
                dayChangePct: 0,
            }]);
        const data = [{ key: 'p1_RSU' }];
        const { summary, holdings: enriched } = (0, dashboard_1.calculateDashboardSummary)(data, 'USD', mockRates, mockPortfolios, engine);
        (0, vitest_1.expect)(summary.aum).toBeCloseTo(500, 1);
        (0, vitest_1.expect)(summary.totalUnvestedValue).toBeCloseTo(500, 1);
        (0, vitest_1.expect)(enriched[0].display.marketValue).toBeCloseTo(500, 1);
        // expect(enriched[0].display.unvestedValue).toBeCloseTo(500, 1); // unvestedValue might be undefined if not populated in Enriched?
        // Let's check dashboard.ts again. EnrichedDashboardHolding has display.unvestedValue.
        (0, vitest_1.expect)(enriched[0].display.unvestedValue).toBeCloseTo(500, 1);
    });
    (0, vitest_1.it)('should handle currency conversion for ILS display', () => {
        const engine = createMockEngine([{
                portfolioId: 'p1', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 10, qtyUnvested: 0,
                currentPrice: 100,
                marketValueVested: { amount: 1000, currency: types_1.Currency.USD },
                unrealizedGain: { amount: 100, currency: types_1.Currency.USD },
                costBasisVested: { amount: 900, currency: types_1.Currency.USD },
                dayChangePct: 0,
            }]);
        const data = [{ key: 'p1_AAPL' }];
        const { summary } = (0, dashboard_1.calculateDashboardSummary)(data, 'ILS', mockRates, mockPortfolios, engine);
        // 1000 USD * 4 = 4000 ILS
        (0, vitest_1.expect)(summary.aum).toBeCloseTo(4000, 1);
        // 100 USD * 4 = 400 ILS
        (0, vitest_1.expect)(summary.totalUnrealized).toBeCloseTo(400, 1);
    });
    (0, vitest_1.it)('should calculate realized gain tax correctly', () => {
        const engine = createMockEngine([{
                portfolioId: 'p1', ticker: 'SOLD', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 0, qtyUnvested: 0,
                marketValueVested: { amount: 0, currency: types_1.Currency.USD },
                unrealizedGain: { amount: 0, currency: types_1.Currency.USD },
                realizedGainNet: { amount: 100, currency: types_1.Currency.USD },
                dividendsTotal: { amount: 0, currency: types_1.Currency.USD },
                realizedTaxLiabilityILS: 100, // Not used in this mock simple logic
                realizedTax: 25, // 25 USD tax (assuming we set this explicitly for test)
                dayChangePct: 0,
            }]);
        const data = [{ key: 'p1_SOLD' }];
        const { summary } = (0, dashboard_1.calculateDashboardSummary)(data, 'USD', mockRates, mockPortfolios, engine);
        (0, vitest_1.expect)(summary.totalRealized).toBeCloseTo(100, 1);
        // Tax is 25 USD. So 100 - 25 = 75.
        (0, vitest_1.expect)(summary.realizedGainAfterTax).toBeCloseTo(75, 1);
    });
});
