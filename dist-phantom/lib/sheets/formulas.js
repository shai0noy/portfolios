"use strict";
// --- Formula Generators ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleFinanceFormula = getGoogleFinanceFormula;
exports.getHistoricalPriceFormula = getHistoricalPriceFormula;
/**
 * Generates a Google Sheet formula to fetch a specific attribute from GOOGLEFINANCE.
 * @param query The ticker or currency pair.
 * @param attribute The attribute to fetch (e.g., "price", "open").
 * @param dateExpression Optional date expression.
 */
function getGoogleFinanceFormula(query, attribute, dateExpression) {
    const dateArg = dateExpression ? `, ${dateExpression}` : "";
    return `IFERROR(INDEX(GOOGLEFINANCE(${query}, "${attribute}"${dateArg}), 2, 2), "")`;
}
/**
 * Generates a Google Sheet formula to fetch historical prices.
 * @param tickerOrPair The ticker or currency pair.
 * @param dateExpression The date expression for the historical price.
 * @param isCurrency Whether the query is for a currency.
 */
// TODO: Improve this to take optional exchange code rather than isCurrency boolean. Use it wherever GOOGLEFINANCE is used with past dates
function getHistoricalPriceFormula(tickerOrPair, dateExpression, isCurrency = false) {
    const query = isCurrency ? `"CURRENCY:${tickerOrPair}"` : tickerOrPair;
    return getGoogleFinanceFormula(query, "price", dateExpression);
}
