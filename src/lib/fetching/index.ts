// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooTickerData } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
import { fetchPensyanetQuote } from './pensyanet';
import type { TickerData } from './types';
import { Exchange, parseExchange } from '../types';
import type { TickerProfile } from '../types/ticker';

export * from './types';
export * from './stock_list';
export * from './cbs';
export * from './yahoo';
export * from './globes';
export * from './gemelnet';
export * from './pensyanet';


let tickersDataset: Record<string, TickerProfile[]> | null = null;
let tickersDatasetLoading: Promise<Record<string, TickerProfile[]>> | null = null;

export function getTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<Record<string, TickerProfile[]>> {
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
      
      const combined: Record<string, TickerProfile[]> = {};
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

  const [yahooData1y, yahooDataMax] = await Promise.all([
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '1y'),
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, 'max')
  ]);

  let yahooData: TickerData | null = null;
  if (yahooData1y || yahooDataMax) {
      if (!yahooData1y) yahooData = yahooDataMax;
      else if (!yahooDataMax) yahooData = yahooData1y;
      else {
          // Merge: use 1y for recent stats/precision, max for long term
          yahooData = {
              ...yahooDataMax,
              ...yahooData1y,
              // Explicitly ensure long term stats come from Max
              changePct3y: yahooDataMax.changePct3y,
              changeDate3y: yahooDataMax.changeDate3y,
              changePct5y: yahooDataMax.changePct5y,
              changeDate5y: yahooDataMax.changeDate5y,
              changePctMax: yahooDataMax.changePctMax,
              changeDateMax: yahooDataMax.changeDateMax,
              // Use 1y historical for better immediate chart resolution (fetchTickerHistory will update with full hybrid later)
              historical: yahooData1y.historical
          };
      }
  }

  let globesPromise: Promise<TickerData | null>;
  let taseInfoPromise: Promise<any | undefined> = Promise.resolve(undefined);

  if (parsedExchange === Exchange.TASE) {
    // Note: getTickersDataset now returns TickerProfile[], so we need to adjust how we look up TaseInfo
    const lookupPromise = getTickersDataset(signal).then(dataset => {
      for (const list of Object.values(dataset)) {
        const found = list.find(t => 
          t.exchange === Exchange.TASE && 
          (t.symbol === ticker || (secId && t.securityId === String(secId)))
        );
        if (found) return found;
      }
      return undefined;
    }).catch(e => {
      console.warn('Error looking up TASE info:', e);
      return undefined;
    });

    taseInfoPromise = lookupPromise.then(item => item?.meta?.type === 'TASE' ? item.meta : undefined);

    if (secId) {
      globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
    } else {
      // If we don't have securityId, we try to find it from the dataset
      globesPromise = lookupPromise.then(item => {
        const sid = item?.securityId ? Number(item.securityId) : undefined;
        if (!sid) return null;
        return fetchGlobesStockQuote(ticker, sid, parsedExchange, signal, forceRefresh);
      });
    }
  } else {
    globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh);
  }

  const [globesData, _unusedYahoo, _unusedTaseInfo] = await Promise.all([
    globesPromise,
    Promise.resolve(yahooData),
    taseInfoPromise
  ]);

  // Fallback to Yahoo if the first source fails, or merge data if both succeed.
  if (!globesData) {
    if (yahooData) {
      return { ...yahooData };
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
      changeDate1d: globesData.changePct1d !== undefined ? globesData.changeDate1d : yahooData.changeDate1d,

      changePctRecent: globesData.changePctRecent ?? yahooData.changePctRecent,
      changeDateRecent: globesData.changePctRecent !== undefined ? globesData.changeDateRecent : yahooData.changeDateRecent,
      recentChangeDays: globesData.changePctRecent !== undefined ? globesData.recentChangeDays : yahooData.recentChangeDays,

      changePct1m: globesData.changePct1m ?? yahooData.changePct1m,
      changeDate1m: globesData.changePct1m !== undefined ? globesData.changeDate1m : yahooData.changeDate1m,

      changePct3m: globesData.changePct3m ?? yahooData.changePct3m,
      changeDate3m: globesData.changePct3m !== undefined ? globesData.changeDate3m : yahooData.changeDate3m,

      changePct1y: globesData.changePct1y ?? yahooData.changePct1y,
      changeDate1y: globesData.changePct1y !== undefined ? globesData.changeDate1y : yahooData.changeDate1y,

      changePct3y: globesData.changePct3y ?? yahooData.changePct3y,
      changeDate3y: globesData.changePct3y !== undefined ? globesData.changeDate3y : yahooData.changeDate3y,

      changePct5y: globesData.changePct5y ?? yahooData.changePct5y,
      changeDate5y: globesData.changePct5y !== undefined ? globesData.changeDate5y : yahooData.changeDate5y,

      changePctYtd: globesData.changePctYtd ?? yahooData.changePctYtd,
      changeDateYtd: globesData.changePctYtd !== undefined ? globesData.changeDateYtd : yahooData.changeDateYtd,

      changePctMax: globesData.changePctMax ?? yahooData.changePctMax,
      changeDateMax: globesData.changePctMax !== undefined ? globesData.changeDateMax : yahooData.changeDateMax,

      openPrice: globesData.openPrice ?? yahooData.openPrice,
      source: `${globesData.source} + Yahoo Finance`,
      sector: globesData.sector || yahooData.sector,
      subSector: globesData.subSector || yahooData.subSector,
      taseType: globesData.taseType,
      volume: globesData.volume ?? yahooData.volume,
    };
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