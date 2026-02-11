"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGlobesTickersByType = fetchGlobesTickersByType;
exports.fetchGlobesCurrencies = fetchGlobesCurrencies;
exports.fetchGlobesStockQuote = fetchGlobesStockQuote;
// src/lib/fetching/globes.ts
const cache_1 = require("./utils/cache");
const config_1 = require("../../config");
const request_deduplicator_1 = require("./utils/request_deduplicator");
const xml_parser_1 = require("./utils/xml_parser");
const types_1 = require("../types");
const currency_1 = require("../currency");
const forex_1 = require("./utils/forex");
const instrument_1 = require("../types/instrument");
const GLOBES_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
// --- Helpers ---
function toGlobesExchangeCode(exchange) {
    return exchange.toLowerCase();
}
function getElementTextNS(element, namespace, tagName) {
    return element.getElementsByTagNameNS(namespace, tagName)[0]?.textContent || '';
}
function getText(element, tagName) {
    return getElementTextNS(element, GLOBES_API_NAMESPACE, tagName);
}
function extractCommonGlobesData(element) {
    return {
        symbol: getText(element, 'symbol'),
        nameHe: getText(element, 'name_he'),
        nameEn: getText(element, 'name_en') || getText(element, 'nameEn'),
        instrumentId: getText(element, 'instrumentId'),
        instrumentTypeHe: getText(element, 'InstrumentTypeHe'),
        indexNumber: getText(element, 'Index_Number'),
        rawType: getText(element, 'type')
    };
}
function parseTradeTimeStatus(instrument) {
    const displayTradeTimeEl = instrument.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'DisplayTradeTime')[0];
    if (displayTradeTimeEl) {
        const enText = getElementTextNS(displayTradeTimeEl, GLOBES_API_NAMESPACE, 'en');
        if (enText) {
            return enText.charAt(0).toUpperCase() + enText.slice(1);
        }
    }
    return undefined;
}
function parseCurrencyData(instrument, identifier) {
    const currencyRateStr = getText(instrument, 'CurrencyRate');
    const currencyRate = currencyRateStr ? parseFloat(currencyRateStr) : 1;
    const currencyStr = getText(instrument, 'currency') || 'ILS';
    let baseCurrency;
    let currency;
    try {
        baseCurrency = (0, currency_1.normalizeCurrency)(currencyStr);
        currency = baseCurrency;
        // Globes ILS/ILA logic
        if (currencyRate === 0.01) {
            if (baseCurrency === types_1.Currency.ILS) {
                currency = types_1.Currency.ILA;
            }
            else {
                console.warn(`Globes: CurrencyRate indicates 0.01 for ${identifier}, but base currency is ${currencyStr}.`);
            }
        }
        else if (currencyRate !== 1) {
            if (baseCurrency === types_1.Currency.ILS || baseCurrency === types_1.Currency.ILA) {
                console.warn(`Globes: Unexpected CurrencyRate ${currencyRate} for ${identifier} (${baseCurrency}), expected 1 or 0.01.`);
            }
        }
    }
    catch (e) {
        console.warn(`Globes: Could not parse currency '${currencyStr}' for ${identifier}, defaulting to ILA.`);
        baseCurrency = types_1.Currency.ILS;
        currency = types_1.Currency.ILA;
    }
    return { currency, baseCurrency };
}
function parseVolume(instrument, last, baseCurrency, currency) {
    const totVolMoneyStr = getText(instrument, 'AverageQuarterTotVolMoney');
    const totVolStr = getText(instrument, 'AverageQuarterTotVol');
    if (totVolMoneyStr) {
        // totVolMoney is in thousands
        let volume = parseFloat(totVolMoneyStr) * 1000;
        if (baseCurrency === types_1.Currency.ILS && currency === types_1.Currency.ILA) {
            volume = volume * 100; // Convert NIS to Agorot
        }
        return volume;
    }
    else if (totVolStr) {
        // Fallback: Volume in units * current price
        const units = parseFloat(totVolStr);
        if (!isNaN(units) && last) {
            return units * last;
        }
    }
    return undefined;
}
function calculateChangePct(current, previousStr) {
    const prev = parseFloat(previousStr || '0');
    if (!prev)
        return undefined;
    return (current - prev) / prev;
}
// --- Main Fetch Functions ---
async function fetchGlobesTickersByType(type, exchange, signal) {
    const exchangeCode = toGlobesExchangeCode(exchange);
    const cacheKey = `globes:tickers:v17:${exchangeCode}:${type}`; // Incremented cache version
    const now = Date.now();
    try {
        const cached = await (0, cache_1.loadFromCache)(cacheKey);
        if (cached && (now - cached.timestamp < cache_1.TASE_CACHE_TTL)) {
            if (Array.isArray(cached.data))
                return cached.data;
        }
    }
    catch (e) {
        console.warn('Globes tickers cache read failed', e);
    }
    const globesApiUrl = `${config_1.WORKER_URL}/?apiId=globes_list&exchange=${exchangeCode}&type=${type}`;
    const xmlString = await (0, xml_parser_1.fetchXml)(globesApiUrl, signal);
    const xmlDoc = (0, xml_parser_1.parseXmlString)(xmlString);
    const data = (0, xml_parser_1.extractDataFromXmlNS)(xmlDoc, GLOBES_API_NAMESPACE, 'anyType', (element) => {
        if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument')
            return null;
        const common = extractCommonGlobesData(element);
        if (!common.symbol || !common.instrumentId)
            return null;
        const classification = new instrument_1.InstrumentClassification(type, undefined, { he: common.instrumentTypeHe });
        let symbol = common.symbol;
        let rawSecurityId = common.symbol;
        const isIndex = common.rawType?.toLowerCase() === 'index' || classification.type === 'INDEX';
        if (isIndex && common.indexNumber) {
            symbol = common.indexNumber;
            rawSecurityId = common.indexNumber;
        }
        if (exchange === types_1.Exchange.FOREX) {
            symbol = (0, forex_1.formatForexSymbol)(symbol);
            rawSecurityId = undefined; // Forex doesn't have numeric security IDs in this context
        }
        const securityId = rawSecurityId ? parseInt(rawSecurityId, 10) : undefined;
        return {
            symbol,
            exchange,
            securityId: (securityId && !isNaN(securityId)) ? securityId : undefined,
            name: common.nameEn,
            nameHe: common.nameHe,
            type: classification,
            meta: {
                type: 'GLOBES',
                instrumentId: common.instrumentId,
            }
        };
    });
    if (data && data.length > 0)
        await (0, cache_1.saveToCache)(cacheKey, data);
    return data;
}
async function fetchGlobesCurrencies(signal) {
    const tickers = await fetchGlobesTickersByType('currency', types_1.Exchange.FOREX, signal);
    // Ensure exchange is set correctly if not already (it is set in fetchGlobesTickersByType)
    return tickers;
}
async function fetchGlobesStockQuote(symbol, securityId, exchange, signal, forceRefresh = false) {
    const requestedExchangeCode = toGlobesExchangeCode(exchange);
    if (exchange === types_1.Exchange.TASE && !securityId) {
        console.warn(`fetchGlobesStockQuote: TASE requires a numeric security ID.`);
    }
    const now = Date.now();
    let identifier = (exchange === types_1.Exchange.TASE && securityId) ? securityId.toString() : symbol.toUpperCase();
    let tickerSymbol = symbol.toUpperCase();
    // FOREX handling
    if (exchange === types_1.Exchange.FOREX) {
        const formattedInput = (0, forex_1.formatForexSymbol)(tickerSymbol);
        tickerSymbol = formattedInput;
        const currencies = await fetchGlobesTickersByType('currency', types_1.Exchange.FOREX, signal);
        const match = currencies.find(c => c.symbol === formattedInput);
        // match.meta is ExchangeMetadata which is a union. We need to check if it's 'GLOBES' or 'TASE' type to access instrumentId/securityId.
        // However, TickerProfile structure puts this in `meta`.
        // Since fetchGlobesTickersByType returns TickerProfile with GLOBES meta:
        let rawGlobesId;
        if (match?.meta && match.meta.type === 'GLOBES') {
            rawGlobesId = match.securityId?.toString();
        }
        if (rawGlobesId) {
            identifier = rawGlobesId;
        }
        else {
            console.warn(`Globes: Could not find FOREX ticker ${formattedInput} in Globes currency list.`);
            return null;
        }
    }
    const cacheKey = `globes:quote:v2:${requestedExchangeCode}:${identifier}`;
    if (!forceRefresh) {
        const cached = await (0, cache_1.loadFromCache)(cacheKey);
        if (cached?.timestamp && (now - new Date(cached.timestamp).getTime() < cache_1.CACHE_TTL)) {
            return cached.data;
        }
    }
    const globesApiUrl = `${config_1.WORKER_URL}/?apiId=globes_data&exchange=${requestedExchangeCode}&ticker=${identifier}`;
    return (0, request_deduplicator_1.deduplicateRequest)(cacheKey, async () => {
        let text;
        try {
            text = await (0, xml_parser_1.fetchXml)(globesApiUrl, signal);
        }
        catch {
            return null;
        }
        try {
            const xmlDoc = (0, xml_parser_1.parseXmlString)(text);
            const instrument = xmlDoc.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'Instrument')[0];
            if (!instrument) {
                console.log(`Globes: No instrument found for ${identifier}`);
                return null;
            }
            const common = extractCommonGlobesData(instrument);
            const tradeTimeStatus = parseTradeTimeStatus(instrument);
            const { currency, baseCurrency } = parseCurrencyData(instrument, identifier);
            const last = parseFloat(getText(instrument, 'last') || '0');
            const openPrice = parseFloat(getText(instrument, 'openPrice') || '0');
            const volume = parseVolume(instrument, last, baseCurrency, currency);
            // Exchange parsing
            const rawExchange = getText(instrument, 'exchange');
            let exchangeRes = exchange;
            if (rawExchange) {
                try {
                    exchangeRes = (0, types_1.parseExchange)(rawExchange);
                }
                catch (e) {
                    console.warn(`Globes: Unknown exchange '${rawExchange}', keeping requested ${exchange}.`);
                }
            }
            // Percentage Change Calculation
            const rawPercentageChange = getText(instrument, 'percentageChange');
            let percentageChange = (rawPercentageChange && !isNaN(parseFloat(rawPercentageChange))) ? parseFloat(rawPercentageChange) : undefined;
            if (percentageChange === undefined || percentageChange === 0) {
                const changeVal = parseFloat(getText(instrument, 'change') || '0');
                if (changeVal !== 0 && last !== 0) {
                    const prevClose = last - changeVal;
                    if (prevClose !== 0)
                        percentageChange = (changeVal / prevClose) * 100;
                }
            }
            const timestampStr = getText(instrument, 'timestamp');
            const parsedTimestamp = timestampStr ? new Date(timestampStr).valueOf() : NaN;
            const effectiveTimestamp = !isNaN(parsedTimestamp) ? parsedTimestamp : now;
            const changePctYtdRaw = getText(instrument, 'ChangeFromLastYear');
            const changePctYtd = (changePctYtdRaw && !isNaN(parseFloat(changePctYtdRaw))) ? parseFloat(changePctYtdRaw) / 100 : undefined;
            let finalTicker = tickerSymbol;
            let finalNumericId = securityId || null;
            // If it's an index, prefer using the official index number as symbol/ID
            const isIndex = common.rawType?.toLowerCase() === 'index';
            if (isIndex && common.indexNumber) {
                finalTicker = common.indexNumber;
                finalNumericId = parseInt(common.indexNumber, 10) || finalNumericId;
            }
            const tickerData = {
                price: last,
                openPrice,
                name: common.nameEn || undefined,
                nameHe: common.nameHe || undefined,
                currency,
                exchange: exchangeRes,
                changePct1d: percentageChange !== undefined ? percentageChange / 100 : undefined,
                timestamp: new Date(effectiveTimestamp),
                changePctYtd,
                changePctRecent: calculateChangePct(last, getText(instrument, 'LastWeekClosePrice')),
                recentChangeDays: 7,
                changePct1m: calculateChangePct(last, getText(instrument, 'LastMonthClosePrice')),
                changePct3m: calculateChangePct(last, getText(instrument, 'Last3MonthsAgoClosePrice')),
                changePct3y: calculateChangePct(last, getText(instrument, 'Last3YearsAgoClosePrice')),
                ticker: finalTicker,
                numericId: finalNumericId,
                source: 'Globes',
                globesInstrumentId: common.instrumentId || undefined,
                tradeTimeStatus,
                globesTypeHe: common.instrumentTypeHe || undefined,
                volume
            };
            (0, cache_1.saveToCache)(cacheKey, tickerData, now);
            return tickerData;
        }
        catch (error) {
            console.error(`Failed to parse ticker data for ${identifier}:`, error);
            return null;
        }
    });
}
