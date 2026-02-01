/**
 * Utility functions for statistical analysis of financial time series.
 */

export interface AnalysisMetrics {
    alpha: number;
    beta: number;
    rSquared: number;
    correlation: number;
}

export interface DataPoint {
    timestamp: number;
    value: number;
}

/**
 * Synchronizes two mismatched time series using Nearest Neighbor matching.
 * datasetX is usually the Independent variable (Benchmark).
 * datasetY is usually the Dependent variable (Portfolio).
 */
export function synchronizeSeries(datasetX: DataPoint[], datasetY: DataPoint[]): { x: number; y: number }[] {
    if (datasetX.length === 0 || datasetY.length === 0) return [];

    // Sort by timestamp just in case
    const sortedY = [...datasetY].sort((a, b) => a.timestamp - b.timestamp);

    return datasetX.map(pX => {
        // Find the closest point in Y to pX.timestamp
        // Optimization: since both are sorted, we could use a pointer or binary search.
        // For simplicity and matching user prompt:
        let closestY = sortedY[0];
        let minDiff = Math.abs(pX.timestamp - closestY.timestamp);

        for (const pY of sortedY) {
            const diff = Math.abs(pX.timestamp - pY.timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closestY = pY;
            } else if (diff > minDiff) {
                break; // Diff starts increasing, stop
            }
        }
        return { x: pX.value, y: closestY.value };
    });
}

/**
 * Computes statistical metrics using Ordinary Least Squares (OLS) regression.
 * X = Independent (Benchmark), Y = Dependent (Portfolio)
 */
export function computeAnalysisMetrics(pairs: { x: number; y: number }[]): AnalysisMetrics | null {
    const n = pairs.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

    for (const { x, y } of pairs) {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
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

    return { alpha, beta, rSquared, correlation };
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
