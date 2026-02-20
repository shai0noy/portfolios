
/**
 * Normalizes a TASE ticker symbol by removing leading zeros.
 * This ensures consistency between different data sources (TASE API, Globes, User Portfolio).
 * @param ticker The ticker symbol to normalize.
 * @returns The normalized ticker (without leading zeros).
 */
export function normalizeTaseTicker(ticker: string | number): string {
    const s = String(ticker);
    // basic check: if it's numeric string, strip leading zeros
    if (/^\d+$/.test(s)) {
        return String(parseInt(s, 10));
    }
    return s;
}
