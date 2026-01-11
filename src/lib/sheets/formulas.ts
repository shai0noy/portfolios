/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Formula Generators ---

/**
 * Generates a Google Sheet formula to get the USD to ILS exchange rate, with a fallback.
 * @param dateCell The cell reference (e.g., "A1") containing the date for the exchange rate.
 */
export function getUsdIlsFormula(dateCell: string) {
    // Known issue: GOOGLEFINANCE sometimes lacks USDILS data.
    // Fallback to calculating through EUR.
    const direct = `INDEX(GOOGLEFINANCE("CURRENCY:USDILS", "price", ${dateCell}), 2, 2)`;
    const fallback = `INDEX(GOOGLEFINANCE("CURRENCY:USDEUR", "price", ${dateCell}), 2, 2) * INDEX(GOOGLEFINANCE("CURRENCY:EURILS", "price", ${dateCell}), 2, 2)`;
    return `IFERROR(${direct}, ${fallback})`;
}

/**
 * Generates a Google Sheet formula to fetch a specific attribute from GOOGLEFINANCE.
 * @param query The ticker or currency pair.
 * @param attribute The attribute to fetch (e.g., "price", "open").
 * @param dateExpression Optional date expression.
 */
export function getGoogleFinanceFormula(query: string, attribute: string, dateExpression?: string) {
    const dateArg = dateExpression ? `, ${dateExpression}` : "";
    return `=IFERROR(INDEX(GOOGLEFINANCE(${query}, "${attribute}"${dateArg}), 2, 2), "")`;
}

/**
 * Generates a Google Sheet formula to fetch historical prices.
 * @param tickerOrPair The ticker or currency pair.
 * @param dateExpression The date expression for the historical price.
 * @param isCurrency Whether the query is for a currency.
 */
export function getHistoricalPriceFormula(tickerOrPair: string, dateExpression: string, isCurrency: boolean = false) {
    if (isCurrency && tickerOrPair === "USDILS") {
        return "=" + getUsdIlsFormula(dateExpression);
    }
    const query = isCurrency ? `"CURRENCY:${tickerOrPair}"` : tickerOrPair;
    return getGoogleFinanceFormula(query, "price", dateExpression);
}
