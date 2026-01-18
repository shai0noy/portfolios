// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooStockQuote } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import type { TickerData, TickerListItem } from './types';
import { Exchange, parseExchange } from '../types';

export * from './types';
export * from './stock_list';
export * from './cbs';
export * from './yahoo';
export * from './globes';


let tickersDataset: Record<string, TickerListItem[]> | null = null;
let tickersDatasetLoading: Promise<Record<string, TickerListItem[]>> | null = null;

export function getTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<Record<string, TickerListItem[]>> {
  if (tickersDataset && !forceRefresh) {
    return Promise.resolve(tickersDataset);
  }
  if (tickersDatasetLoading) {
    return tickersDatasetLoading;
  }

  tickersDatasetLoading = (async () => {
    try {
      console.log('Loading tickers dataset...');
      const exchanges = [Exchange.TASE, Exchange.NASDAQ, Exchange.NYSE, Exchange.GEMEL];
      const results = await Promise.all(exchanges.map(ex => fetchAllTickers(ex, undefined, signal)));
      
      const combined: Record<string, TickerListItem[]> = {};
      results.forEach(res => {
        Object.entries(res).forEach(([type, items]) => {
            if (!combined[type]) combined[type] = [];
            combined[type] = combined[type].concat(items);
        });
      });

      tickersDataset = combined;
      const totalCount = Object.values(combined).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
      console.log(`Loaded ${totalCount} tickers across ${Object.keys(combined).length} types and ${exchanges.length} exchanges.`);
      return combined;
    } catch (e) {
      console.error('Failed to load tickers dataset:', e);
      return {};
    } finally {
      tickersDatasetLoading = null;
    }
  })();
  return tickersDatasetLoading;
}

export async function getTickerData(ticker: string, exchange: string, numericSecurityId: number|null, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  let parsedExchange: Exchange;
  try {
    parsedExchange = parseExchange(exchange);
  } catch (e) {
    console.warn(`getTickerData: Invalid exchange '${exchange}', defaulting to NASDAQ for Yahoo fallback logic.`, e);
    return fetchYahooStockQuote(ticker, Exchange.NASDAQ, signal);
  }

  const globesTicker = numericSecurityId ? String(numericSecurityId) : ticker;
  const cacheKey = parsedExchange === Exchange.TASE ? `globes:tase:${globesTicker}` : `yahoo:${ticker}`;

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

  // Use Exchange enum for GEMEL check
  if (parsedExchange === Exchange.GEMEL) {
    console.log(`Fetching Gemelnet data for ${ticker}`);
    return fetchGemelnetQuote(Number(ticker), signal, forceRefresh);
  }

  if ([Exchange.TASE, Exchange.NYSE, Exchange.NASDAQ].includes(parsedExchange)) {
    console.log(`Fetching Globes ticker data for ${parsedExchange}:${ticker} (securityId: ${secId || 'N/A'})`);
    // @ts-ignore
    const globesData = await fetchGlobesStockQuote(ticker, secId, parsedExchange, signal);
    if (globesData) {
      return globesData;
    }
    console.log(`Globes fetch failed/empty for ${parsedExchange}:${ticker}, falling back to Yahoo.`);
  } 
  
  console.log(`Fetching Yahoo ticker data for : ${parsedExchange}:${ticker}`);
  // @ts-ignore
  return fetchYahooStockQuote(ticker, parsedExchange, signal);
}
