
import { calculatePeriodReturns, type PerformancePoint } from './performance';
import { describe, it, expect } from 'vitest';

describe('calculatePeriodReturns', () => {
  // Helper to create a point
  const mkPoint = (dateStr: string, twr: number): PerformancePoint => ({
    date: new Date(dateStr),
    twr,
    holdingsValue: 1000,
    gainsValue: 100,
    costBasis: 900
  });

  it('should calculate 1W return correctly', () => {
    // ... setup ...
    const points: PerformancePoint[] = [
      mkPoint('2023-01-01', 1.0), // Gains: 100
      mkPoint('2023-01-02', 1.01),
      mkPoint('2023-01-03', 1.02),
      mkPoint('2023-01-08', 1.05), // Gains: 100 + (1000 * 0.05) approx? No, mocked.
      // Let's be explicit about gains in mock
    ];

    // Override points with explicit gains for testing
    const p = [
      { ...mkPoint('2023-01-01', 1.0), gainsValue: 100 },
      { ...mkPoint('2023-01-08', 1.05), gainsValue: 150 }, // +50 gain
      { ...mkPoint('2023-01-15', 1.10), gainsValue: 210 }, // +60 gain from Jan 8
    ];

    // Latest: Jan 15. Gain 210.
    // 1W Ago: Jan 8. Gain 150.
    // Period Gain = 210 - 150 = 60.

    const result = calculatePeriodReturns(p);

    expect(result.perf1w).toBeCloseTo(1.10 / 1.05 - 1, 4);
    expect(result.gain1w).toBe(60);
    expect(result.perfAll).toBeCloseTo(0.10, 4);
    expect(result.gainAll).toBe(110); // 210 - 100
  });

  it('should calculate YTD correctly (missing Jan 1 data)', () => {
    const points: PerformancePoint[] = [
      { ...mkPoint('2023-06-01', 1.1), gainsValue: 110 },
      { ...mkPoint('2023-12-31', 1.2), gainsValue: 220 },
    ];
    // YTD Start: Jan 1 (Virtual). Gain 0.
    // Latest: Dec 31 2023.
    // YTD Start: Jan 1 2023.
    // Jan 1 < Jun 1.
    // New Logic: Returns FIRST ACTUAL point (Jun 1). TWR 1.1. Gain 110.
    // YTD = 1.2 / 1.1 - 1 = 9.09%.
    // Gain = 220 - 110 = 110.

    const result = calculatePeriodReturns(points);
    expect(result.perfYtd).toBeCloseTo(1.2 / 1.1 - 1, 4);
    expect(result.gainYtd).toBe(110);
  });

  it('should calculate YTD correctly (with Jan 1 data)', () => {
    const points: PerformancePoint[] = [
      { ...mkPoint('2023-01-01', 1.02), gainsValue: 20 }, // Jan 1 Close
      { ...mkPoint('2023-01-02', 1.04), gainsValue: 40 },
      { ...mkPoint('2023-06-01', 1.20), gainsValue: 200 },
    ];
    // YTD Start: Dec 31 (Virtual).
    // New Logic: Finds First Point >= Jan 1. -> Jan 1 (1.02, Gain 20).
    // YTD = 1.20 / 1.02 - 1 = 17.65%.
    // Gain = 200 - 20 = 180.

    const result = calculatePeriodReturns(points);
    expect(result.perfYtd).toBeCloseTo(1.20 / 1.02 - 1, 4);
    expect(result.gainYtd).toBe(180); 
  });

  it('should calculate 1M return correctly for chart alignment', () => {
  // Scenario: Confirming alignment logic
    const points: PerformancePoint[] = [
      { ...mkPoint('2023-01-01', 1.0), gainsValue: 1000 },
      { ...mkPoint('2023-02-01', 1.1), gainsValue: 1100 }, // +100
    ];
    const result = calculatePeriodReturns(points);
    expect(result.gain1m).toBe(100);
    expect(result.perf1m).toBeCloseTo(0.1, 4);
  });
});
