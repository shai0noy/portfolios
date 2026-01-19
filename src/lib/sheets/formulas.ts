// --- Formula Generators ---

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
    const query = isCurrency ? `"CURRENCY:${tickerOrPair}"` : tickerOrPair;
    return getGoogleFinanceFormula(query, "price", dateExpression);
}
