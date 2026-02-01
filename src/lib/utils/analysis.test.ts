import { synchronizeSeries, computeAnalysisMetrics, normalizeToStart, DataPoint } from './analysis';

// --- HELPERS ---

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(message);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function assertClose(actual: number, expected: number, tolerance = 0.001, message: string) {
    if (Math.abs(actual - expected) > tolerance) {
        console.error(`❌ FAIL: ${message} (Expected ${expected}, Got ${actual})`);
        throw new Error(`${message} (Expected ${expected}, Got ${actual})`);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

// --- TESTS ---

function testSynchronizeSeries() {
    console.log('\n--- Test: Synchronize Series (Strict Date Matching) ---');
    
    // Dataset X: Daily (Jan 1, 2, 3)
    const x: DataPoint[] = [
        { timestamp: Date.UTC(2024, 0, 1), value: 10 },
        { timestamp: Date.UTC(2024, 0, 2), value: 20 },
        { timestamp: Date.UTC(2024, 0, 3), value: 30 },
    ];

    // Dataset Y: Missing Jan 2 (Holiday?)
    const y: DataPoint[] = [
        { timestamp: Date.UTC(2024, 0, 1), value: 5 },
        { timestamp: Date.UTC(2024, 0, 3), value: 15 },
    ];

    const synced = synchronizeSeries(x, y);
    
    // Expect length 2 (Intersection)
    assert(synced.length === 2, 'Synced series length matches intersection');

    // Jan 1
    assert(synced[0].x === 10 && synced[0].y === 5, 'Pair 1 correct');

    // Jan 3
    assert(synced[1].x === 30 && synced[1].y === 15, 'Pair 2 correct');
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

    const metrics = computeAnalysisMetrics(pairs);
    if (!metrics) throw new Error('Metrics should be calculated');

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

    const metrics = computeAnalysisMetrics(pairs);
    if (!metrics) throw new Error('Metrics should be calculated');

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
    
    const metrics = computeAnalysisMetrics(pairs);
    if (!metrics) throw new Error('Metrics should be calculated');

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

    const normalized = normalizeToStart(data);
    
    assert(normalized.length === 3, 'Length matches');
    assertClose(normalized[0].value, 1.0, 0.0001, 'Start is 1.0'); // 50/50
    assertClose(normalized[1].value, 2.0, 0.0001, 'Point 2 is 2.0'); // 100/50
    assertClose(normalized[2].value, 0.5, 0.0001, 'Point 3 is 0.5'); // 25/50
}

export function runTests() {
    try {
        testSynchronizeSeries();
        testPerfectCorrelation();
        testInverseCorrelation();
        testNoCorrelation();
        testNormalizeToStart();
        console.log('\n🎉 All analysis tests passed!');
    } catch (e) {
        console.error('\n💥 Analysis tests failed.');
        console.error(e);
    }
}

runTests();