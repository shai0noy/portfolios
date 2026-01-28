// src/lib/fetching/yahoo.ts
import { CACHE_TTL, saveToCache, loadFromCache } from './utils/cache';
import { deduplicateRequest } from './utils/request_deduplicator';
import type { TickerData } from './types';
import { Exchange, parseExchange, toYahooSymbol, EXCHANGE_SETTINGS } from '../types';
import { InstrumentGroup } from '../types/instrument';

/**
 * Maps Yahoo Finance exchange codes (e.g. 'NMS', 'NYQ') to canonical Exchange names.
 * Built dynamically from the aliases defined in EXCHANGE_SETTINGS.
 */
const YAHOO_EXCHANGE_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {
    // Manual overrides or special cases if needed
  };
  
  Object.entries(EXCHANGE_SETTINGS).forEach(([ex, config]) => {
    config.aliases.forEach(alias => {
      map[alias.toUpperCase()] = ex;
    });
  });
  
  return map;
})();

// In-memory map to remember which Yahoo symbol worked for a given (Ticker, Exchange) pair.
// This prevents trying multiple candidates repeatedly in the same session.
const symbolSuccessMap = new Map<string, string>();

/**
 * Returns a Yahoo Finance symbol that is known to work for the given ticker/exchange,
 * or the most likely one based on standard rules.
 */
export function getVerifiedYahooSymbol(ticker: string, exchange: Exchange): string {
  const successKey = `${exchange}:${ticker.toUpperCase()}`;
  return symbolSuccessMap.get(successKey) || toYahooSymbol(ticker, exchange);
}

function getYahooCandidates(ticker: string, exchange: Exchange, group?: InstrumentGroup): string[] {
  const candidates: string[] = [];
  const tickerUC = ticker.toUpperCase();

  // 1. Primary candidate from our standard logic
  candidates.push(toYahooSymbol(ticker, exchange));

  // 2. Fallbacks for indices and currencies
  // If we know it's an index or forex, or it looks like one, try common variations.
  const isForex = exchange === Exchange.FOREX || group === InstrumentGroup.FOREX;
  const isIndex = group === InstrumentGroup.INDEX || tickerUC.startsWith('^');

  if (isForex) {
    // Try toggling =X
    candidates.push(tickerUC.endsWith('=X') ? tickerUC.slice(0, -2) : `${tickerUC}=X`);
  } else if (isIndex) {
    // Try toggling the index prefix '^' regardless of exchange
    candidates.push(tickerUC.startsWith('^') ? tickerUC.slice(1) : `^${tickerUC}`);
  } else if (exchange === Exchange.TASE) {
    // Special case for TASE: often users don't know if it's an index or stock
    if (!tickerUC.startsWith('^')) candidates.push(`^${tickerUC}`);
  }

  return Array.from(new Set(candidates));
}

export async function fetchYahooTickerData(
  ticker: string, 
  exchange: Exchange, 
  signal?: AbortSignal, 
  forceRefresh = false, 
  range: '1y' | '5y' | 'max' = '5y',
  group?: InstrumentGroup
): Promise<TickerData | null> {
  if (exchange === Exchange.GEMEL || exchange === Exchange.PENSION) {
    console.warn(`Yahoo fetch does not support exchange: ${exchange}`);
    return null;
  }
  
  const now = Date.now();
  const cacheKey = `yahoo:quote:v3:${exchange}:${ticker}:${range}`;

  // 1. Check Success Map (In-memory)
  const successKey = `${exchange}:${ticker.toUpperCase()}`;
  const knownSymbol = symbolSuccessMap.get(successKey);
  
  // 2. Check Cache
  if (!forceRefresh) {
    const cached = await loadFromCache<TickerData>(cacheKey);
    if (cached) {
      if (cached.timestamp && (now - new Date(cached.timestamp).getTime() < CACHE_TTL)) {
         if (range === 'max' && cached.data.changePctMax === undefined) {
            // Fall through to fetch
         } else {
            return { ...cached.data, fromCache: true };
         }
      }
    }
  }

  const candidates = knownSymbol ? [knownSymbol] : getYahooCandidates(ticker, exchange, group);

  return deduplicateRequest(cacheKey, async () => {
    // Try candidates in parallel
    const results = await Promise.all(candidates.map(async (yahooTicker) => {
        const url = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_hist&ticker=${yahooTicker}&range=${range}`;
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) return null;
          const data = await res.json();
          const result = data?.chart?.result?.[0];
          if (!result) return null;
          return { yahooTicker, result };
        } catch {
          return null;
        }
    }));

    const match = results.find(r => r !== null);
    if (!match) {
        console.log(`Yahoo: No result found for ${ticker} (${exchange}) after trying candidates: ${candidates.join(', ')}`);
        return null;
    }

    const { yahooTicker, result } = match;
    symbolSuccessMap.set(successKey, yahooTicker);

    try {
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      
      // Volume extraction (Monetary Volume)
      const shareVolume = meta.regularMarketVolume || (result.indicators?.quote?.[0]?.volume?.slice(-1)[0]);
      const volume = (shareVolume && price) ? shareVolume * price : undefined;

      // Get the last open price from the indicators
      const quote = result.indicators?.quote?.[0];
      const openPrices = quote?.open || [];
      const openPrice = openPrices.length > 0 ? openPrices[openPrices.length - 1] : null;

      const currency = meta.currency;
      const exchangeCode = meta.exchangeName || 'OTHER';
      let mappedExchange: Exchange;
      try {
        mappedExchange = parseExchange(YAHOO_EXCHANGE_MAP[exchangeCode.toUpperCase()] || exchangeCode);
      } catch (e) {
        console.warn(`Yahoo: Unknown exchange '${exchangeCode}' for ${ticker}, falling back to requested exchange ${exchange}`);
        mappedExchange = exchange;
      }
      const longName = meta.longName || meta.shortName;
      const prevClose = meta.previousClose || meta.chartPreviousClose;
      const granularity = meta.dataGranularity; // e.g. "1mo"

      let changePct1d: number | undefined = undefined;
      let changePctRecent: number | undefined = undefined;
      let changeDateRecent: Date | undefined = undefined;
      let recentChangeDays: number | undefined = undefined;

      // Only calculate 1D change if we have appropriate data granularity
      if (price && meta.previousClose) {
        changePct1d = (price - meta.previousClose) / meta.previousClose;
      }
      // 2. Fallback: If granularity is daily, use chartPreviousClose
      else if (price && prevClose && granularity === '1d') {
        changePct1d = (price - prevClose) / prevClose;
      }
      // 3. Fallback: Use the last two data points if available
      else if (result.indicators?.quote?.[0]?.close) {
        const closesList = result.indicators.quote[0].close;
        const validCloses = closesList.filter((c: any) => c != null);
        if (validCloses.length >= 2) {
          const last = validCloses[validCloses.length - 1];
          const prev = validCloses[validCloses.length - 2];
          // Use regularMarketPrice as current if available, else last bar close
          const current = price || last;
          changePct1d = (current - prev) / prev;
        }
      }

      let changePct1m: number | undefined;
      let changeDate1m: Date | undefined;
      let changePct3m: number | undefined;
      let changeDate3m: Date | undefined;
      let changePct1y: number | undefined;
      let changeDate1y: Date | undefined;
      let changePct3y: number | undefined;
      let changeDate3y: Date | undefined;
      let changePct5y: number | undefined;
      let changeDate5y: Date | undefined;
      let changePctYtd: number | undefined;
      let changeDateYtd: Date | undefined;
      let changePctMax: number | undefined;
      let changeDateMax: Date | undefined;

      const closes = result.indicators?.quote?.[0]?.close || [];
      const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [];
      const timestamps = result.timestamp || [];
      let historical: { date: Date, price: number, adjClose?: number }[] | undefined = undefined;
      let dividends: TickerData['dividends'] = undefined;
      let splits: TickerData['splits'] = undefined;

      if (result.events) {
        if (result.events.dividends) {
          dividends = Object.values(result.events.dividends).map((d: any) => ({
            amount: d.amount,
            date: new Date(d.date * 1000),
          })).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
        if (result.events.splits) {
          splits = Object.values(result.events.splits).map((s: any) => ({
            date: new Date(s.date * 1000),
            numerator: s.numerator,
            denominator: s.denominator,
          })).sort((a, b) => b.date.getTime() - a.date.getTime());
        }
      }

      if (closes.length > 0 && timestamps.length === closes.length) {
        // Filter out nulls (sometimes Yahoo returns nulls) and map to objects
        const points = timestamps.map((t: number, i: number) => ({ 
            time: t, 
            close: closes[i],
            adjClose: adjCloses[i] 
        })).filter((p: any) => p.close != null && p.time != null);

        historical = points.map((p: { time: number; close: number, adjClose?: number }) => ({ 
            date: new Date(p.time * 1000), 
            price: p.close,
            adjClose: p.adjClose
        }));

        if (points.length > 0) {
          const lastPoint = points[points.length - 1];
          // Use live price if available, otherwise last close
          const currentClose = price || lastPoint.close;

          // Helper to find absolute closest point in time
          const findClosestPoint = (targetTs: number) => {
            if (points.length === 0) return null;
            let closest = points[0];
            let minDiff = Math.abs(points[0].time - targetTs);

            for (let i = 1; i < points.length; i++) {
              const diff = Math.abs(points[i].time - targetTs);
              if (diff < minDiff) {
                minDiff = diff;
                closest = points[i];
              }
            }
            return closest;
          };

          const getDateAgo = (amount: number, unit: 'days' | 'weeks' | 'months' | 'years') => {
            const targetTime = new Date(lastPoint.time * 1000);
            if (unit === 'days') {
              targetTime.setDate(targetTime.getDate() - amount);
            } else if (unit === 'weeks') {
              targetTime.setDate(targetTime.getDate() - (amount * 7));
            } else if (unit === 'months') {
              targetTime.setMonth(targetTime.getMonth() - amount);
            } else if (unit === 'years') {
              targetTime.setFullYear(targetTime.getFullYear() - amount);
            }
            return targetTime.getTime() / 1000;
          };

          const findYtdClose = () => {
            const targetTime = new Date(lastPoint.time * 1000);
            targetTime.setMonth(0); // Jan current year
            targetTime.setDate(0); // Dec 31 prev year
            return findClosestPoint(targetTime.getTime() / 1000);
          }

          const calcChangeAndDate = (prevPoint: any) => {
            if (!prevPoint) return { pct: undefined, date: undefined };
            return {
              pct: (currentClose - prevPoint.close) / prevPoint.close,
              date: new Date(prevPoint.time * 1000) // Convert to Date object
            };
          };

          // Recent change: Look back 1 week
          const oneWeekAgoTs = getDateAgo(1, 'weeks');

          let recentPoint = points[0];
          let minDiffRecent = Math.abs(points[0].time - oneWeekAgoTs);
          for (let i = 1; i < points.length; i++) {
            const diff = Math.abs(points[i].time - oneWeekAgoTs);
            if (diff <= minDiffRecent) {
              minDiffRecent = diff;
              recentPoint = points[i];
            }
          }

          if (recentPoint && recentPoint.time === lastPoint.time && points.length > 1) {
            const idx = points.indexOf(recentPoint);
            if (idx > 0) recentPoint = points[idx - 1];
          }

          const recentRes = calcChangeAndDate(recentPoint);
          if (recentRes.pct !== undefined && recentPoint && recentPoint.time < lastPoint.time) {
            changePctRecent = recentRes.pct;
            changeDateRecent = recentRes.date;
            recentChangeDays = Math.round((lastPoint.time - recentPoint.time) / 86400);
          }

          const res1m = calcChangeAndDate(findClosestPoint(getDateAgo(1, 'months')));
          changePct1m = res1m.pct; changeDate1m = res1m.date;

          const res3m = calcChangeAndDate(findClosestPoint(getDateAgo(3, 'months')));
          changePct3m = res3m.pct; changeDate3m = res3m.date;

          const res1y = calcChangeAndDate(findClosestPoint(getDateAgo(1, 'years')));
          changePct1y = res1y.pct; changeDate1y = res1y.date;

          const res3y = calcChangeAndDate(findClosestPoint(getDateAgo(3, 'years')));
          changePct3y = res3y.pct; changeDate3y = res3y.date;

          const res5y = calcChangeAndDate(findClosestPoint(getDateAgo(5, 'years')));
          changePct5y = res5y.pct; changeDate5y = res5y.date;

          const ytdPoint = findYtdClose();
          const resYtd = calcChangeAndDate(ytdPoint);
          changePctYtd = resYtd.pct; changeDateYtd = resYtd.date;

          const resMax = calcChangeAndDate(points[0]);
          changePctMax = resMax.pct; changeDateMax = resMax.date;
        }
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
        exchange: mappedExchange,
        changePct1d,
        changePctRecent,
        changeDateRecent,
        recentChangeDays,
        changePct1m,
        changeDate1m,
        changePct3m,
        changeDate3m,
        changePct1y,
        changeDate1y,
        changePct3y,
        changeDate3y,
        changePct5y,
        changeDate5y,
        changePctYtd,
        changeDateYtd,
        changePctMax,
        changeDateMax,
        changePct10y: undefined,
        timestamp: new Date(now),
        ticker,
        numericId: null,
        source: 'Yahoo Finance',
        historical,
        dividends,
        splits,
        volume,
      };

      await saveToCache(cacheKey, tickerData, now);
      return tickerData;

    } catch (error) {
      console.error('Error parsing Yahoo data', error);
      return null;
    }
  });
}