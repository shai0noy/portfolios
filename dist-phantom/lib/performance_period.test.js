"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const performance_1 = require("./performance");
const vitest_1 = require("vitest");
(0, vitest_1.describe)('calculatePeriodReturns', () => {
    // Helper to create a point
    const mkPoint = (dateStr, twr) => ({
        date: new Date(dateStr),
        twr,
        holdingsValue: 1000,
        gainsValue: 100,
        costBasis: 900
    });
    (0, vitest_1.it)('should calculate 1W return correctly', () => {
        const points = [
            mkPoint('2023-01-01', 1.0), // Start (Day 1 close)
            mkPoint('2023-01-02', 1.01),
            mkPoint('2023-01-03', 1.02),
            mkPoint('2023-01-08', 1.05), // 1W from Jan 1? No, 7 days diff.
            mkPoint('2023-01-15', 1.10), // ~1W from Jan 8
        ];
        // Latest: Jan 15. TWR 1.10.
        // 1W ago: Jan 8.
        // getTwrAtDate(Jan 8) -> Should find point AT Jan 8. TWR 1.05.
        // Return = 1.10 / 1.05 - 1 = 4.76%
        // Mock current date behavior by picking the last point as "now"
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perf1w).toBeCloseTo(1.10 / 1.05 - 1, 4);
        (0, vitest_1.expect)(result.perfAll).toBeCloseTo(0.10, 4); // 1.10 - 1
    });
    (0, vitest_1.it)('should calculate YTD correctly (missing Jan 1 data)', () => {
        // Year: 2023.
        // Start: Jun 1.
        const points = [
            mkPoint('2023-06-01', 1.1),
            mkPoint('2023-12-31', 1.2),
        ];
        // Latest: Dec 31 2023.
        // YTD Start: Jan 1 2023.
        // Jan 1 < Jun 1.
        // getTwrAtDate should return 1.0 (defaults to 1.0 if before start).
        // YTD = 1.2 / 1.0 - 1 = 20%.
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perfYtd).toBeCloseTo(0.2, 4);
    });
    (0, vitest_1.it)('should calculate YTD correctly (with Jan 1 data)', () => {
        // Year 2023.
        const points = [
            mkPoint('2023-01-01', 1.02), // Jan 1 Close. TWR 1.02.
            mkPoint('2023-01-02', 1.04),
            mkPoint('2023-06-01', 1.20),
        ];
        // Latest: Jun 1. TWR 1.20.
        // YTD Start: Dec 31 (Prev Year).
        // getTwrAtDate(Dec 31) -> Returns 1.0 (Before Jan 1).
        // YTD = 1.20 / 1.0 - 1 = 20%.
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perfYtd).toBeCloseTo(0.20, 4);
    });
    (0, vitest_1.it)('should handle timezone boundaries for 1W', () => {
        // UTC vs Local issues check
        // If points are UTC Midnight
        const points = [
            mkPoint('2023-01-01T00:00:00Z', 1.0),
            mkPoint('2023-01-08T00:00:00Z', 1.1),
        ];
        // Latest: Jan 8.
        // 1W ago: Jan 1.
        // Found match exactly.
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perf1w).toBeCloseTo(0.1, 4);
    });
    (0, vitest_1.it)('should handle All Time when history is long', () => {
        const points = [
            mkPoint('2020-01-01', 1.0),
            mkPoint('2025-01-01', 2.0),
        ];
        const result = (0, performance_1.calculatePeriodReturns)(points);
        (0, vitest_1.expect)(result.perfAll).toBeCloseTo(1.0, 4); // +100%
        (0, vitest_1.expect)(result.perf5y).toBeCloseTo(1.0, 4); // 2025 - 5 = 2020. Matches start.
    });
});
