/**
 * Utility functions for statistical analysis of financial time series.
 */

export interface AnalysisMetrics {
    alpha: number; // Jensen's Alpha
    beta: number;
    downsideBeta: number; // Beta calculated only on downside periods
    downsideAlpha: number; // Jensen's Alpha using downsideBeta
    sharpeRatio: number; // Annualized Sharpe Ratio
    rSquared: number;
    correlation: number; // Pearson correlation coefficient
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
export function synchronizeSeries(datasetX: DataPoint[], datasetY: DataPoint[]): { x: number; y: number; timestamp: number }[] {
    if (datasetX.length === 0 || datasetY.length === 0) return [];

    const mapY = new Map<string, number>();

    // Helper to get YYYY-MM-DD key using UTC to avoid timezone shifts
    const getDateKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    };

    datasetY.forEach(p => mapY.set(getDateKey(p.timestamp), p.value));

    const pairs: { x: number; y: number; timestamp: number }[] = [];
    
    datasetX.forEach(pX => {
        const key = getDateKey(pX.timestamp);
        if (mapY.has(key)) {
            pairs.push({ x: pX.value, y: mapY.get(key)!, timestamp: pX.timestamp });
        }
    });

    return pairs;
}

/**
 * Synchronizes three time series by matching dates.
 */
export function synchronizeThreeSeries(datasetX: DataPoint[], datasetY: DataPoint[], datasetZ: DataPoint[]): { x: number; y: number; z: number; timestamp: number }[] {
    if (datasetX.length === 0 || datasetY.length === 0 || datasetZ.length === 0) return [];

    const mapY = new Map<string, number>();
    const mapZ = new Map<string, number>();
    
    const getDateKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    };

    datasetY.forEach(p => mapY.set(getDateKey(p.timestamp), p.value));
    datasetZ.forEach(p => mapZ.set(getDateKey(p.timestamp), p.value));

    const triples: { x: number; y: number; z: number; timestamp: number }[] = [];
    
    datasetX.forEach(pX => {
        const key = getDateKey(pX.timestamp);
        if (mapY.has(key) && mapZ.has(key)) {
            triples.push({ x: pX.value, y: mapY.get(key)!, z: mapZ.get(key)!, timestamp: pX.timestamp });
        }
    });

    return triples;
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
 * X = Independent (Benchmark), Y = Dependent (Portfolio).
 * Optional riskFree returns (same length) to calculate Excess Returns for Alpha.
 * IMPORTANT: Input pairs must be RETURNS (percentage changes), not PRICES.
 */
export function computeAnalysisMetrics(pairs: { x: number; y: number }[], riskFreeReturns?: number[]): AnalysisMetrics | null {
    const n = pairs.length;
    if (n < 2) return null;
    if (riskFreeReturns && riskFreeReturns.length !== n) {
        console.warn("Risk-free returns length mismatch");
        riskFreeReturns = undefined;
    }

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    let sumExcessX = 0, sumExcessY = 0, sumExcessXY = 0, sumExcessX2 = 0;
    let sumExcessY2 = 0;

    const downsidePairs: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
        const { x, y } = pairs[i];
        const rf = riskFreeReturns ? riskFreeReturns[i] : 0;
        
        const exX = x - rf;
        const exY = y - rf;

        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
        
        sumExcessX += exX;
        sumExcessY += exY;
        sumExcessXY += exX * exY;
        sumExcessX2 += exX * exX;
        sumExcessY2 += exY * exY;

        // Downside is defined as Benchmark (X) Returns < 0
        if (x < 0) downsidePairs.push(pairs[i]);
    }

    const avgExcessX = sumExcessX / n;
    const avgExcessY = sumExcessY / n;

    // Sharpe Ratio (Annualized)
    // StdDev of Excess Returns (Sample Standard Deviation)
    const varianceExcessY = (sumExcessY2 - n * avgExcessY * avgExcessY) / (n - 1);
    const stdDevExcessY = Math.sqrt(varianceExcessY);
    const sharpeRatio = stdDevExcessY === 0 ? 0 : (avgExcessY / stdDevExcessY) * Math.sqrt(252);

    // Correlation (r) - based on raw returns (standard convention)
    const numerator = n * sumXY - sumX * sumY;
    const termX = n * sumX2 - sumX ** 2;
    const termY = n * sumY2 - sumY ** 2;

    const denomCorr = Math.sqrt(termX * termY);
    const correlation = denomCorr === 0 ? 0 : numerator / denomCorr;

    // Beta (Slope) - CAPM Beta is strictly: Cov(Rp, Rm) / Var(Rm)
    // Using raw returns for Beta is standard, but Excess Return Beta is theoretically cleaner for CAPM.
    // However, they are usually very close. Let's use Raw Beta for consistency with existing simple Beta,
    // OR switch to Excess Beta for Alpha calculation specifically.
    // Jensen's Alpha: Rp - Rf = alpha + beta * (Rm - Rf)
    // So Beta should be calculated on excess returns for the Alpha formula to hold strictly.
    
    // Let's calculate Excess Beta for Alpha derivation.
    const excessNumerator = n * sumExcessXY - sumExcessX * sumExcessY;
    const excessTermX = n * sumExcessX2 - sumExcessX ** 2;
    const excessBeta = excessTermX === 0 ? 0 : excessNumerator / excessTermX;

    // Standard Beta (Raw) - often displayed in portals
    const rawBeta = termX === 0 ? 0 : numerator / termX;

    // Use Excess Beta for Alpha: Alpha = AvgExcessY - Beta * AvgExcessX
    const alpha = avgExcessY - excessBeta * avgExcessX;

    // R-Squared (r^2)
    const rSquared = correlation ** 2;

    // Downside Beta
    // If fewer than 2 downside points, fallback to overall Beta
    const downsideBeta = downsidePairs.length < 2 ? rawBeta : computeSlope(downsidePairs);

    // Downside Alpha (Jensen's Alpha using Downside Beta)
    // We use the same Excess Return logic but swap beta for downsideBeta
    const downsideAlpha = avgExcessY - downsideBeta * avgExcessX;

    return { alpha, beta: rawBeta, rSquared, correlation, downsideBeta, downsideAlpha, sharpeRatio };
}

/**
 * Calculates percentage returns from price pairs.
 * Input: Synchronized price pairs [{ x: PriceX, y: PriceY }...]
 * Output: Return pairs [{ x: ReturnX, y: ReturnY, timestamp }...]
 */
export function calculateReturns(pairs: { x: number; y: number; timestamp?: number }[]): { x: number; y: number; timestamp: number }[] {
    const returns: { x: number; y: number; timestamp: number }[] = [];
    for (let i = 1; i < pairs.length; i++) {
        const prev = pairs[i - 1];
        const curr = pairs[i];

        // Avoid division by zero
        if (prev.x === 0 || prev.y === 0) continue;

        const retX = (curr.x - prev.x) / prev.x;
        const retY = (curr.y - prev.y) / prev.y;
        
        returns.push({ x: retX, y: retY, timestamp: curr.timestamp || 0 });
    }
    return returns;
}

/**
 * Normalizes a data series to start at 1.0 or 0.0 depending on preference.
 * This is useful if comparing growth curves directly.
 * Uses adjClose if available for Total Return accuracy.
 */
export function normalizeToStart(data: { date: Date, price: number, adjClose?: number }[]): DataPoint[] {
    if (data.length === 0) return [];
    const first = data[0];
    const base = first.adjClose || first.price || 1; // Avoid div by zero
    return data.map(p => ({
        timestamp: p.date.getTime(),
        value: (p.adjClose || p.price) / base
    }));
}