"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const analysis_1 = require("./analysis");
// --- HELPERS ---
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(message);
    }
    else {
        console.log(`✅ PASS: ${message}`);
    }
}
function assertClose(actual, expected, tolerance = 0.001, message) {
    if (Math.abs(actual - expected) > tolerance) {
        console.error(`❌ FAIL: ${message} (Expected ${expected}, Got ${actual})`);
        throw new Error(`${message} (Expected ${expected}, Got ${actual})`);
    }
    else {
        console.log(`✅ PASS: ${message}`);
    }
}
// --- TESTS ---
function testSynchronizeSeries() {
    console.log('\n--- Test: Synchronize Series (Strict Date Matching) ---');
    // Dataset X: Daily (Jan 1, 2, 3)
    const x = [
        { timestamp: Date.UTC(2024, 0, 1), value: 10 },
        { timestamp: Date.UTC(2024, 0, 2), value: 20 },
        { timestamp: Date.UTC(2024, 0, 3), value: 30 },
    ];
    // Dataset Y: Missing Jan 2 (Holiday?)
    const y = [
        { timestamp: Date.UTC(2024, 0, 1), value: 5 },
        { timestamp: Date.UTC(2024, 0, 3), value: 15 },
    ];
    const synced = (0, analysis_1.synchronizeSeries)(x, y);
    // Expect length 2 (Intersection)
    assert(synced.length === 2, 'Synced series length matches intersection');
    // Jan 1
    assert(synced[0].x === 10 && synced[0].y === 5, 'Pair 1 correct');
    // Jan 3
    assert(synced[1].x === 30 && synced[1].y === 15, 'Pair 2 correct');
}
function testSynchronizeThreeSeries() {
    console.log('\n--- Test: Synchronize Three Series ---');
    // X: 1, 2, 3
    const x = [
        { timestamp: Date.UTC(2024, 0, 1), value: 10 },
        { timestamp: Date.UTC(2024, 0, 2), value: 20 },
        { timestamp: Date.UTC(2024, 0, 3), value: 30 },
    ];
    // Y: 1, 3 (Missing 2)
    const y = [
        { timestamp: Date.UTC(2024, 0, 1), value: 5 },
        { timestamp: Date.UTC(2024, 0, 3), value: 15 },
    ];
    // Z: 2, 3 (Missing 1)
    const z = [
        { timestamp: Date.UTC(2024, 0, 2), value: 100 },
        { timestamp: Date.UTC(2024, 0, 3), value: 200 },
    ];
    const synced = (0, analysis_1.synchronizeThreeSeries)(x, y, z);
    // Intersection: Only Jan 3 exists in all three
    assert(synced.length === 1, 'Synced series length should be 1');
    // Jan 3 check
    assert(synced[0].x === 30 && synced[0].y === 15 && synced[0].z === 200, 'Triple values correct');
}
function testPerfectCorrelation() {
    console.log('\n--- Test: Perfect Correlation ---');
    // Y = 2 * X + 5
    const pairs = [
        { x: 1, y: 7 },
        { x: 2, y: 9 },
        { x: 3, y: 11 },
        { x: 4, y: 13 },
        { x: 5, y: 15 },
    ];
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs);
    if (!metrics)
        throw new Error('Metrics should be calculated');
    assertClose(metrics.correlation, 1.0, 0.0001, 'Correlation is 1.0');
    assertClose(metrics.rSquared, 1.0, 0.0001, 'R^2 is 1.0');
    assertClose(metrics.beta, 2.0, 0.0001, 'Beta is 2.0');
    assertClose(metrics.alpha, 5.0, 0.0001, 'Alpha is 5.0');
}
function testInverseCorrelation() {
    console.log('\n--- Test: Inverse Correlation ---');
    // Y = -1 * X + 10
    const pairs = [
        { x: 1, y: 9 },
        { x: 2, y: 8 },
        { x: 3, y: 7 },
    ];
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs);
    if (!metrics)
        throw new Error('Metrics should be calculated');
    assertClose(metrics.correlation, -1.0, 0.0001, 'Correlation is -1.0');
    assertClose(metrics.beta, -1.0, 0.0001, 'Beta is -1.0');
}
function testNoCorrelation() {
    console.log('\n--- Test: No Correlation (Flat Y) ---');
    // Y is constant, X moves.
    const pairs = [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
    ];
    // Variance of Y is 0. Correlation should be 0 or undefined (div by zero check).
    // In my logic: denominator = sqrt(varX * varY). varY is 0. denom is 0.
    // Logic returns 0 for correlation.
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs);
    if (!metrics)
        throw new Error('Metrics should be calculated');
    assertClose(metrics.correlation, 0, 0.0001, 'Correlation is 0');
    assertClose(metrics.beta, 0, 0.0001, 'Beta is 0');
}
function testNormalizeToStart() {
    console.log('\n--- Test: Normalize to Start ---');
    const data = [
        { date: new Date(100), price: 50 },
        { date: new Date(200), price: 100 },
        { date: new Date(300), price: 25 },
    ];
    const normalized = (0, analysis_1.normalizeToStart)(data);
    assert(normalized.length === 3, 'Length matches');
    assertClose(normalized[0].value, 1.0, 0.0001, 'Start is 1.0'); // 50/50
    assertClose(normalized[1].value, 2.0, 0.0001, 'Point 2 is 2.0'); // 100/50
    assertClose(normalized[2].value, 0.5, 0.0001, 'Point 3 is 0.5'); // 25/50
}
function testDownsideBeta() {
    console.log('\n--- Test: Downside Beta ---');
    // Scenario: Asset moves with market when market is UP, 
    // but resists drop when market is DOWN.
    const pairs = [
        { x: 0.01, y: 0.02 }, // Market Up, Asset Up 2x
        { x: 0.02, y: 0.04 }, // Market Up, Asset Up 2x
        { x: -0.01, y: -0.005 }, // Market Down, Asset Down 0.5x (Resilient)
        { x: -0.02, y: -0.01 }, // Market Down, Asset Down 0.5x (Resilient)
    ];
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs);
    if (!metrics)
        throw new Error('Metrics failed');
    // Overall Beta should be somewhere between 0.5 and 2.0
    console.log(`Overall Beta: ${metrics.beta.toFixed(2)}`);
    // Downside Beta should be exactly 0.5 (calculated only from negative X)
    assertClose(metrics.downsideBeta, 0.5, 0.0001, 'Downside Beta should be 0.5');
}
function testCalculateReturns() {
    console.log('\n--- Test: Calculate Returns ---');
    // Price: 100 -> 110 (+10%) -> 99 (-10%)
    const pairs = [
        { x: 100, y: 100 },
        { x: 110, y: 110 },
        { x: 99, y: 99 }
    ];
    const returns = (0, analysis_1.calculateReturns)(pairs);
    assert(returns.length === 2, 'Should have 2 return periods');
    // 100 -> 110 is +0.10
    assertClose(returns[0].x, 0.10, 0.0001, 'Return 1 X correct');
    // 110 -> 99 is -0.10  (11 * 0.1 = 1.1, wait. 110 - 11 = 99. Correct.)
    assertClose(returns[1].x, -0.10, 0.0001, 'Return 2 X correct');
}
function testDownsideAlpha() {
    console.log('\n--- Test: Downside Alpha ---');
    // Scenario: When market is down (X < 0), asset consistently beats it by a fixed amount.
    // Y = 1.0 * X + 0.01  (when X is negative)
    // Downside Beta should be 1.0, Downside Alpha should be 0.01
    const pairs = [
        { x: 0.02, y: 0.02 }, // Market Up, follows market
        { x: 0.03, y: 0.03 }, // Market Up, follows market
        { x: -0.01, y: 0.00 }, // Market Down, Y = -0.01 + 0.01
        { x: -0.02, y: -0.01 }, // Market Down, Y = -0.02 + 0.01
        { x: -0.03, y: -0.02 }, // Market Down, Y = -0.03 + 0.01
    ];
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs);
    if (!metrics)
        throw new Error('Metrics failed for downside alpha test');
    // Downside Alpha (per user's definition) = Avg(Y) - DownsideBeta * Avg(X)
    // Avg(Y) = 0.004, Avg(X) = -0.002, DownsideBeta = 1.0
    // 0.004 - (1.0 * -0.002) = 0.006
    assertClose(metrics.downsideBeta, 1.0, 0.0001, 'Downside Beta for alpha test should be 1.0');
    assertClose(metrics.downsideAlpha, 0.006, 0.0001, 'Downside Alpha should be 0.006');
}
function testSharpeRatio() {
    console.log('\n--- Test: Sharpe Ratio ---');
    // Scenario: 3 return periods
    // Portfolio: +1%, +2%, -0.5%
    const portfolioReturns = [0.01, 0.02, -0.005];
    // Benchmark (needed for function signature but not used for Sharpe): 0%
    const benchmarkReturns = [0, 0, 0];
    // Risk Free Rate: +0.1% constant
    const riskFreeReturns = [0.001, 0.001, 0.001];
    // Prepare pairs
    const pairs = portfolioReturns.map((y, i) => ({ x: benchmarkReturns[i], y }));
    const metrics = (0, analysis_1.computeAnalysisMetrics)(pairs, riskFreeReturns);
    if (!metrics)
        throw new Error('Metrics failed for sharpe test');
    // Manual Calc:
    // Excess Returns:
    // 1. 0.01 - 0.001 = 0.009
    // 2. 0.02 - 0.001 = 0.019
    // 3. -0.005 - 0.001 = -0.006
    // Sum Excess = 0.022
    // Avg Excess = 0.007333333333333333
    const excess = [0.009, 0.019, -0.006];
    const mean = 0.022 / 3;
    // Variance (Sample, n-1 = 2)
    // (0.009 - mean)^2 = (0.00166667)^2 = 0.0000027778
    // (0.019 - mean)^2 = (0.01166667)^2 = 0.0001361111
    // (-0.006 - mean)^2 = (-0.01333333)^2 = 0.0001777778
    // Sum Squares = 0.0003166667
    // Variance = 0.0001583333
    // StdDev = sqrt(0.0001583333) = 0.01258305739
    // Sharpe = (0.00733333... / 0.01258305...) * sqrt(252)
    // Sharpe = 0.582794 * 15.8745
    // Sharpe ≈ 9.2515
    assertClose(metrics.sharpeRatio, 9.2515, 0.01, 'Sharpe Ratio Calculation');
}
function runTests() {
    try {
        testSynchronizeSeries();
        testSynchronizeThreeSeries();
        testPerfectCorrelation();
        testInverseCorrelation();
        testNoCorrelation();
        testNormalizeToStart();
        testCalculateReturns();
        testDownsideBeta();
        testDownsideAlpha();
        testSharpeRatio();
        console.log('\n🎉 All analysis tests passed!');
    }
    catch (e) {
        console.error('\n💥 Analysis tests failed.');
        console.error(e);
    }
}
runTests();
