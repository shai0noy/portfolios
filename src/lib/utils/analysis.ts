/**
 * Utility functions for statistical analysis of financial time series.
 */

export interface AnalysisMetrics {
    alpha: number;
    beta: number;
    downsideBeta: number;
    rSquared: number;
    correlation: number;
}

export interface DataPoint {
    timestamp: number;
    value: number;
}

/**
 * Synchronizes two time series by matching dates (YYYY-MM-DD).
 * Only returns pairs where both series have data for the same day.
 * datasetX is usually the Independent variable (Benchmark).
 * datasetY is usually the Dependent variable (Portfolio).
 */
export function synchronizeSeries(datasetX: DataPoint[], datasetY: DataPoint[]): { x: number; y: number }[] {
    if (datasetX.length === 0 || datasetY.length === 0) return [];

    const mapY = new Map<string, number>();
    
    // Helper to get YYYY-MM-DD key
    const getDateKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    datasetY.forEach(p => mapY.set(getDateKey(p.timestamp), p.value));

    const pairs: { x: number; y: number }[] = [];
    
    datasetX.forEach(pX => {
        const key = getDateKey(pX.timestamp);
        if (mapY.has(key)) {
            pairs.push({ x: pX.value, y: mapY.get(key)! });
        }
    });

    return pairs;
}

export function computeSlope(pairs: { x: number; y: number }[]): number {
    const n = pairs.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const { x, y } of pairs) {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    const denom = n * sumX2 - sumX ** 2;
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/**
 * Computes statistical metrics using Ordinary Least Squares (OLS) regression.
 * X = Independent (Benchmark), Y = Dependent (Portfolio)
 */
export function computeAnalysisMetrics(pairs: { x: number; y: number }[]): AnalysisMetrics | null {
    const n = pairs.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    const downsidePairs = [];

    for (const p of pairs) {
        const { x, y } = p;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
        
        if (x < 0) downsidePairs.push(p);
    }

    const avgX = sumX / n;
    const avgY = sumY / n;

    // Correlation (r)
    const numerator = n * sumXY - sumX * sumY;
    const denomCorr = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    const correlation = denomCorr === 0 ? 0 : numerator / denomCorr;

    // Beta (Slope)
    const denomBeta = n * sumX2 - sumX ** 2;
    const beta = denomBeta === 0 ? 0 : (n * sumXY - sumX * sumY) / denomBeta;

    // Alpha (Intercept)
    const alpha = avgY - beta * avgX;

    // R-Squared (r^2)
    const rSquared = correlation ** 2;
    
    // Downside Beta
    const downsideBeta = computeSlope(downsidePairs);

    return { alpha, beta, rSquared, correlation, downsideBeta };
}

/**
 * Calculates percentage returns from price pairs.
 * Input: Synchronized price pairs [{ x: PriceX, y: PriceY }...]
 * Output: Return pairs [{ x: ReturnX, y: ReturnY }...]
 */
export function calculateReturns(pairs: { x: number; y: number }[]): { x: number; y: number }[] {
    const returns: { x: number; y: number }[] = [];
    for (let i = 1; i < pairs.length; i++) {
        const prev = pairs[i - 1];
        const curr = pairs[i];
        
        // Avoid division by zero
        if (prev.x === 0 || prev.y === 0) continue;

        const retX = (curr.x - prev.x) / prev.x;
        const retY = (curr.y - prev.y) / prev.y;
        
        returns.push({ x: retX, y: retY });
    }
    return returns;
}

/**
 * Normalizes a data series to start at 1.0 or 0.0 depending on preference.
 * This is useful if comparing growth curves directly.
 */
export function normalizeToStart(data: { date: Date, price: number }[]): DataPoint[] {
    if (data.length === 0) return [];
    const base = data[0].price || 1; // Avoid div by zero
    return data.map(p => ({
        timestamp: p.date.getTime(),
        value: p.price / base
    }));
}
