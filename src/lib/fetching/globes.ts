// src/lib/fetching/globes.ts
import { CACHE_TTL, saveToCache, loadFromCache, TASE_CACHE_TTL } from './utils/cache';
import { deduplicateRequest } from './utils/request_deduplicator';
import { fetchXml, parseXmlString, extractDataFromXmlNS } from './utils/xml_parser';
import type { TickerData } from './types';
import { Exchange, parseExchange, Currency } from '../types';
import { normalizeCurrency } from '../currency';
import { formatForexSymbol } from './utils/forex';
import type { TickerProfile } from '../types/ticker';
import { InstrumentClassification } from '../types/instrument';

const GLOBES_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

// --- Helpers ---

function toGlobesExchangeCode(exchange: Exchange): string {
  return exchange.toLowerCase();
}

function getElementTextNS(element: Element, namespace: string, tagName: string): string {
  return element.getElementsByTagNameNS(namespace, tagName)[0]?.textContent || '';
}

function getText(element: Element, tagName: string): string {
  return getElementTextNS(element, GLOBES_API_NAMESPACE, tagName);
}

function extractCommonGlobesData(element: Element) {
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

function parseTradeTimeStatus(instrument: Element): string | undefined {
  const displayTradeTimeEl = instrument.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'DisplayTradeTime')[0];
  if (displayTradeTimeEl) {
    const enText = getElementTextNS(displayTradeTimeEl, GLOBES_API_NAMESPACE, 'en');
    if (enText) {
      return enText.charAt(0).toUpperCase() + enText.slice(1);
    }
  }
  return undefined;
}

function parseCurrencyData(instrument: Element, identifier: string): { currency: Currency, baseCurrency: Currency } {
  const currencyRateStr = getText(instrument, 'CurrencyRate');
  const currencyRate = currencyRateStr ? parseFloat(currencyRateStr) : 1;
  const currencyStr = getText(instrument, 'currency') || 'ILS';
  
  let baseCurrency: Currency;
  let currency: Currency;

  try {
    baseCurrency = normalizeCurrency(currencyStr);
    currency = baseCurrency;

    // Globes ILS/ILA logic
    if (currencyRate === 0.01) {
      if (baseCurrency === Currency.ILS) {
        currency = Currency.ILA;
      } else {
        console.warn(`Globes: CurrencyRate indicates 0.01 for ${identifier}, but base currency is ${currencyStr}.`);
      }
    } else if (currencyRate !== 1) {
      if (baseCurrency === Currency.ILS || baseCurrency === Currency.ILA) {
         console.warn(`Globes: Unexpected CurrencyRate ${currencyRate} for ${identifier} (${baseCurrency}), expected 1 or 0.01.`);
      }
    }
  } catch (e) {
    console.warn(`Globes: Could not parse currency '${currencyStr}' for ${identifier}, defaulting to ILA.`);
    baseCurrency = Currency.ILS;
    currency = Currency.ILA;
  }
  return { currency, baseCurrency };
}

function parseVolume(instrument: Element, last: number, baseCurrency: Currency, currency: Currency): number | undefined {
  const totVolMoneyStr = getText(instrument, 'AverageQuarterTotVolMoney');
  const totVolStr = getText(instrument, 'AverageQuarterTotVol');

  if (totVolMoneyStr) {
    // totVolMoney is in thousands
    let volume = parseFloat(totVolMoneyStr) * 1000;
    if (baseCurrency === Currency.ILS && currency === Currency.ILA) {
      volume = volume * 100; // Convert NIS to Agorot
    }
    return volume;
  } else if (totVolStr) {
    // Fallback: Volume in units * current price
    const units = parseFloat(totVolStr);
    if (!isNaN(units) && last) {
      return units * last;
    }
  }
  return undefined;
}

function calculateChangePct(current: number, previousStr: string): number | undefined {
    const prev = parseFloat(previousStr || '0');
    if (!prev) return undefined;
    return (current - prev) / prev;
}

// --- Main Fetch Functions ---

export async function fetchGlobesTickersByType(type: string, exchange: Exchange, signal?: AbortSignal): Promise<TickerProfile[]> {
  const exchangeCode = toGlobesExchangeCode(exchange);
  const cacheKey = `globes:tickers:v17:${exchangeCode}:${type}`; // Incremented cache version
  const now = Date.now();

  try {
      const cached = await loadFromCache<TickerProfile[]>(cacheKey);
      if (cached && (now - cached.timestamp < TASE_CACHE_TTL)) {
          if (Array.isArray(cached.data)) return cached.data;
      }
  } catch (e) { console.warn('Globes tickers cache read failed', e); }

  const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_list&exchange=${exchangeCode}&type=${type}`;
  const xmlString = await fetchXml(globesApiUrl, signal);
  const xmlDoc = parseXmlString(xmlString);
  
  const data = extractDataFromXmlNS(xmlDoc, GLOBES_API_NAMESPACE, 'anyType', (element): TickerProfile | null => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') return null;

      const common = extractCommonGlobesData(element);
      if (!common.symbol || !common.instrumentId) return null;

      const classification = new InstrumentClassification(type, undefined, { he: common.instrumentTypeHe });
      
      let symbol = common.symbol;
      let rawSecurityId: string | undefined = common.symbol;

      const isIndex = common.rawType?.toLowerCase() === 'index' || classification.type === 'INDEX';

      if (isIndex && common.indexNumber) {
        symbol = common.indexNumber;
        rawSecurityId = common.indexNumber;
      }

      if (exchange === Exchange.FOREX) {
        symbol = formatForexSymbol(symbol);
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

    if (data && data.length > 0) await saveToCache(cacheKey, data);
    return data;
}

export async function fetchGlobesCurrencies(signal?: AbortSignal): Promise<TickerProfile[]> {
  const tickers = await fetchGlobesTickersByType('currency', Exchange.FOREX, signal);
  // Ensure exchange is set correctly if not already (it is set in fetchGlobesTickersByType)
  return tickers; 
}

export async function fetchGlobesStockQuote(symbol: string, securityId: number | undefined, exchange: Exchange, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  const requestedExchangeCode = toGlobesExchangeCode(exchange);
  
  if (exchange === Exchange.TASE && !securityId) {
    console.warn(`fetchGlobesStockQuote: TASE requires a numeric security ID.`);
  }

  const now = Date.now();
  let identifier = (exchange === Exchange.TASE && securityId) ? securityId.toString() : symbol.toUpperCase();
  let tickerSymbol = symbol.toUpperCase();

  // FOREX handling
  if (exchange === Exchange.FOREX) {
    const formattedInput = formatForexSymbol(tickerSymbol);
    tickerSymbol = formattedInput;
    const currencies = await fetchGlobesTickersByType('currency', Exchange.FOREX, signal);
    const match = currencies.find(c => c.symbol === formattedInput);

    // match.meta is ExchangeMetadata which is a union. We need to check if it's 'GLOBES' or 'TASE' type to access instrumentId/securityId.
    // However, TickerProfile structure puts this in `meta`.
    // Since fetchGlobesTickersByType returns TickerProfile with GLOBES meta:
    let rawGlobesId: string | undefined;
    if (match?.meta && match.meta.type === 'GLOBES') {
        rawGlobesId = match.securityId?.toString(); 
    }

    if (rawGlobesId) {
      identifier = rawGlobesId;
    } else {
      console.warn(`Globes: Could not find FOREX ticker ${formattedInput} in Globes currency list.`);
      return null;
    }
  }

  const cacheKey = `globes:quote:v2:${requestedExchangeCode}:${identifier}`;
  if (!forceRefresh) {
    const cached = await loadFromCache<TickerData>(cacheKey);
    if (cached?.timestamp && (now - new Date(cached.timestamp).getTime() < CACHE_TTL)) {
      return cached.data;
    }
  }

  const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_data&exchange=${requestedExchangeCode}&ticker=${identifier}`;

  return deduplicateRequest(cacheKey, async () => {
    let text;
    try {
      text = await fetchXml(globesApiUrl, signal);
    } catch {
      return null;
    }

    try {
      const xmlDoc = parseXmlString(text);
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
        try { exchangeRes = parseExchange(rawExchange); }
        catch (e) { console.warn(`Globes: Unknown exchange '${rawExchange}', keeping requested ${exchange}.`); }
      }

      // Percentage Change Calculation
      const rawPercentageChange = getText(instrument, 'percentageChange');
      let percentageChange: number | undefined = (rawPercentageChange && !isNaN(parseFloat(rawPercentageChange))) ? parseFloat(rawPercentageChange) : undefined;
      
      if (percentageChange === undefined || percentageChange === 0) {
        const changeVal = parseFloat(getText(instrument, 'change') || '0');
        if (changeVal !== 0 && last !== 0) {
          const prevClose = last - changeVal;
          if (prevClose !== 0) percentageChange = (changeVal / prevClose) * 100;
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

      const tickerData: TickerData = {
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

      saveToCache(cacheKey, tickerData, now);
      return tickerData;

    } catch (error) {
      console.error(`Failed to parse ticker data for ${identifier}:`, error);
      return null;
    }
  });
}