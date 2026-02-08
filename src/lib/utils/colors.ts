/**
 * Returns the color key for a given value.
 * Positive values are green (success.main), negative values are red (error.main).
 * Zero values are default text color (text.primary).
 */
export function getValueColor(value: number | undefined | null): string {
    if (value === undefined || value === null || Math.abs(value) < 0.000001) {
        return 'text.primary';
    }
    return value > 0 ? 'success.main' : 'error.main';
}
