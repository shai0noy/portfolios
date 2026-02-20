
import { describe, it, expect } from 'vitest';
import { normalizeTaseTicker } from './normalization';

describe('normalizeTaseTicker', () => {
    it('removes leading zeros from numeric strings', () => {
        expect(normalizeTaseTicker('0123')).toBe('123');
        expect(normalizeTaseTicker('000123')).toBe('123');
        expect(normalizeTaseTicker('123')).toBe('123');
    });

    it('handles numbers correctly', () => {
        expect(normalizeTaseTicker(123)).toBe('123');
        expect(normalizeTaseTicker(0)).toBe('0');
    });

    it('preserves non-numeric strings', () => {
        expect(normalizeTaseTicker('ABC')).toBe('ABC');
        expect(normalizeTaseTicker('A-123')).toBe('A-123');
        expect(normalizeTaseTicker('0123A')).toBe('0123A'); // Mixed content remains as is
    });
});
