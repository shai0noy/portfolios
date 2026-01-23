// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooTickerData } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
import { fetchPensyanetQuote } from './pensyanet';
import type { TickerData, TickerListItem, TaseInfo } from './types';
import { Exchange, parseExchange } from '../types';

export * from './types';
export * from './stock_list';
export * from './cbs';
export * from './yahoo';
export * from './globes';
export * from './gemelnet';
export * from './pensyanet';


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
      const exchanges = [Exchange.TASE, Exchange.NASDAQ, Exchange.NYSE, Exchange.GEMEL, Exchange.PENSION, Exchange.FOREX];
      const results = await Promise.all(exchanges.map(ex => fetchAllTickers(ex, undefined, signal)));
      
      const combined: Record<string, TickerListItem[]> = {};
      results.forEach(res => {
        Object.entries(res).forEach(([type, items]) => {
            if (!combined[type]) combined[type] = [];
            combined[type] = combined[type].concat(items);
        });
      });

      tickersDataset = combined;
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

export async function getTickerData(
  ticker: string,
  exchange: string,
  numericSecurityId: number | null,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<TickerData | null> {
  let parsedExchange: Exchange;
  try {
    parsedExchange = parseExchange(exchange);
  } catch (e) {
    console.warn(`getTickerData: Invalid exchange '${exchange}', defaulting to NASDAQ for Yahoo fallback logic.`, e);
    // For invalid exchange, we can only try yahoo.
    return fetchYahooTickerData(ticker, Exchange.NASDAQ, signal, forceRefresh, '1y');
  }

  const secId = numericSecurityId ? Number(numericSecurityId) : undefined;
  const tickerNum = Number(ticker);

  // GEMEL has its own dedicated fetcher
  if (parsedExchange === Exchange.GEMEL) {
    return fetchGemelnetQuote(tickerNum, signal, forceRefresh);
  }

  // PENSION has its own dedicated fetcher
  if (parsedExchange === Exchange.PENSION) {
    return fetchPensyanetQuote(tickerNum, signal, forceRefresh);
  }

  const yahooPromise = fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '1y');

  let globesPromise: Promise<TickerData | null>;
  let taseInfoPromise: Promise<TaseInfo | undefined> = Promise.resolve(undefined);

  if (parsedExchange === Exchange.TASE) {
    const lookupPromise = getTickersDataset(signal).then(dataset => {
      for (const list of Object.values(dataset)) {
        const found = list.find(t => 
          t.exchange === Exchange.TASE && 
          (t.symbol === ticker || (secId && t.taseInfo?.securityId === secId))
        );
        if (found) return found;
      }
      return undefined;
    }).catch(e => {
      console.warn('Error looking up TASE info:', e);
      return undefined;
    });

    taseInfoPromise = lookupPromise.then(item => item?.taseInfo);

    if (secId) {
      globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
    } else {
      globesPromise = lookupPromise.then(item => {
        return fetchGlobesStockQuote(ticker, item?.taseInfo?.securityId, parsedExchange, signal, forceRefresh);
      });
    }
  } else {
    globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
  }

  const [globesData, yahooData, taseInfo] = await Promise.all([
    globesPromise,
    yahooPromise,
    taseInfoPromise
  ]);

  const taseSector = taseInfo?.companySector;
  const taseSubSector = taseInfo?.companySubSector;

  // Fallback to Yahoo if the first source fails, or merge data if both succeed.
  if (!globesData) {
    if (yahooData) {
      return { ...yahooData, sector: taseSector, subSector: taseSubSector };
    }
    return yahooData;
  }

  if (yahooData) {
    // Merge data: Globes data is primary, fill in missing fields from Yahoo.
    return {
      ...globesData,
      historical: globesData.historical ?? yahooData.historical,
      dividends: globesData.dividends ?? yahooData.dividends,
      splits: globesData.splits ?? yahooData.splits,
      changePct1d: globesData.changePct1d ?? yahooData.changePct1d,
      changePctRecent: globesData.changePctRecent ?? yahooData.changePctRecent,
      changeDateRecent: globesData.changeDateRecent ?? yahooData.changeDateRecent,
      recentChangeDays: globesData.recentChangeDays ?? yahooData.recentChangeDays,
      changePct1m: globesData.changePct1m ?? yahooData.changePct1m,
      changePct3m: globesData.changePct3m ?? yahooData.changePct3m,
      changePct1y: globesData.changePct1y ?? yahooData.changePct1y,
      changePct3y: globesData.changePct3y ?? yahooData.changePct3y,
      changePct5y: globesData.changePct5y ?? yahooData.changePct5y,
      changePctYtd: globesData.changePctYtd ?? yahooData.changePctYtd,
      openPrice: globesData.openPrice ?? yahooData.openPrice,
      source: `${globesData.source} + Yahoo Finance`,
      sector: taseSector || globesData.sector || yahooData.sector,
      subSector: taseSubSector,
    };
  }

  if (taseInfo) {
    return { ...globesData, sector: taseSector, subSector: taseSubSector };
  }

  return globesData;
}

export async function fetchTickerHistory(
  ticker: string,
  exchange: string,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<Pick<TickerData, 'historical' | 'dividends' | 'splits'>> {
  const parsedExchange = parseExchange(exchange);
  const tickerNum = Number(ticker);

  if (parsedExchange === Exchange.GEMEL) {
    const data = await fetchGemelnetQuote(tickerNum, signal, forceRefresh);
    return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits };
  }

  if (parsedExchange === Exchange.PENSION) {
    const data = await fetchPensyanetQuote(tickerNum, signal, forceRefresh);
    return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits };
  }

  const [yahooData1y, yahooDataMax] = await Promise.all([
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '1y'),
    fetchYahooTickerData(ticker, parsedExchange, signal, false, 'max')
  ]);

  const hist1y = yahooData1y?.historical || [];
  const histMax = yahooDataMax?.historical || [];

  if (hist1y.length === 0 && histMax.length === 0) {
    return { historical: undefined, dividends: undefined, splits: undefined };
  }

  const lastDate = histMax.length > 0 ? histMax[histMax.length - 1].date : new Date();
  const oneYearAgoTs = new Date(lastDate).setFullYear(new Date(lastDate).getFullYear() - 1);
  
  const olderData = histMax.filter(p => p.date.getTime() < oneYearAgoTs);
  const recentData = hist1y.length > 0 ? hist1y : histMax.filter(p => p.date.getTime() >= oneYearAgoTs);
  
  const combined = [...olderData, ...recentData];
  const uniqueMap = new Map<number, { date: Date; price: number }>();
  
  for (const point of combined) {
    uniqueMap.set(point.date.getTime(), point);
  }
  
  const mergedHistorical = Array.from(uniqueMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    historical: mergedHistorical,
    dividends: yahooDataMax?.dividends,
    splits: yahooDataMax?.splits,
  };
}