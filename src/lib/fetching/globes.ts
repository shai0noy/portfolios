// src/lib/fetching/globes.ts
import { WORKER_URL } from '../../config';
import { CACHE_TTL, fetchWithCache } from './utils/cache';
import { deduplicateRequest } from './utils/request_deduplicator';
import { fetchXml, parseXmlString, extractDataFromXmlNS } from './utils/xml_parser';
import type { TickerData } from './types';
import { Exchange, parseExchange, Currency, EXCHANGE_SETTINGS } from '../types';
import { normalizeCurrency } from '../currency';
import { formatForexSymbol } from './utils/forex';
import type { TickerProfile } from '../types/ticker';
import { InstrumentClassification } from '../types/instrument';

const GLOBES_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

// --- Helpers ---

function toGlobesExchangeCode(exchange: Exchange): string {
  return EXCHANGE_SETTINGS[exchange]?.globesCode || exchange.toLowerCase();
}

function getElementTextNS(element: Element, namespace: string, tagName: string): string {
  return element.getElementsByTagNameNS(namespace, tagName)[0]?.textContent || '';
}

function getText(element: Element, tagName: string): string {
  return getElementTextNS(element, GLOBES_API_NAMESPACE, tagName);
}

function parseSafeNumber(element: Element, tagName: string): number | undefined {
  const el = element.getElementsByTagNameNS(GLOBES_API_NAMESPACE, tagName)[0];
  if (!el) return undefined;
  if (el.getAttribute('xsi:nil') === 'true' || el.getAttributeNS?.(XSI_NAMESPACE, 'nil') === 'true') return undefined;
  const text = el.textContent;
  if (!text || text.trim() === '' || text.toLowerCase() === 'null') return undefined;
  const n = parseFloat(text);
  return isNaN(n) ? undefined : n;
}

function extractCommonGlobesData(element: Element) {
  return {
    symbol: getText(element, 'symbol'),
    nameHe: getText(element, 'name_he'),
    nameEn: getText(element, 'name_en') || getText(element, 'nameEn'),
    instrumentId: getText(element, 'instrumentId'),
    instrumentTypeHe: getText(element, 'InstrumentTypeHe'),
    indexNumber: getText(element, 'Index_Number'),
    rawType: getText(element, 'type'),
    koteretAlName: getText(element, 'KoteretAlName')
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
  const totVolMoney = parseSafeNumber(instrument, 'AverageQuarterTotVolMoney');
  const totVolUnits = parseSafeNumber(instrument, 'AverageQuarterTotVol');

  if (totVolMoney !== undefined) {
    // totVolMoney is in thousands
    let volume = totVolMoney * 1000;
    if (baseCurrency === Currency.ILS && currency === Currency.ILA) {
      volume = volume * 100; // Convert NIS to Agorot
    }
    return volume;
  } else if (totVolUnits !== undefined && last) {
    // Fallback: Volume in units * current price
    return totVolUnits * last;
  }
  return undefined;
}

function calculateChangePct(current: number, prev: number | undefined): number | undefined {
  if (!prev || current === prev) return undefined;
  return (current - prev) / prev;
}

function parseGlobesTimestamp(dateStr: string): number {
  if (!dateStr) return NaN;

  // Ensure space before AM/PM
  let parsedStr = dateStr.replace(/([0-9])([APap][Mm])/, '$1 $2');

  // Convert DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY to MM/DD/YYYY for native JS parser
  parsedStr = parsedStr.replace(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, '$2/$1/$3');

  // Matches pure "HH:mm" or "HH:mm:ss" indicating today's local time
  if (/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.test(parsedStr)) {
    const now = new Date();
    parsedStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${parsedStr}`;
  }

  // Fallback to JS standard parser
  return new Date(parsedStr).valueOf();
}



// --- Main Fetch Functions ---

export async function fetchGlobesTickersByType(type: string, exchange: Exchange, signal?: AbortSignal): Promise<TickerProfile[]> {
  const reqKey = `fetchGlobesTickersByType:${type}:${exchange}`;
  return deduplicateRequest(reqKey, async () => {
    const exchangeCode = toGlobesExchangeCode(exchange);

    const globesApiUrl = `${WORKER_URL}/?apiId=globes_list&exchange=${exchangeCode}&type=${type}`;
    const xmlString = await fetchXml(globesApiUrl, signal, { cache: 'force-cache' });
    const xmlDoc = parseXmlString(xmlString);

    const data = extractDataFromXmlNS(xmlDoc, GLOBES_API_NAMESPACE, 'anyType', (element): TickerProfile | null => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') return null;

      const common = extractCommonGlobesData(element);
      if (!common.symbol || !common.instrumentId) return null;

      let effectiveType = type;
      if (common.koteretAlName === 'קרן כספית') {
        effectiveType = 'monetary_fund';
      }

      const classification = new InstrumentClassification(effectiveType, undefined, { he: common.instrumentTypeHe });

      let symbol = common.symbol;
      let rawSecurityId: string | undefined = common.symbol;

      const isIndex = common.rawType?.toLowerCase() === 'index' || classification.type === 'INDEX';

      if (isIndex && common.indexNumber) {
        symbol = common.indexNumber;
        rawSecurityId = common.indexNumber;
      }

      // Encode TASE normalization
      if (exchange === Exchange.TASE) {
        symbol = symbol.trim();
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
        isFeeExempt: common.koteretAlName === 'קרן כספית',
        meta: {
          type: 'GLOBES',
          instrumentId: common.instrumentId,
        }
      };
    });


    return data.filter(item => item !== null) as TickerProfile[];
  });
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
  let identifier = (exchange === Exchange.TASE && securityId) ? securityId.toString() : symbol.toUpperCase().replace(/^\^/, '');
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

  const cacheKey = `globes:quote:v4:${requestedExchangeCode}:${identifier}`;
  const globesApiUrl = `${WORKER_URL}/?apiId=globes_data&exchange=${requestedExchangeCode}&ticker=${identifier}`;

  return fetchWithCache(
    cacheKey,
    CACHE_TTL,
    forceRefresh,
    async () => {
      let text;
      try {
        text = await fetchXml(globesApiUrl, signal, { cache: forceRefresh ? 'no-cache' : 'force-cache' });
      } catch (e: any) {
        if (e.status === 429 || e.status >= 500) {
          console.log(`Globes: Transient error ${e.status} for ${identifier}, not caching.`);
          // fetchWithCache expects transient errors to be thrown if we want to bypass caching
          throw e;
        }
        console.log(`Globes: Definitely no result found for ${identifier} (status ${e.status}), caching as Not Found.`);
        return null; // fetchWithCache will cache this null
      }

      try {
        const xmlDoc = parseXmlString(text);
        const instrument = xmlDoc.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'Instrument')[0];
        if (!instrument || instrument.getAttribute('xsi:nil') === 'true' || instrument.getAttributeNS?.('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true') {
          return null;
        }

        const common = extractCommonGlobesData(instrument);
        const tradeTimeStatus = parseTradeTimeStatus(instrument);
        const { currency, baseCurrency } = parseCurrencyData(instrument, identifier);

        const last = parseSafeNumber(instrument, 'last');
        if (last === undefined) {
          // Essential field missing or explicity void, let Yahoo take over without overriding its data with undefined/0
          return null;
        }
        const openPrice = parseSafeNumber(instrument, 'openPrice');
        const volume = parseVolume(instrument, last, baseCurrency, currency);

        // Exchange parsing
        const rawExchange = getText(instrument, 'exchange');
        let exchangeRes = exchange;
        if (rawExchange) {
          try { exchangeRes = parseExchange(rawExchange); }
          catch (e) { console.warn(`Globes: Unknown exchange '${rawExchange}', keeping requested ${exchange}.`); }
        }

        // Percentage Change Calculation
        let percentageChange = parseSafeNumber(instrument, 'percentageChange');

        if (percentageChange === undefined || percentageChange === 0) {
          const changeVal = parseSafeNumber(instrument, 'change') || 0;
          if (changeVal !== 0 && last !== 0) {
            const prevClose = last - changeVal;
            if (prevClose !== 0) percentageChange = (changeVal / prevClose) * 100;
          }
        }

        const timestampStr = getText(instrument, 'timestamp');
        const parsedTimestamp = timestampStr ? parseGlobesTimestamp(timestampStr) : NaN;
        const effectiveTimestamp = !isNaN(parsedTimestamp) ? parsedTimestamp : now;

        const changePctYtdRaw = parseSafeNumber(instrument, 'ChangeFromLastYear');
        const changePctYtd = changePctYtdRaw !== undefined ? changePctYtdRaw / 100 : undefined;

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
          changeDate1d: new Date(effectiveTimestamp),
          timestamp: new Date(effectiveTimestamp),
          changePctYtd,
          changePctRecent: calculateChangePct(last, parseSafeNumber(instrument, 'LastWeekClosePrice')),
          recentChangeDays: 7,
          changePct1m: calculateChangePct(last, parseSafeNumber(instrument, 'LastMonthClosePrice')),
          changePct3m: calculateChangePct(last, parseSafeNumber(instrument, 'Last3MonthsAgoClosePrice')),
          changePct3y: calculateChangePct(last, parseSafeNumber(instrument, 'Last3YearsAgoClosePrice')),
          ticker: finalTicker,
          numericId: finalNumericId,
          source: 'Globes',
          globesInstrumentId: common.instrumentId || undefined,
          tradeTimeStatus,
          globesTypeHe: common.instrumentTypeHe || undefined,
          volume,
          isFeeExempt: common.koteretAlName === 'קרן כספית',
          type: new InstrumentClassification(
            common.koteretAlName === 'קרן כספית' ? 'monetary_fund' : common.rawType || 'unknown',
            undefined,
            { he: common.instrumentTypeHe }
          )
        };


        return tickerData;

      } catch (error) {
        console.error(`Failed to parse ticker data for ${identifier}:`, error);
        // We throw error here so it won't be cached as a valid "null" result, since it's a parsing error
        throw error;
      }
    });
}