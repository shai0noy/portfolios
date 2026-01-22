// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooTickerData } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
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
    // For invalid exchange, we can only try yahoo.
    return fetchYahooTickerData(ticker, Exchange.NASDAQ, signal, forceRefresh, '1y');
  }

  const secId = numericSecurityId ? Number(numericSecurityId) : undefined;

  // GEMEL has its own dedicated fetcher
  if (parsedExchange === Exchange.GEMEL) {
    return fetchGemelnetQuote(Number(ticker), signal, forceRefresh);
  }

  let data: TickerData | null = null;
  const globesFirstExchanges: Exchange[] = [Exchange.TASE, Exchange.NYSE, Exchange.NASDAQ, Exchange.FOREX];
  
  // Start fetching from Yahoo immediately, but we'll await it later.
  // We fetch 1y data for the main ticker view for recent performance stats.
  const yahooDataPromise = fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '1y');

  if (globesFirstExchanges.includes(parsedExchange)) {
    console.log(`Fetching Globes ticker data for ${parsedExchange}:${ticker}`);
    data = await fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
  }
  
  const yahooData = await yahooDataPromise;

  // Fallback to Yahoo if the first source fails, or merge data if both succeed.
  if (!data) {
    if (globesFirstExchanges.includes(parsedExchange)) {
      console.log(`Primary source failed for ${parsedExchange}:${ticker}, falling back to Yahoo.`);
    }
    data = yahooData;
  } else if (yahooData) {
     // Merge data: Globes data is primary, fill in missing fields from Yahoo.
    data = {
      ...data,
      historical: data.historical ?? yahooData.historical,
      dividends: data.dividends ?? yahooData.dividends,
      splits: data.splits ?? yahooData.splits,
      changePct1d: data.changePct1d ?? yahooData.changePct1d,
      changePct1m: data.changePct1m ?? yahooData.changePct1m,
      changePct3m: data.changePct3m ?? yahooData.changePct3m,
      changePct1y: data.changePct1y ?? yahooData.changePct1y,
      changePct3y: data.changePct3y ?? yahooData.changePct3y,
      changePct5y: data.changePct5y ?? yahooData.changePct5y,
      changePctYtd: data.changePctYtd ?? yahooData.changePctYtd,
      openPrice: data.openPrice ?? yahooData.openPrice,
      source: `${data.source} + Yahoo Finance`,
    };
  }

  return data;
}

export async function fetchTickerHistory(ticker: string, exchange: string, signal?: AbortSignal, forceRefresh = false): Promise<Pick<TickerData, 'historical' | 'dividends' | 'splits'>> {
  const parsedExchange = parseExchange(exchange);

  if (parsedExchange === Exchange.GEMEL) {
    console.log(`[fetchTickerHistory] Fetching Gemel history for ${ticker}`);
    const data = await fetchGemelnetQuote(Number(ticker), signal, forceRefresh);
    console.log(`[fetchTickerHistory] Got Gemel data:`, data?.historical?.length);
    return {
      historical: data?.historical,
      dividends: data?.dividends,
      splits: data?.splits,
    };
  }

  // Fetch 1-year data, with forceRefresh if requested by the user.
  const yahooData1yPromise = fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '1y');

  // Fetch max data (including events), but don't force refresh (rely on existing cache).
  const yahooDataMaxPromise = fetchYahooTickerData(ticker, parsedExchange, signal, false, 'max');

  const [yahooData1y, yahooDataMax] = await Promise.all([yahooData1yPromise, yahooDataMaxPromise]);

  const hist1y = yahooData1y?.historical;
  const histMax = yahooDataMax?.historical;

  let mergedHistorical: TickerData['historical'] = undefined;

  if (hist1y || histMax) {
    const lastDate = histMax && histMax.length > 0 ? histMax[histMax.length - 1].date : new Date();
    const oneYearAgoTs = new Date(lastDate).setFullYear(new Date(lastDate).getFullYear() - 1);
    
    const olderData = histMax ? histMax.filter(p => p.date.getTime() < oneYearAgoTs) : [];
    const recentData = hist1y || (histMax ? histMax.filter(p => p.date.getTime() >= oneYearAgoTs) : []);
    
    const merged = [...olderData, ...recentData];
    
    const uniqueMap = new Map<number, { date: Date; price: number }>();
    for (const point of merged) {
      uniqueMap.set(point.date.getTime(), point);
    }
    
    const uniqueMerged = Array.from(uniqueMap.values());
    uniqueMerged.sort((a, b) => a.date.getTime() - b.date.getTime());
    mergedHistorical = uniqueMerged;
  }

  return {
    historical: mergedHistorical,
    dividends: yahooDataMax?.dividends,
    splits: yahooDataMax?.splits,
  };
}