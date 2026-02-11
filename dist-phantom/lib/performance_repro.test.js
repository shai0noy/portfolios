"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const performance_1 = require("./performance"); // Added calculatePortfolioPerformance
const vitest_1 = require("vitest");
const types_1 = require("./types"); // Added types
(0, vitest_1.describe)('calculatePeriodReturns - Reproduction', () => {
    const mkPoint = (dateStr, twr) => ({
        date: new Date(dateStr),
        twr,
        holdingsValue: 1000 * twr,
        gainsValue: 1000 * (twr - 1),
        costBasis: 1000
    });
    (0, vitest_1.it)('should correctly calculate All Time return when start month < current month', () => {
        // This test reproduces the bug where 'all' only sets the year but keeps the month/day
        const points = [
            mkPoint('2020-01-01', 1.0), // Start
            mkPoint('2020-06-01', 1.5), // Mid year 1 (+50%)
            mkPoint('2021-06-01', 1.5), // Current date (End)
        ];
        // Theoretical All Time Return:
        // Current TWR: 1.5
        // Start TWR (2020-01-01): 1.0
        // Result: 1.5 / 1.0 - 1 = 50%
        // Buggy Logic:
        // Current: 2021-06-01
        // 'all' sets year to 2020 -> 2020-06-01
        // getTwrAtDate(2020-06-01) -> 1.5
        // Result: 1.5 / 1.5 - 1 = 0% (WRONG)
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perfAll).toBeCloseTo(0.5, 4);
    });
    (0, vitest_1.it)('should calculate 1W return correctly with gap', () => {
        const points = [
            mkPoint('2023-01-01', 1.0),
            mkPoint('2023-01-05', 1.1), // 5 days ago
            mkPoint('2023-01-12', 1.2), // Now
        ];
        // 1W ago = Jan 5.
        // TWR at Jan 5 = 1.1.
        // Ret = 1.2/1.1 - 1 = 9.09%
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perf1w).toBeCloseTo(1.2 / 1.1 - 1, 4);
    });
    (0, vitest_1.it)('should calculate 1W return correctly when 1W ago falls before any data', () => {
        const points = [
            mkPoint('2023-01-10', 1.0), // First data point
            mkPoint('2023-01-12', 1.1), // Now (only 2 days later)
        ];
        // 1W ago = Jan 5.
        // TWR at Jan 5 = 1.0 (default).
        // Ret = 1.1 / 1.0 - 1 = 10%
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perf1w).toBeCloseTo(0.1, 4);
    });
    (0, vitest_1.it)('should verify Realized + Unrealized = Total Gain Value', async () => {
        // Mock data for Buy, Price Move, Sell
        const holdings = [{
                portfolioId: 'p1', ticker: 'TEST', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 5, totalQty: 5
            }];
        const txns = [
            { date: '2024-01-01T00:00:00.000Z', portfolioId: 'p1', ticker: 'TEST', exchange: types_1.Exchange.NASDAQ, type: 'BUY', qty: 10, price: 100 },
            { date: '2024-01-02T00:00:00.000Z', portfolioId: 'p1', ticker: 'TEST', exchange: types_1.Exchange.NASDAQ, type: 'SELL', qty: 5, price: 120 }
        ];
        // Mock History:
        // Jan 1: 100
        // Jan 2: 110
        // Jan 3: 120
        const mockHistory = {
            'NASDAQ:TEST': [
                { date: new Date('2024-01-01T00:00:00.000Z'), price: 100 },
                { date: new Date('2024-01-02T00:00:00.000Z'), price: 110 },
                { date: new Date('2024-01-03T00:00:00.000Z'), price: 120 },
            ]
        };
        const fetchFn = async (t) => ({ historical: mockHistory[`NASDAQ:${t}`], fromCache: true });
        const mockRates = { current: { USD: 1 }, ago1m: { USD: 1 } };
        const { points } = await (0, performance_1.calculatePortfolioPerformance)(holdings, txns, 'USD', mockRates, undefined, undefined, fetchFn);
        console.log('Generated Points:', points.map(p => ({ date: p.date.toISOString(), val: p.holdingsValue })));
        const lastPoint = points[points.length - 1];
        (0, vitest_1.expect)(lastPoint).toBeDefined();
        if (lastPoint) {
            // Jan 2: Price 110. Realized 100. Unrealized 50. Total 150.
            const p2 = points.find(p => p.date.getUTCDate() === 2);
            (0, vitest_1.expect)(p2).toBeDefined();
            if (p2) {
                (0, vitest_1.expect)(p2.gainsValue).toBeCloseTo(150, 0.01);
                (0, vitest_1.expect)(p2.holdingsValue).toBeCloseTo(550, 0.01);
            }
            // Jan 3: Price 120. Realized 100. Unrealized 100. Total 200.
            (0, vitest_1.expect)(lastPoint.gainsValue).toBeCloseTo(200, 0.01);
            (0, vitest_1.expect)(lastPoint.holdingsValue).toBeCloseTo(600, 0.01);
            (0, vitest_1.expect)(lastPoint.costBasis).toBeCloseTo(500, 0.01);
        }
    });
    (0, vitest_1.it)('should demonstrate TWR vs Dollar Gain discrepancy (High TWR, Low $ Gain)', () => {
        // Scenario:
        // Day 1: Start 100. Gain 100% -> 200. (Profit 100). TWR 2.0.
        // Day 2: Deposit 1,000,000. Total 1,000,200.
        // Day 3: Flat.
        // TWR = 2.0 (+100%).
        // Actual Gain = 100.
        // Derived Gain (Current AUM * TWR-implied) = 1,000,200 - (1,000,200 / 2) = 500,100.
        // Discrepancy: 500,100 vs 100.
        const points = [
            mkPoint('2023-01-01', 1.0),
            { date: new Date('2023-01-02'), twr: 2.0, holdingsValue: 200, gainsValue: 100, costBasis: 100 },
            { date: new Date('2023-01-03'), twr: 2.0, holdingsValue: 1000200, gainsValue: 100, costBasis: 1000100 }
        ];
        const returns = (0, performance_1.calculatePeriodReturns)(points);
        const aum = 1000200;
        // Emulate PerfStat logic
        const effectivePercentage = returns.perfAll; // 1.0 (100%)
        const previousAUM = aum / (1 + effectivePercentage);
        const derivedGain = aum - previousAUM;
        console.log('TWR Discrepancy Check:', {
            aum,
            twr: effectivePercentage,
            actualGain: 100,
            derivedGain
        });
        // With the fix, we should access returns.gainAll and it should be 100.
        // The previous 'derivedGain' based on TWR will still be high, demonstrating why we needed the fix.
        console.log('Gain All from Calculation:', returns.gainAll);
        (0, vitest_1.expect)(returns.gainAll).toBeCloseTo(100, 0.01);
        // And we can verify that the TWR-based derivation WOULD have been wrong:
        // expect(derivedGain).toBeGreaterThan(100); 
        (0, vitest_1.expect)(derivedGain).toBeCloseTo(500100, 1);
        (0, vitest_1.expect)(points[points.length - 1].gainsValue).toBe(100);
    });
    (0, vitest_1.it)('should capture Day 1 gains in TWR (Inception Return)', () => {
        // Day 1: Buy 100. Close 110 (+10%).
        // Day 2: Flat.
        // Expected TWR: 1.10 (10%).
        const points = [
            { date: new Date('2024-01-01T00:00:00'), twr: 1.1, holdingsValue: 110, gainsValue: 10, costBasis: 100 },
            // Note: In manual calculation test, we can just assert expected output if we feed this to calculatePeriodReturns 
            // BUT calculatePeriodReturns just reads TWR from points.
            // We need to test calculatePortfolioPerformance logic itself! 
            // This test file mocks calculatePeriodReturns inputs.
            // We need to call calculatePortfolioPerformance.
        ];
        // ...
    });
    (0, vitest_1.it)('should calculate TWR correctly for Day 1 using calculatePortfolioPerformance', async () => {
        const holdings = [{
                portfolioId: 'p1', ticker: 'TEST', exchange: types_1.Exchange.NASDAQ,
                stockCurrency: types_1.Currency.USD, portfolioCurrency: types_1.Currency.USD,
                qtyVested: 10, totalQty: 10
            }];
        const txns = [
            { date: '2024-01-01T00:00:00.000Z', portfolioId: 'p1', ticker: 'TEST', exchange: types_1.Exchange.NASDAQ, type: 'BUY', qty: 10, price: 10 }
        ];
        // History: Jan 1 Price 11 (Bought at 10). Gain 10%.
        const mockHistory = {
            'NASDAQ:TEST': [
                { date: new Date('2024-01-01T00:00:00.000Z'), price: 11 },
                { date: new Date('2024-01-02T00:00:00.000Z'), price: 11 },
            ]
        };
        const fetchFn = async (t) => ({ historical: mockHistory[`NASDAQ:${t}`], fromCache: true });
        const mockRates = { current: { USD: 1 }, ago1m: { USD: 1 } };
        const { points } = await (0, performance_1.calculatePortfolioPerformance)(holdings, txns, 'USD', mockRates, undefined, undefined, fetchFn);
        // Day 1: Bought 10 @ 10 = 100. Value 10 @ 11 = 110. Gain 10.
        // TWR should be 1.1?
        const p1 = points.find(p => p.date.getUTCDate() === 1);
        (0, vitest_1.expect)(p1).toBeDefined();
        if (p1) {
            (0, vitest_1.expect)(p1.twr).toBeCloseTo(1.1, 0.01);
        }
    });
});
