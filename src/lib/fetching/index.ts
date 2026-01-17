// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooStockQuote } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import type { TickerData, TaseTicker } from './types';

export * from './types';
export * from './stock_list';
export * from './cbs';
export * from './yahoo';
export * from './globes';


let taseTickersDataset: Record<string, TaseTicker[]> | null = null;
let taseTickersDatasetLoading: Promise<Record<string, TaseTicker[]>> | null = null;

export function getTaseTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<Record<string, TaseTicker[]>> {
  if (taseTickersDataset && !forceRefresh) {
    return Promise.resolve(taseTickersDataset);
  }
  if (taseTickersDatasetLoading) {
    return taseTickersDatasetLoading;
  }

  taseTickersDatasetLoading = (async () => {
    try {
      console.log('Loading tickers dataset...');
      const exchanges = ['TASE', 'NASDAQ', 'NYSE', 'IL_FUND'];
      const results = await Promise.all(exchanges.map(ex => fetchAllTickers(ex, undefined, signal)));
      
      const combined: Record<string, TaseTicker[]> = {};
      results.forEach(res => {
        Object.entries(res).forEach(([type, items]) => {
            if (!combined[type]) combined[type] = [];
            combined[type] = combined[type].concat(items);
        });
      });

      taseTickersDataset = combined;
      const totalCount = Object.values(combined).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
      console.log(`Loaded ${totalCount} tickers across ${Object.keys(combined).length} types and ${exchanges.length} exchanges.`);
      return combined;
    } catch (e) {
      console.error('Failed to load tickers dataset:', e);
      return {};
    } finally {
      taseTickersDatasetLoading = null;
    }
  })();
  return taseTickersDatasetLoading;
}

export async function getTickerData(ticker: string, exchange: string, numericSecurityId: number|null, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  const exchangeL = exchange?.toLowerCase();
  const globesTicker = numericSecurityId ? String(numericSecurityId) : ticker;
  const cacheKey = exchangeL === 'tase' ? `globes:tase:${globesTicker}` : `yahoo:${ticker}`;

  if (!forceRefresh && tickerDataCache.has(cacheKey)) {
    const cached = tickerDataCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  if (forceRefresh) {
    tickerDataCache.delete(cacheKey);
  }

  const secId = numericSecurityId ? Number(numericSecurityId) : undefined;
  if (exchangeL === 'tase') {
    console.log(`Fetching TASE ticker data for ${exchangeL}:${ticker} (securityId: ${secId || 'N/A'})`);
    return fetchGlobesStockQuote(ticker, secId, 'tase', signal);
  } else if (exchangeL) {
    console.log(`Fetching Yahoo ticker data for : ${exchangeL}:${ticker}`);
    return fetchYahooStockQuote(ticker, signal);
  }

  return null;
}
