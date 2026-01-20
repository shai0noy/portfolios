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
      const exchanges = [Exchange.TASE, Exchange.NASDAQ, Exchange.NYSE, Exchange.GEMEL, Exchange.FOREX];
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
    return fetchYahooStockQuote(ticker, Exchange.NASDAQ, signal, forceRefresh);
  }

  const secId = numericSecurityId ? Number(numericSecurityId) : undefined;

  // GEMEL has its own dedicated fetcher
  if (parsedExchange === Exchange.GEMEL) {
    return fetchGemelnetQuote(Number(ticker), signal, forceRefresh);
  }

  let data: TickerData | null = null;
  const globesFirstExchanges: Exchange[] = [Exchange.TASE, Exchange.NYSE, Exchange.NASDAQ, Exchange.FOREX];
  
  if (globesFirstExchanges.includes(parsedExchange)) {
    console.log(`Fetching Globes ticker data for ${parsedExchange}:${ticker}`);
    data = await fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
  }
  
  // Fallback to Yahoo if the first source fails or is not applicable
  if (!data) {
    if (globesFirstExchanges.includes(parsedExchange)) {
      console.log(`Primary source failed for ${parsedExchange}:${ticker}, falling back to Yahoo.`);
    }
    data = await fetchYahooStockQuote(ticker, parsedExchange, signal, forceRefresh);
  }

  return data;
}

export async function fetchTickerHistory(ticker: string, exchange: string, signal?: AbortSignal, forceRefresh = false): Promise<TickerData['historical']> {
  const yahooData = await fetchYahooStockQuote(ticker, parseExchange(exchange), signal, forceRefresh);
  return yahooData?.historical;
}


