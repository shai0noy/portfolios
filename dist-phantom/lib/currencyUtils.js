"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePerformanceInDisplayCurrency = void 0;
exports.normalizeCurrency = normalizeCurrency;
exports.toILA = toILA;
exports.toILS = toILS;
exports.toUSD = toUSD;
exports.convertCurrency = convertCurrency;
exports.formatNumber = formatNumber;
exports.formatValue = formatValue;
exports.formatPercent = formatPercent;
exports.formatPrice = formatPrice;
exports.convertMoney = convertMoney;
exports.formatMoneyValue = formatMoneyValue;
exports.formatMoneyPrice = formatMoneyPrice;
const types_1 = require("./types");
// Unicode Left-to-Right Mark (LRM).
const LTR_MARK = '\u200E';
function normalizeCurrency(input) {
    if (!input)
        return types_1.Currency.USD;
    const upper = input.trim().toUpperCase();
    // Hebrew & Symbols
    if (upper === 'ש"ח' || upper === 'NIS' || upper === 'ILS')
        return types_1.Currency.ILS;
    if (upper === 'אג' || upper === 'ILA' || upper === 'ILAG' || upper === 'AGOROT' || upper === 'AG')
        return types_1.Currency.ILA;
    if (upper === 'דולר' || upper === '$' || upper === 'DOLLAR' || upper === 'USD')
        return types_1.Currency.USD;
    if (upper === 'אירו' || upper === 'EUR' || upper === 'EURO')
        return types_1.Currency.EUR;
    if (upper === 'ליש"ט' || upper === 'LIRA' || upper === 'GBP')
        return types_1.Currency.GBP;
    if (upper === 'USD')
        return types_1.Currency.USD;
    console.warn(`normalizeCurrency: Unknown currency '${input}', defaulting to USD`);
    throw new Error(`Unknown currency: ${input}`);
}
// Convert to ILA (Agorot)
function toILA(amount, srcCurrency, rates) {
    return convertCurrency(amount, srcCurrency, types_1.Currency.ILA, rates);
}
// Convert to ILS (Major Unit)
function toILS(amount, srcCurrency, rates) {
    return convertCurrency(amount, srcCurrency, types_1.Currency.ILS, rates);
}
// Convert to USD
function toUSD(amount, srcCurrency, rates) {
    return convertCurrency(amount, srcCurrency, types_1.Currency.USD, rates);
}
function convertCurrency(amount, from, to, rates) {
    if (typeof amount !== 'number' || isNaN(amount)) {
        console.error(`convertCurrency: Invalid amount: ${amount}`);
        return 0;
    }
    const fromNorm = normalizeCurrency(from);
    const toNorm = normalizeCurrency(to);
    if (fromNorm === toNorm)
        return amount;
    // Handle direct ILS <-> ILA conversion, which doesn't need rates
    if (fromNorm === types_1.Currency.ILA && toNorm === types_1.Currency.ILS)
        return amount / 100;
    if (fromNorm === types_1.Currency.ILS && toNorm === types_1.Currency.ILA)
        return amount * 100;
    let currentRates;
    if (rates && 'current' in rates) {
        currentRates = rates.current;
    }
    else if (rates) {
        currentRates = rates;
    }
    if (!currentRates) {
        console.error(`convertCurrency: Missing exchange rates for conversion from ${fromNorm} to ${toNorm}.`);
        return 0;
    }
    // Rate lookup (assuming base is USD)
    const fromRate = currentRates[fromNorm === types_1.Currency.ILA ? types_1.Currency.ILS : fromNorm];
    const toRate = currentRates[toNorm === types_1.Currency.ILA ? types_1.Currency.ILS : toNorm];
    if ((fromNorm !== types_1.Currency.USD && fromNorm !== types_1.Currency.ILA) && !fromRate) {
        console.warn(`convertCurrency: Missing or zero rate for source currency: ${fromNorm} (rate: ${fromRate}). returning 0.`);
        return 0;
    }
    if ((toNorm !== types_1.Currency.USD && toNorm !== types_1.Currency.ILA) && !toRate) {
        console.warn(`convertCurrency: Missing or zero rate for target currency: ${toNorm} (rate: ${toRate}). returning 0.`);
        return 0;
    }
    // Normalize input to Major Unit (ILS if ILA) for calculation
    const adjustedAmount = (fromNorm === types_1.Currency.ILA) ? amount / 100 : amount;
    const amountInUSD = (fromNorm === types_1.Currency.USD) ? adjustedAmount : adjustedAmount / fromRate;
    const result = (toNorm === types_1.Currency.USD) ? amountInUSD : amountInUSD * toRate;
    // If target is ILA, result (which is in ILS because we used ILS rate) needs to be converted to ILA
    if (toNorm === types_1.Currency.ILA)
        return result * 100;
    return result;
}
const calculatePerformanceInDisplayCurrency = (currentPrice, stockCurrency, perfPct, displayCurrency, exchangeRates) => {
    if (perfPct === undefined || perfPct === null || isNaN(perfPct))
        return { changeVal: NaN, changePct1d: NaN };
    const normStockCurrency = normalizeCurrency(stockCurrency);
    const normDisplayCurrency = normalizeCurrency(displayCurrency);
    // Handle -100% change edge case to prevent division by zero
    if (Math.abs(1 + perfPct) < 1e-9) {
        const priceDisplayNow = convertCurrency(currentPrice, normStockCurrency, normDisplayCurrency, exchangeRates);
        return { changeVal: -priceDisplayNow, changePct1d: -1 };
    }
    const prevPriceStock = currentPrice / (1 + perfPct);
    const changeValStock = currentPrice - prevPriceStock;
    const changeValDisplay = convertCurrency(changeValStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
    const prevPriceDisplay = convertCurrency(prevPriceStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
    const changePctDisplay = prevPriceDisplay !== 0 ? changeValDisplay / prevPriceDisplay : 0;
    return { changeVal: changeValDisplay, changePct1d: changePctDisplay };
};
exports.calculatePerformanceInDisplayCurrency = calculatePerformanceInDisplayCurrency;
function formatNumber(n) {
    if (n === undefined || n === null || isNaN(n))
        return '-';
    const options = {
        useGrouping: true,
        ...(Number.isInteger(n)
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
            : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    };
    return LTR_MARK + n.toLocaleString(undefined, options);
}
/** @deprecated Use formatMoneyValue instead to ensure type safety */
function formatValue(n, currency, decimals = 2, _t) {
    if (n === undefined || n === null || isNaN(n))
        return '-';
    let norm = normalizeCurrency(currency);
    if (norm === types_1.Currency.ILA) {
        norm = types_1.Currency.ILS;
        n = toILS(n, types_1.Currency.ILA);
    }
    try {
        return LTR_MARK + new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: norm,
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        }).format(n);
    }
    catch (e) {
        console.warn(`Could not format currency for code: ${norm}. Using default format.`);
        const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: true });
        return `${LTR_MARK}${val} ${norm}`;
    }
}
function formatPercent(n) {
    if (n === undefined || n === null || isNaN(n))
        return '-';
    const formatter = new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
    return LTR_MARK + formatter.format(n);
}
/** @deprecated Use formatMoneyPrice instead to ensure type safety */
function formatPrice(n, currency, decimals = 2, t) {
    if (n === undefined || n === null || isNaN(n))
        return '-';
    const norm = normalizeCurrency(currency);
    if (norm === types_1.Currency.ILA) {
        const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
        const agorotText = t ? t('ag.', "א'") : 'ag.';
        return `${LTR_MARK}${val} ${agorotText}`;
    }
    try {
        return LTR_MARK + new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: norm,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: false,
        }).format(n);
    }
    catch (e) {
        console.warn(`Could not format price for currency code: ${norm}. Using default format.`);
        const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
        return `${LTR_MARK}${val} ${norm}`;
    }
}
function convertMoney(money, targetCurrency, rates) {
    const target = normalizeCurrency(targetCurrency);
    if (!money)
        return { amount: 0, currency: target };
    const amount = convertCurrency(money.amount, money.currency, target, rates);
    return { amount, currency: target };
}
function formatMoneyValue(m, t) {
    if (!m)
        return '-';
    // Use formatValue default
    return formatValue(m.amount, m.currency, 2, t);
}
function formatMoneyPrice(m, t) {
    if (!m)
        return '-';
    return formatPrice(m.amount, m.currency, 2, t);
}
