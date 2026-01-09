// src/lib/fetching/yahoo.ts
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import type { TickerData } from './types';

const YAHOO_EXCHANGE_MAP: Record<string, string> = {
  'NMS': 'NASDAQ',
  'NYQ': 'NYSE',
  'ASE': 'AMEX',
  'PCX': 'ARCA',
  'BTS': 'BATS',
  // Add other mappings as needed
};

export async function fetchYahooStockQuote(ticker: string, signal?: AbortSignal): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `yahoo:${ticker}`;

  const cached = tickerDataCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_hist&ticker=${ticker}`;

  let data;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Yahoo fetch failed with status ${res.status}:`, errorBody);
      throw new Error(`Network response was not ok: ${res.statusText}`);
    }
    data = await res.json();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.log('Yahoo fetch aborted');
    } else {
      console.error('Yahoo fetch failed', e);
    }
    return null;
  }

  try {
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.log(`Yahoo: No result found for ${ticker}`);
      return null;
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    
    // Get the last open price from the indicators
    const quote = result.indicators?.quote?.[0];
    const openPrices = quote?.open || [];
    const openPrice =  openPrices.length > 0 ? openPrices[openPrices.length - 1] : null;

    const currency = meta.currency;
    const exchangeCode = meta.exchangeName;
    const exchangeName = YAHOO_EXCHANGE_MAP[exchangeCode] || exchangeCode;
    const longName = meta.longName || meta.shortName;
    const prevClose = meta.chartPreviousClose;
    let changePct = 0;
    if (price && prevClose) {
      changePct = (price - prevClose) / prevClose;
    }

    if (!price) {
      console.log(`Yahoo: No price found for ${ticker}`);
      return null;
    }

    const tickerData: TickerData = {
        price,
        openPrice,
        name: longName,
        currency,
        exchange: exchangeName,
        changePct,
        priceUnit: currency,
        timestamp: now
    };

    tickerDataCache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;

  } catch (error) {
    console.error('Error parsing Yahoo data', error);
    return null;
  }
}
