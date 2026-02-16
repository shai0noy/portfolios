
import { calculatePeriodReturns, PerformancePoint } from './performance';
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
    // YTD Gain = 220 - 0 = 220.

    const result = calculatePeriodReturns(points);
    expect(result.perfYtd).toBeCloseTo(0.2, 4);
    expect(result.gainYtd).toBe(220); // Full gain since inception (virtual start)
  });

  it('should calculate YTD correctly (with Jan 1 data)', () => {
    const points: PerformancePoint[] = [
      { ...mkPoint('2023-01-01', 1.02), gainsValue: 20 }, // Jan 1 Close
      { ...mkPoint('2023-01-02', 1.04), gainsValue: 40 },
      { ...mkPoint('2023-06-01', 1.20), gainsValue: 200 },
    ];
    // YTD Start: Dec 31 (Virtual 1.0, 0 gain).
    // YTD Gain = 200 - 0 = 200.

    const result = calculatePeriodReturns(points);
    expect(result.perfYtd).toBeCloseTo(0.20, 4); // 1.20 / 1.0 - 1
    expect(result.gainYtd).toBe(200); 
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
