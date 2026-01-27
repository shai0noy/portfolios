// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooTickerData } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
import { fetchPensyanetQuote } from './pensyanet';
import { fetchCpi, getCbsTickers } from './cbs';
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

      // Add CBS tickers
      const cbsTickers = getCbsTickers();
      if (cbsTickers.length > 0) {
        if (!combined['Index']) combined['Index'] = [];
        combined['Index'] = combined['Index'].concat(cbsTickers);
      }

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

function combineHistory(histShort: { date: Date; price: number }[] | undefined, histMax: { date: Date; price: number }[] | undefined) {
  const hShort = histShort || [];
  const hMax = histMax || [];

  if (hShort.length === 0 && hMax.length === 0) return undefined;
  if (hShort.length === 0) return hMax;
  if (hMax.length === 0) return hShort;

  // Assume hMax covers the full range but might be lower resolution.
  // We want to use hShort (e.g. 5y daily) for the recent period and hMax for older data.
  // Find the start date of hShort
  const shortStartDate = hShort[0].date.getTime();

  // Take everything from hMax that is BEFORE hShort starts
  const olderData = hMax.filter(p => p.date.getTime() < shortStartDate);

  const combined = [...olderData, ...hShort];
  return combined.sort((a, b) => a.date.getTime() - b.date.getTime());
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
    return fetchYahooTickerData(ticker, Exchange.NASDAQ, signal, forceRefresh, '5y');
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

  // CBS has its own dedicated fetcher
  if (parsedExchange === Exchange.CBS) {
    return fetchCpi(tickerNum, signal);
  }

  const [yahooData5y, yahooDataMax] = await Promise.all([
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '5y'),
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, 'max')
  ]);

  let yahooData: TickerData | null = null;
  if (yahooData5y || yahooDataMax) {
    if (!yahooData5y) yahooData = yahooDataMax;
    else if (!yahooDataMax) yahooData = yahooData5y;
    else {
      // Merge: use 5y for recent stats/precision, max for long term
      yahooData = {
        // TODO: Make merging logic cleaner
        ...yahooDataMax,
        ...yahooData5y,
        // Explicitly ensure long term stats come from Max
        changePct3y: yahooDataMax.changePct3y,
        changeDate3y: yahooDataMax.changeDate3y,
        changePct5y: yahooDataMax.changePct5y,
        changeDate5y: yahooDataMax.changeDate5y,
        changePctMax: yahooDataMax.changePctMax,
        changeDateMax: yahooDataMax.changeDateMax,
        // Use combined historical data so the chart has max range immediately
        historical: combineHistory(yahooData5y.historical, yahooDataMax.historical),
        dividends: yahooDataMax.dividends,
        splits: yahooDataMax.splits,
        fromCache: yahooData5y.fromCache,
        fromCacheMax: yahooDataMax.fromCache
      };
    }
  }

  let globesPromise: Promise<TickerData | null>;
  let taseProfilePromise: Promise<TickerProfile | undefined> = Promise.resolve(undefined);

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

    taseProfilePromise = lookupPromise;

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

  const [globesData, _unusedYahoo, taseProfile] = await Promise.all([
    globesPromise,
    Promise.resolve(yahooData),
    taseProfilePromise
  ]);

  if (parsedExchange === Exchange.TASE && taseProfile) {
    console.log(`[getTickerData] Found TASE profile for ${ticker}:`, taseProfile);
  }

  // Fallback to Yahoo if the first source fails, or merge data if both succeed.
  if (!globesData) {
    if (yahooData) {
      return {
        ...yahooData,
        meta: taseProfile?.meta || yahooData.meta,
        type: taseProfile?.type || yahooData.type,
        name: taseProfile?.name || yahooData.name,
        nameHe: taseProfile?.nameHe || yahooData.nameHe
      };
    }
    // No data from Globes or Yahoo, but maybe we have TASE profile info
    if (taseProfile) {
      return {
        ticker: taseProfile.symbol,
        exchange: Exchange.TASE,
        numericId: taseProfile.securityId ? parseInt(taseProfile.securityId, 10) : null,
        name: taseProfile.name,
        nameHe: taseProfile.nameHe,
        type: taseProfile.type,
        meta: taseProfile.meta,
        price: 0,
        source: 'TASE Profile'
      };
    }
    return yahooData;
  }

  // Merge data: Prefer TASE Profile > Globes > Yahoo
  const finalData: TickerData = {
    ...globesData,
    meta: taseProfile?.meta || globesData.meta || yahooData?.meta,
    type: taseProfile?.type || globesData.type || yahooData?.type,
    name: taseProfile?.name || globesData.name || yahooData?.name,
    nameHe: taseProfile?.nameHe || globesData.nameHe || yahooData?.nameHe,
  };

  if (yahooData) {
    // Fill in missing fields from Yahoo.
    return {
      ...finalData,
      historical: globesData.historical ?? yahooData.historical, // Use the merged historical from yahooData if globes is missing it
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
      sector: taseProfile?.sector || globesData.sector || yahooData.sector,
      subSector: taseProfile?.subSector || globesData.subSector || yahooData.subSector,
      taseType: globesData.taseType,
      volume: globesData.volume ?? yahooData.volume,
      fromCache: yahooData.fromCache,
      fromCacheMax: yahooData.fromCacheMax
    };
  }

  return finalData;
}

export async function fetchTickerHistory(

  ticker: string,

  exchange: Exchange,

  signal?: AbortSignal,

  forceRefresh = false

): Promise<Pick<TickerData, 'historical' | 'dividends' | 'splits' | 'fromCache' | 'fromCacheMax'>> {

  const tickerNum = Number(ticker);



  if (exchange === Exchange.GEMEL) {

    const data = await fetchGemelnetQuote(tickerNum, signal, forceRefresh);

    return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };

  }



  if (exchange === Exchange.PENSION) {

    const data = await fetchPensyanetQuote(tickerNum, signal, forceRefresh);

    return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };

  }


  if (exchange === Exchange.CBS) {
    const data = await fetchCpi(tickerNum, signal);
    return { historical: data?.historical, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
  }


  const [yahooData5y, yahooDataMax] = await Promise.all([

    fetchYahooTickerData(ticker, exchange, signal, forceRefresh, '5y'),

    fetchYahooTickerData(ticker, exchange, signal, false, 'max')

  ]);



  return {

    historical: combineHistory(yahooData5y?.historical, yahooDataMax?.historical),

    dividends: yahooDataMax?.dividends,

    splits: yahooDataMax?.splits,

    fromCache: yahooData5y?.fromCache,

    fromCacheMax: yahooDataMax?.fromCache

  };

}
