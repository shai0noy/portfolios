// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooStockQuote } from './yahoo';
import { fetchAllTaseTickers, DEFAULT_TASE_TYPE_CONFIG } from './stock_list';
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import type { TickerData, TaseTicker, TaseTypeConfig } from './types';

export * from './types';
export * from './stock_list';
export * from './cbs';

let taseTickersDataset: TaseTicker[] | null = null;
let taseTickersDatasetLoading: Promise<TaseTicker[]> | null = null;

export function getTaseTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<TaseTicker[]> {
  if (taseTickersDataset && !forceRefresh) {
    return Promise.resolve(taseTickersDataset);
  }
  if (taseTickersDatasetLoading) {
    return taseTickersDatasetLoading;
  }

  taseTickersDatasetLoading = (async () => {
    try {
      console.log('Loading TASE tickers dataset...');
      const tickers = await fetchAllTaseTickers(signal);
      const flattenedTickers = Object.values(tickers).flat();
      taseTickersDataset = flattenedTickers;
      console.log(`Loaded ${taseTickersDataset.length} TASE tickers across ${Object.keys(tickers).length} types.`);
      return flattenedTickers;
    } catch (e) {
      console.error('Failed to load TASE tickers dataset:', e);
      return [];
    } finally {
      taseTickersDatasetLoading = null;
    }
  })();
  return taseTickersDatasetLoading;
}

export async function getTickerData(ticker: string, exchange?: string, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  const exchangeL = exchange?.toLowerCase();
  const cacheKey = exchangeL === 'tase' ? `globes:tase:${ticker}` : `yahoo:${ticker}`;

  if (!forceRefresh && tickerDataCache.has(cacheKey)) {
    const cached = tickerDataCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  if (forceRefresh) {
    tickerDataCache.delete(cacheKey);
  }

  if (exchangeL === 'tase') {
    return fetchGlobesStockQuote(ticker, 'tase', signal);
  } else if (exchangeL) {
    return fetchYahooStockQuote(ticker, signal);
  } else {
    const isNumeric = /\d/.test(ticker);
    let data: TickerData | null = null;
    if (isNumeric) {
      data = await fetchGlobesStockQuote(ticker, 'tase', signal);
      if (data) return { ...data, exchange: 'TASE' };
      data = await fetchYahooStockQuote(ticker, signal);
      if (data) return data;
    } else {
      data = await fetchYahooStockQuote(ticker, signal);
      if (data) return data;
      data = await fetchGlobesStockQuote(ticker, 'tase', signal);
      if (data) return { ...data, exchange: 'TASE' };
    }
    console.log(`getTickerData: Ticker ${ticker} not found on any attempted exchange.`);
    return null;
  }
}
