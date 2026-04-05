import { deduplicateRequest } from './utils/request_deduplicator';
import { interpolateSparseHistory } from './utils/interpolate';
// src/lib/fetching/index.ts
import { fetchGlobesStockQuote } from './globes';
import { fetchYahooTickerData } from './yahoo';
import { fetchAllTickers } from './stock_list';
import { fetchGemelnetQuote } from './gemelnet';
import { fetchPensyanetQuote } from './pensyanet';
import { fetchCpi, getCbsTickers } from './cbs';
import { fetchBoiData, getBoiTickers } from './boi';
import { normalizeTaseTicker } from './utils/normalization';
import { getPredefinedYahooTickers } from './yahoo_tickers';
import type { TickerData } from './types';
import { Exchange, parseExchange } from '../types';
import type { TickerProfile } from '../types/ticker';
import { InstrumentClassification, InstrumentType } from '../types/instrument';

export * from './types';
export * from './stock_list';
export * from './cbs';
export * from './yahoo';
export * from './yahoo_tickers';
export * from './globes';
export * from './gemelnet';
export * from './pensyanet';
export * from './yahoo_search';
export * from './boi';

let tickersDataset: Record<string, TickerProfile[]> | null = null;

export function getTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<Record<string, TickerProfile[]>> {
  if (tickersDataset && !forceRefresh) {
    return Promise.resolve(tickersDataset);
  }

  return deduplicateRequest('tickersDataset', async () => {
    try {
      const exchanges = Object.values(Exchange).filter((ex) => ex !== Exchange.CBS);
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

      // Add BOI tickers
      const boiTickers = getBoiTickers();
      if (boiTickers.length > 0) {
        if (!combined['Index']) combined['Index'] = [];
        combined['Index'] = combined['Index'].concat(boiTickers);
      }

      // Add Cash (ILS)
      if (!combined['Currency']) combined['Currency'] = [];
      combined['Currency'].push({
        symbol: 'ILS',
        exchange: Exchange.CASH,
        name: 'Cash (ILS)',
        nameHe: 'מזומן (שקל חדש)',
        type: new InstrumentClassification(InstrumentType.CURRENCY, 'Cash')
      });

      // Add Predefined Yahoo Tickers (Futures, Commodities)
      const yahooTickers = getPredefinedYahooTickers();
      yahooTickers.forEach((t: TickerProfile) => {
        const groupName = t.type.nameEn; // Use the English name of the classification as group
        if (!combined[groupName]) combined[groupName] = [];
        combined[groupName].push(t);
      });

      tickersDataset = combined;
      return combined;
    } catch (e) {
      console.error('Failed to load tickers dataset:', e);
      return tickersDataset || {};
    }
  });
}

function combineHistory(histShort: { date: Date; price: number }[] | undefined, histMax: { date: Date; price: number }[] | undefined) {
  const hShort = histShort || [];
  const hMax = histMax || [];

  if (hShort.length === 0 && hMax.length === 0) return undefined;
  if (hShort.length === 0) return interpolateSparseHistory(hMax);
  if (hMax.length === 0) return interpolateSparseHistory(hShort);

  // Assume hMax covers the full range but might be lower resolution.
  // We want to use hShort (e.g. 5y daily) for the recent period and hMax for older data.
  // Find the start date of hShort
  const shortStartDate = hShort[0].date.getTime();

  // Take everything from hMax that is BEFORE hShort starts
  const olderData = hMax.filter(p => p.date.getTime() < shortStartDate);

  const combined = [...olderData, ...hShort];
  return interpolateSparseHistory(combined.sort((a, b) => a.date.getTime() - b.date.getTime()));
}

export async function getTickerData(
  ticker: string,
  exchange: string,
  numericSecurityId: number | null,
  signal?: AbortSignal,
  forceRefresh = false,
  maxAge?: number
): Promise<TickerData | null> {
  const reqKey = `getTickerData:${ticker}:${exchange}:${numericSecurityId}:${forceRefresh}:${maxAge}`;
  return deduplicateRequest(reqKey, async () => {
    let parsedExchange: Exchange;
    try {
      parsedExchange = parseExchange(exchange);
    } catch (e) {
      console.warn(`getTickerData: Invalid exchange '${exchange}', defaulting to NASDAQ for Yahoo fallback logic.`, e);
      // For invalid exchange, we can only try yahoo.
      return fetchYahooTickerData(ticker, Exchange.NASDAQ, signal, forceRefresh, 'max').then(detectStaleDayChange);
    }

    const secId = numericSecurityId ? Number(numericSecurityId) : undefined;

    // CASH has its own dedicated treatment
    if (parsedExchange === Exchange.CASH && ticker === 'ILS') {
      return {
        ticker: 'ILS',
        exchange: Exchange.CASH,
        numericId: null,
        price: 1,
        currency: 'ILS',
        name: 'Cash (ILS)',
        nameHe: 'מזומן (שקל חדש)',
        change: 0,
        changePercent: 0,
        provider: 'STATIC'
      } as unknown as TickerData;
    }

    // Normalize TASE ticker if needed (remove leading zeros)
    if (parsedExchange === Exchange.TASE && ticker) {
      ticker = normalizeTaseTicker(ticker);
    }

    const tickerNum = Number(ticker);

    // Lookup profile to determine group/type for smart fetching
    const profileLookupPromise = getTickersDataset(signal).then(dataset => {
      for (const list of Object.values(dataset)) {
        const found = list.find(t =>
          t.exchange === parsedExchange &&
          (t.symbol === ticker || (secId && t.securityId === secId) || (!isNaN(tickerNum) && t.securityId === tickerNum))
        );
        if (found) return found;
      }
      return undefined;
    }).catch(e => {
      console.warn('Error looking up ticker profile:', e);
      return undefined;
    });

    // GEMEL has its own dedicated fetcher
    if (parsedExchange === Exchange.GEMEL) {
      return fetchGemelnetQuote(tickerNum, signal, forceRefresh).then((data: any) => data ? { ...data, historical: interpolateSparseHistory(data.historical) } : data).then(detectStaleDayChange);
    }

    // PENSION has its own dedicated fetcher
    if (parsedExchange === Exchange.PENSION) {
      return fetchPensyanetQuote(tickerNum, signal, forceRefresh).then((data: any) => data ? { ...data, historical: interpolateSparseHistory(data.historical) } : data).then(detectStaleDayChange);
    }

    // CBS has its own dedicated fetcher
    if (parsedExchange === Exchange.CBS) {
      return fetchCpi(tickerNum, signal).then((data: any) => data ? { ...data, historical: interpolateSparseHistory(data.historical) } : data).then(detectStaleDayChange);
    }

  // BOI has its own dedicated fetcher
  if (parsedExchange === Exchange.BOI) {
    return fetchBoiData(ticker, signal).then((data: any) => data ? { ...data, historical: interpolateSparseHistory(data.historical) } : data).then(detectStaleDayChange);
  }

  const profile = await profileLookupPromise;
  const group = profile?.type.group;

  const [yahooData5y, yahooDataMax] = await Promise.all([
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, '5y', group, maxAge).catch(e => { console.warn('Yahoo 5y failed:', e); return null; }),
    fetchYahooTickerData(ticker, parsedExchange, signal, forceRefresh, 'max', group, maxAge).catch(e => { console.warn('Yahoo Max failed:', e); return null; })
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
  let taseProfilePromise: Promise<TickerProfile | undefined> = Promise.resolve(profile);

  if (parsedExchange === Exchange.TASE) {
    taseProfilePromise = Promise.resolve(profile);

    if (secId) {
      globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh).catch(e => { console.warn('Globes failed:', e); return null; });
    } else {
      // If we don't have securityId, we try to find it from the profile
      const sid = profile?.securityId;
      if (sid) {
        globesPromise = fetchGlobesStockQuote(ticker, sid, parsedExchange, signal, forceRefresh).catch(e => { console.warn('Globes failed (sid):', e); return null; });
      } else {
        globesPromise = Promise.resolve(null);
      }
    }
  } else {
    globesPromise = fetchGlobesStockQuote(ticker, secId, parsedExchange, signal, forceRefresh).catch(e => { console.warn('Globes failed:', e); return null; });
  }

  const [globesData, _unusedYahoo, taseProfile] = await Promise.all([
    globesPromise,
    Promise.resolve(yahooData),
    taseProfilePromise
  ]);

  // Fallback to Yahoo if the first source fails, or merge data if both succeed.
  if (!globesData) {
    if (yahooData) {
      return detectStaleDayChange({
        ...yahooData,
        meta: taseProfile?.meta || yahooData.meta,
        type: taseProfile?.type || yahooData.type,
        name: taseProfile?.name || yahooData.name,
        nameHe: taseProfile?.nameHe || yahooData.nameHe,
        sector: taseProfile?.sector || yahooData.sector,
        subSector: taseProfile?.subSector || yahooData.subSector,
      });
    }
    // No data from Globes or Yahoo, but maybe we have a profile from the dataset
    if (taseProfile) {
      return detectStaleDayChange({
        ticker: taseProfile.symbol,
        exchange: taseProfile.exchange,
        numericId: taseProfile.securityId ?? null,
        name: taseProfile.name,
        nameHe: taseProfile.nameHe,
        type: taseProfile.type,
        meta: taseProfile.meta,
        price: 0,
        source: `${taseProfile.exchange} Profile (Fallback)`
      });
    }
    // Absolutely no API data and no profile data. Build a barebones object.
    return detectStaleDayChange({
      ticker: ticker,
      exchange: parsedExchange,
      numericId: secId ?? null,
      price: 0,
      source: 'Missing Data Fallback'
    });
  }

  // Merge data: Prefer TASE Profile > Globes > Yahoo
  const finalData: TickerData = {
    ...globesData,
    meta: taseProfile?.meta || globesData?.meta || yahooData?.meta,
    type: taseProfile?.type || globesData?.type || yahooData?.type,
    name: taseProfile?.name || globesData?.name || yahooData?.name,
    nameHe: taseProfile?.nameHe || globesData?.nameHe || yahooData?.nameHe,
    sector: taseProfile?.sector || globesData?.sector || yahooData?.sector,
    subSector: taseProfile?.subSector || globesData?.subSector || yahooData?.subSector,
  };

  if (yahooData) {
    // Fill in missing fields from Yahoo.
    const mergedData: TickerData = {
      ...finalData,
      historical: globesData.historical ?? yahooData.historical, // Use the merged historical from yahooData if globes is missing it
      dividends: globesData.dividends ?? yahooData.dividends,
      splits: globesData.splits ?? yahooData.splits,
      calendarEvents: globesData.calendarEvents ?? yahooData.calendarEvents,
      advancedStats: globesData.advancedStats ?? yahooData.advancedStats,
      incomeStatementHistory: globesData.incomeStatementHistory ?? yahooData.incomeStatementHistory,
      incomeStatementHistoryQuarterly: globesData.incomeStatementHistoryQuarterly ?? yahooData.incomeStatementHistoryQuarterly,
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
    return detectStaleDayChange(mergedData);
  }

  return detectStaleDayChange(finalData);
  });
}

function detectStaleDayChange(data: TickerData | null): TickerData | null {
  if (!data || data.changePct1d === undefined) return data;

  const now = new Date();

  // Use changeDate1d if available, otherwise fallback to timestamp
  const date = data.changeDate1d || data.timestamp;
  if (!date) return data;

  // Calculate age of the data in hours
  const ageInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  // Consider data stale if it's more than 16 hours old.
  // This smoothly handles weekends and avoids the midnight flip issue
  // (e.g., US markets closing at 11 PM won't be stale at 1 AM).
  // 16 hours after an 11 PM close is 3 PM the next day, right before the market opens.
  // 16 hours after a 5:30 PM TASE close is 9:30 AM the next day, right before TASE opens.
  if (ageInHours > 16) {
    data.isStaleDayChange = true;
  }

  return data;
}

export async function fetchTickerHistory(
  ticker: string,
  exchange: Exchange,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<Pick<TickerData, 'historical' | 'dividends' | 'splits' | 'fromCache' | 'fromCacheMax' | 'currency' | 'advancedStats'>> {
  const reqKey = `fetchTickerHistory:${ticker}:${exchange}:${forceRefresh}`;
  return deduplicateRequest(reqKey, async () => {
    const tickerNum = Number(ticker);

    if (exchange === Exchange.GEMEL) {
      const data = await fetchGemelnetQuote(tickerNum, signal, forceRefresh);
      return { historical: interpolateSparseHistory(data?.historical), dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }

    if (exchange === Exchange.PENSION) {
      const data = await fetchPensyanetQuote(tickerNum, signal, forceRefresh);
      return { historical: interpolateSparseHistory(data?.historical), dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }

    if (exchange === Exchange.CBS) {
      const data = await fetchCpi(tickerNum, signal);
      return { historical: interpolateSparseHistory(data?.historical), fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }

    if (exchange === Exchange.BOI) {
      const data = await fetchBoiData(ticker, signal);
      return { historical: interpolateSparseHistory(data?.historical), fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }

    // Lookup profile to determine group for smart fetching
    const profile = await getTickersDataset(signal).then(dataset => {
      const tickerNum = parseInt(ticker, 10);
      for (const list of Object.values(dataset)) {
        const found = list.find(t =>
          t.exchange === exchange &&
          (t.symbol === ticker || (!isNaN(tickerNum) && t.securityId === tickerNum))
        );
        if (found) return found;
      }
      return undefined;
    }).catch(() => undefined);

    const group = profile?.type.group;

    const [yahooData5y, yahooDataMax] = await Promise.all([
      fetchYahooTickerData(ticker, exchange, signal, forceRefresh, '5y', group),
      fetchYahooTickerData(ticker, exchange, signal, false, 'max', group)
    ]);

    return {
      historical: combineHistory(yahooData5y?.historical, yahooDataMax?.historical),
      dividends: yahooDataMax?.dividends,
      splits: yahooDataMax?.splits,
      fromCache: yahooData5y?.fromCache,
      fromCacheMax: yahooDataMax?.fromCache,
      currency: yahooData5y?.currency || yahooDataMax?.currency,
      advancedStats: yahooData5y?.advancedStats || yahooDataMax?.advancedStats
    };
  });
}
