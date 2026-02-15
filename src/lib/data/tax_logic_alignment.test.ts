
import { describe, it, expect } from 'vitest';
import { Currency } from '../types';

// We will test the pure logic function first (we'll assume we refactor it to be pure and testable)
// or we can test the existing function signature if we keep it similar.

// Let's define the "Unified Logic" function locally first to verify it passes scenarios, 
// then we will implement it in model.ts.

function calculateTaxableGainNominalRule(
    nominalGain: number, // x
    realGain: number     // y
): number {
    // 1. Mixed Case (one gain, one loss) -> 0 (Exempt)
    if ((nominalGain > 0 && realGain < 0) || (nominalGain < 0 && realGain > 0)) {
        return 0;
    }

    // 2. Both Positive -> Min(x, y)
    if (nominalGain >= 0 && realGain >= 0) {
        return Math.min(nominalGain, realGain);
    }

    // 3. Both Negative -> Nominal (x)
    // User: "For tax reasons, we can only use nominal loses."
    return nominalGain;
}

describe('Unified Tax Logic (Nominal Loss / Min Gain)', () => {

    describe('Foreign Assets (Exchange Rate)', () => {
        it('should use Real Gain when it is lower than Nominal (Inflationary/Devaluation)', () => {
            const x = 65;
            const y = 15;
            expect(calculateTaxableGainNominalRule(x, y)).toBe(15);
        });

        it('should Return 0 for Mixed Case (Nominal Loss, Real Gain)', () => {
            const x = -45;
            const y = 5;
            expect(calculateTaxableGainNominalRule(x, y)).toBe(0);
        });

        it('should use Nominal Loss for Double Loss (Ignoring Real "Closer to 0")', () => {
            // Nominal (x): -28.
            // Real (y): -8.
            // Previous "Closer to 0": -8.
            // New "Nominal Loss": -28.
            const x = -28;
            const y = -8;
            expect(calculateTaxableGainNominalRule(x, y)).toBe(-28);
        });

        it('should use Nominal Loss even if Real Loss is larger', () => {
            // Nominal (x): -10.
            // Real (y): -50.
            // New "Nominal Loss": -10.
            const x = -10;
            const y = -50;
            expect(calculateTaxableGainNominalRule(x, y)).toBe(-10);
        });
    });

    describe('Domestic Assets (CPI)', () => {
        it('should use Real Gain when Inflation (CPI Up)', () => {
            expect(calculateTaxableGainNominalRule(20, 10)).toBe(10);
        });

        it('should use Real Gain (Nominal limit?) when Deflation (CPI Down)', () => {
            // Cost 100. CPI -10% (Deflation). Real Cost = 90.
            // Sold 110. Nominal Gain = 10. Real Gain = 20.
            // Min(10, 20) = 10.
            expect(calculateTaxableGainNominalRule(10, 20)).toBe(10);
        });

        it('should handle Mixed Case (Nominal Gain, Real Loss)', () => {
            expect(calculateTaxableGainNominalRule(20, -30)).toBe(0);
        });
    });
});
