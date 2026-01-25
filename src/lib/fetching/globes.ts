// src/lib/fetching/globes.ts
import { CACHE_TTL, saveToCache, loadFromCache, TASE_CACHE_TTL } from './utils/cache';
import { fetchXml, parseXmlString, extractDataFromXmlNS } from './utils/xml_parser';
import type { TickerData, TickerListItem } from './types';
import { Exchange, parseExchange, Currency } from '../types';
import { normalizeCurrency } from '../currency';
import { formatForexSymbol } from './utils/forex';

const GLOBES_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

function toGlobesExchangeCode(exchange: Exchange): string {
  return exchange.toLowerCase();
}

/**
 * Fetches ticker data from Globes for a specific security type and exchange.
 * @param type - The type of security to fetch (e.g., 'stock', 'etf', 'currency').
 * @param exchange - The exchange to fetch from (e.g., 'tase', 'forex').
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to an array of TickerListItem.
 */
export async function fetchGlobesTickersByType(type: string, exchange: Exchange, signal?: AbortSignal): Promise<TickerListItem[]> {
  const exchangeCode = toGlobesExchangeCode(exchange);
  // Using TASE_CACHE_TTL which is longer (5 days) for lists
  const cacheKey = `globes:tickers:v7:${exchangeCode}:${type}`;
  
  // Use manual caching instead of withTaseCache for consistent implementation across files
  const now = Date.now();
  try {
      const cached = await loadFromCache<TickerListItem[]>(cacheKey);
      if (cached && (now - cached.timestamp < TASE_CACHE_TTL)) {
          if (!Array.isArray(cached.data)) {
              console.warn(`Globes tickers cache for ${cacheKey} is invalid (not an array):`, cached.data);
              // Invalid cache, proceed to fetch
          } else {
              return cached.data;
          }
      }
  } catch (e) {
      console.warn('Globes tickers cache read failed', e);
  }

  const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_list&exchange=${exchangeCode}&type=${type}`;
  const xmlString = await fetchXml(globesApiUrl, signal);
  const xmlDoc = parseXmlString(xmlString);
  const data = extractDataFromXmlNS(xmlDoc, GLOBES_API_NAMESPACE, 'anyType', (element): TickerListItem | null => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') {
        return null;
      }

      const getElementText = (tagName: string) => element.getElementsByTagNameNS(GLOBES_API_NAMESPACE, tagName)[0]?.textContent || '';

      const numericSecurityId = getElementText('symbol');
      const nameHe = getElementText('name_he');
      const nameEn = getElementText('nameEn');
      const globesInstrumentId = getElementText('instrumentId');

      if (!numericSecurityId || !globesInstrumentId) {
        return null;
      }

      let symbol = numericSecurityId;
      if (exchange === Exchange.FOREX) {
        symbol = formatForexSymbol(symbol);
      }

      return {
        symbol,
        exchange: exchange,
        nameEn,
        nameHe,
        globesTypeCode: type,
        globesRawSymbol: numericSecurityId,
        globesTypeHe: getElementText('InstrumentTypeHe'),
        taseInfo: {
          securityId: Number(numericSecurityId),
          companyName: nameEn,
          companySuperSector: '',
          companySector: '',
          companySubSector: '',
          globesInstrumentId: globesInstrumentId,
          taseType: type
        }
      };
    });

    if (data && data.length > 0) {
        await saveToCache(cacheKey, data);
    }
    return data;
}
export async function fetchGlobesCurrencies(signal?: AbortSignal): Promise<TickerListItem[]> {
  const tickers = await fetchGlobesTickersByType('currency', Exchange.FOREX, signal);
  return tickers.map(t => ({ ...t, exchange: Exchange.FOREX }));
}

export async function fetchGlobesStockQuote(symbol: string, securityId: number | undefined, exchange: Exchange, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  const requestedExchangeCode = toGlobesExchangeCode(exchange);
  if (exchange === Exchange.TASE && !securityId) {
    console.warn(`fetchGlobesStockQuote: TASE requires a numeric security ID.`);
  }

  const now = Date.now();
  let identifier = (exchange === Exchange.TASE && securityId) ? securityId.toString() : symbol.toUpperCase();
  let tickerSymbol = symbol.toUpperCase();

  // Special handling for FOREX: Use the tickers list to find the correct raw Globes identifier
  if (exchange === Exchange.FOREX) {
    const formattedInput = formatForexSymbol(tickerSymbol);
    tickerSymbol = formattedInput; // Ensure we return the formatted ticker in TickerData

    // Fetch the full list of currencies (cached) to lookup the raw symbol
    const currencies = await fetchGlobesTickersByType('currency', Exchange.FOREX, signal);

    // Find the item that matches our formatted symbol
    const match = currencies.find(c => c.symbol === formattedInput);

    if (match && match.globesRawSymbol) {
      identifier = match.globesRawSymbol;
    } else {
      console.warn(`Globes: Could not find FOREX ticker ${formattedInput} (raw input: ${symbol}) in Globes currency list.`);
      return null;
    }
  }

  const cacheKey = `globes:${requestedExchangeCode}:${identifier}`;
  if (!forceRefresh) {
    const cached = await loadFromCache<TickerData>(cacheKey);
    // TickerData has its own timestamp, but let's be safe and check if it has been hydrated
    if (cached && cached.timestamp && (now - new Date(cached.timestamp).getTime() < CACHE_TTL)) {
      return cached.data;
    }
  }

  const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_data&exchange=${requestedExchangeCode}&ticker=${identifier}`;
  let text;
  try {
    text = await fetchXml(globesApiUrl, signal);
  } catch {
    return null;
  }

  try {
    const xmlDoc = parseXmlString(text);
    // Use namespaced selector for the root element
    const instrument = xmlDoc.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'Instrument')[0];
    if (!instrument) {
      console.log(`Globes: No instrument found for ${identifier}`);
      return null;
    }

    // Use namespaced selector for child elements
    const getText = (tag: string) => instrument.getElementsByTagNameNS(GLOBES_API_NAMESPACE, tag)[0]?.textContent || null;

    const displayTradeTimeEl = instrument.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'DisplayTradeTime')[0];
    let tradeTimeStatus: string | undefined = undefined;
    if (displayTradeTimeEl) {
      const enText = displayTradeTimeEl.getElementsByTagNameNS(GLOBES_API_NAMESPACE, 'en')[0]?.textContent;
      if (enText) {
        // "fix casing for english" -> "End of day"
        tradeTimeStatus = enText.charAt(0).toUpperCase() + enText.slice(1);
      }
    }

    // Use specific fields from Globes XML (Currency/Stock)
    const last = parseFloat(getText('last') || '0');
    const openPrice = parseFloat(getText('openPrice') || '0');
    const nameEn = getText('name_en') || getText('nameEn');
    const nameHe = getText('name_he');
    const globesInstrumentId = getText('instrumentId');

    // Check CurrencyRate for unit conversion hint (0.01 implies price is in Agorot)
    const currencyRateStr = getText('CurrencyRate');
    const currencyRate = currencyRateStr ? parseFloat(currencyRateStr) : 1;

    const currencyStr = getText('currency') || 'ILS';
    let baseCurrency: Currency;
    let currency: Currency;
    try {
      baseCurrency = normalizeCurrency(currencyStr);
      currency = baseCurrency;
      // Globes often reports ILS (Shekels) for TASE stocks which are actually priced in Agorot (ILA).
      // Only convert if explicitly signaled by CurrencyRate being 0.01 OR if we are on TASE and it's ambiguous
      // (Usually TASE stocks are in Agorot unless specified otherwise)
      if (currencyRate == 0.01) {
        if (baseCurrency === Currency.ILS) {
          currency = Currency.ILA;
        } else {
          console.warn(`Globes: CurrencyRate indicates 0.01 for ${identifier}, but base currency is ${currencyStr}.`);
        }
      } else if (currencyRate != 1) {
        // For non-ILS currencies, the rate might be the exchange rate to ILS, which is fine.
        // We only warn if it's ILS/ILA and not 1 or 0.01
        if (baseCurrency === Currency.ILS || baseCurrency === Currency.ILA) {
             console.warn(`Globes: Unexpected CurrencyRate ${currencyRate} for ${identifier} (${baseCurrency}), expected 1 or 0.01.`);
        }
      }
    } catch (e) {
      console.warn(`Globes: Could not parse currency '${currencyStr}' for ${identifier}, defaulting to ILA.`);
      baseCurrency = Currency.ILS;
      currency = Currency.ILA;
    }

    if (exchange === Exchange.FOREX) {
      // Re-format the symbol to see what we expect. 
      // Note: 'symbol' arg passed to this function might be raw or formatted, but 'identifier' is unformatted.
      // We should format the identifier to see what the suffix/split implies.
      const formatted = formatForexSymbol(identifier);
      // Extract expected currency from the formatted symbol (e.g. AUD-USD -> USD, BTC-USD -> USD, USD-ILS -> ILS)
      const parts = formatted.split('-');
      if (parts.length < 2) {
        console.warn(`Globes: FOREX ticker ${formatted} (raw: ${identifier}) does not have expected '-' format.`);
      } else {
        const expectedBaseCurrency = parts[1];
        if (expectedBaseCurrency !== baseCurrency) {
          console.warn(`Globes: FOREX ticker ${formatted} (raw: ${identifier}) returned currency ${baseCurrency}, expected ${expectedBaseCurrency}.`);
        }
      }

    }

    // Exchange handling
    const rawExchange = getText('exchange');
    let exchangeRes: Exchange = exchange; // Default to requested exchange
    if (rawExchange) {
      try {
        exchangeRes = parseExchange(rawExchange);
      } catch (e) {
        console.warn(`Globes: Unknown exchange '${rawExchange}' in response for ${identifier}, keeping requested exchange ${exchange}.`);
      }
    }

    let percentageChange = parseFloat(getText('percentageChange') || '0');
    // Fallback: Calculate percentage if missing but 'change' exists
    if (percentageChange === 0) {
      const changeVal = parseFloat(getText('change') || '0');
      if (changeVal !== 0 && last !== 0) {
        const prevClose = last - changeVal;
        if (prevClose !== 0) {
          percentageChange = (changeVal / prevClose) * 100;
        }
      }
    }

    const globesTypeHe = getText('InstrumentTypeHe');
    const timestamp = getText('timestamp');

    // Volume Extraction
    const totVolMoneyStr = getText('AverageQuarterTotVolMoney');
    const totVolStr = getText('AverageQuarterTotVol');
    let volume: number | undefined = undefined;

    if (totVolMoneyStr) {
        // totVolMoney is in thousands
        volume = parseFloat(totVolMoneyStr) * 1000;
        if (baseCurrency === Currency.ILS && currency === Currency.ILA) {
          volume = volume * 100; // Convert NIS to Agorot
        }
    } else if (totVolStr) {
        // Fallback: Volume in units * current price
        const units = parseFloat(totVolStr);
        if (!isNaN(units) && last) {
            volume = units * last;
        }
    }

    const calculatePctChange = (current: number, previous: number) => {
      if (!previous) return 0;
      return (current - previous) / previous;
    };

    const changePct1d = percentageChange / 100;
    const changePctRecent = calculatePctChange(last, parseFloat(getText('LastWeekClosePrice') || '0'));
    const recentChangeDays = 7;
    const changePct1m = calculatePctChange(last, parseFloat(getText('LastMonthClosePrice') || '0'));
    const changePct3m = calculatePctChange(last, parseFloat(getText('Last3MonthsAgoClosePrice') || '0'));
    const changePct1y = undefined;
    const changePct3y = calculatePctChange(last, parseFloat(getText('Last3YearsAgoClosePrice') || '0'));
    const changePctYtd = parseFloat(getText('ChangeFromLastYear') || '0') / 100;

    const parsedTimestamp = timestamp ? new Date(timestamp).valueOf() : NaN;
    const effectiveTimestamp = !isNaN(parsedTimestamp) ? parsedTimestamp : now;

    const tickerData: TickerData = {
      price: last,
      openPrice,
      name: nameEn || undefined,
      nameHe: nameHe || undefined,
      currency,
      exchange: exchangeRes,
      changePct1d,
      changeDate1d: new Date(effectiveTimestamp),
      timestamp: new Date(effectiveTimestamp),
      sector: undefined,
      changePctYtd,
      changePctRecent,
      recentChangeDays,
      changePct1m,
      changePct3m,
      changePct1y,
      changePct3y,
      changePct5y: undefined,
      changePct10y: undefined,
      ticker: tickerSymbol,
      numericId: securityId || null,
      source: 'Globes',
      globesInstrumentId: globesInstrumentId ? globesInstrumentId : undefined,
      tradeTimeStatus,
      globesTypeHe: globesTypeHe || undefined,
      volume // In 'currency' units
    };

    saveToCache(cacheKey, tickerData, now);
    return tickerData;
  } catch (error) {
    console.error(`Failed to parse ticker data for ${identifier}:`, error);
    return null;
  }
}
