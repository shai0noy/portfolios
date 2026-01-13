// src/lib/fetching/globes.ts
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import { fetchXml, parseXmlString } from './utils/xml_parser';
import type { TickerData } from './types';

export async function fetchGlobesStockQuote(symbol: string, securityId: number | undefined, exchange: string, signal?: AbortSignal): Promise<TickerData | null> {
  exchange = exchange.toLowerCase();
  if (exchange === 'tase' && !securityId) {
    console.warn(`fetchGlobesStockQuote: TASE requires a numeric security ID.`);
  }

  const now = Date.now();
  const identifier = (exchange === 'tase' && securityId) ? securityId.toString() : symbol.toUpperCase();
  const cacheKey = `globes:${exchange}:${identifier}`;

  const cached = tickerDataCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_data&exchange=${exchange}&ticker=${identifier}`;
  let text;
  try {
    text = await fetchXml(globesApiUrl, signal);
  } catch {
    return null;
  }

  try {
    const xmlDoc = parseXmlString(text);
    const instrument = xmlDoc.querySelector('Instrument');
    if (!instrument) {
      console.log(`Globes: No instrument found for ${identifier}`);
      return null;
    }

    const getText = (tag: string) => instrument.querySelector(tag)?.textContent || null;

    const last = parseFloat(getText('last') || '0');
    const openPrice = parseFloat(getText('openPrice') || '0');
    const name_en = getText('name_en');
    const name_he = getText('name_he');
    let currency = getText('currency') || 'ILS';
    if (currency === 'NIS') currency = 'ILS';
    const exchangeRes = getText('exchange')?.toUpperCase() || 'TASE';
    const percentageChange = parseFloat(getText('percentageChange') || '0');
    const sector = getText('industry_sector');
    const timestamp = getText('timestamp');

    const percentageChangeYear = parseFloat(getText('percentageChangeYear') || '0');
    const lastWeekClosePrice = parseFloat(getText('LastWeekClosePrice') || '0');
    const lastMonthClosePrice = parseFloat(getText('LastMonthClosePrice') || '0');
    const last3MonthsAgoClosePrice = parseFloat(getText('Last3MonthsAgoClosePrice') || '0');
    const lastYearClosePrice = parseFloat(getText('LastYearClosePrice') || '0');
    const last3YearsAgoClosePrice = parseFloat(getText('Last3YearsAgoClosePrice') || '0');

    const calculatePctChange = (current: number, previous: number) => {
      if (!previous) return 0;
      return (current - previous) / previous;
    };

    const changePct = percentageChange / 100;
    const changePctYtd = percentageChangeYear;
    const changePct1w = calculatePctChange(last, lastWeekClosePrice);
    const changePct1m = calculatePctChange(last, lastMonthClosePrice);
    const changePct3m = calculatePctChange(last, last3MonthsAgoClosePrice);
    const changePct1y = calculatePctChange(last, lastYearClosePrice);
    const changePct3y = calculatePctChange(last, last3YearsAgoClosePrice);

    const priceUnit = currency === 'ILS' ? 'agorot' : 'base';

    const tickerData: TickerData = {
      price: last,
      openPrice,
      name: name_en || undefined,
      name_he: name_he || undefined,
      currency,
      exchange: exchangeRes,
      changePct,
      priceUnit,
      timestamp: timestamp ? new Date(timestamp).valueOf() : now,
      sector: sector || undefined,
      changePctYtd,
      changePct1w,
      changePct1m,
      changePct3m,
      changePct1y,
      changePct3y,
      changePct5y: 0,
      changePct10y: 0,
    };

    tickerDataCache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;
  } catch (error) {
    console.error(`Failed to parse ticker data for ${identifier}:`, error);
    return null;
  }
}
