// src/lib/fetching/yahoo.ts
import { tickerDataCache, CACHE_TTL } from './utils/cache';
import type { TickerData } from './types';
import { Exchange, parseExchange, toYahooFinanceTicker } from '../types';

const YAHOO_EXCHANGE_MAP: Record<string, string> = {
  'NMS': 'NASDAQ',
  'NYQ': 'NYSE',
  'ASE': 'AMEX',
  'PCX': 'ARCA',
  'BTS': 'BATS',
  // Add other mappings as needed
};

export async function fetchYahooTickerData(ticker: string, exchange: Exchange, signal?: AbortSignal, forceRefresh = false, range: '1y' | 'max' = 'max'): Promise<TickerData | null> {
  if (exchange === Exchange.GEMEL) {
    console.warn(`Yahoo fetch does not support exchange: ${exchange}`);
    return null;
  }
  const now = Date.now();
  const yahooTicker = toYahooFinanceTicker(ticker, exchange);
  const cacheKey = `yahoo:${yahooTicker}:${range}`;

  if (!forceRefresh) {
    const cached = tickerDataCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const url = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_hist&ticker=${yahooTicker}&range=${range}`;

  let data;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Yahoo fetch failed with status ${res.status}:`, errorBody);
      throw new Error(`Network response was not ok: ${res.statusText}`);
    }
    data = await res.json();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.log('Yahoo fetch aborted');
    } else {
      console.error('Yahoo fetch failed', e);
    }
    return null;
  }

  try {
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.log(`Yahoo: No result found for ${ticker}`);
      return null;
    }

    console.log(`Yahoo: Fetched raw result for ${ticker}`, result);

    const meta = result.meta;
    const price = meta.regularMarketPrice;

    // Get the last open price from the indicators
    const quote = result.indicators?.quote?.[0];
    const openPrices = quote?.open || [];
    const openPrice = openPrices.length > 0 ? openPrices[openPrices.length - 1] : null;

    const currency = meta.currency;
    const exchangeCode = meta.exchangeName || 'OTHER';
    const mappedExchange = YAHOO_EXCHANGE_MAP[exchangeCode] || exchangeCode;
    let exchange: Exchange = parseExchange(mappedExchange);
    const longName = meta.longName || meta.shortName;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const granularity = meta.dataGranularity; // e.g. "1mo"

    let changePct1d: number | undefined = undefined;
    let changePctRecent: number | undefined = undefined;
    let changeDateRecent: number | undefined = undefined;
    let recentChangeDays: number | undefined = undefined;

    // Only calculate 1D change if we have appropriate data granularity
    if (price && meta.previousClose) {
      changePct1d = (price - meta.previousClose) / meta.previousClose;
    }
    // 2. Fallback: If granularity is daily, use chartPreviousClose
    else if (price && prevClose &&  granularity === '1d') {
      changePct1d = (price - prevClose) / prevClose;
    }
    // 3. Fallback: Use the last two data points if available
    else if (result.indicators?.quote?.[0]?.close) {
      const closes = result.indicators.quote[0].close;
      const validCloses = closes.filter((c: any) => c != null);
      if (validCloses.length >= 2) {
        const last = validCloses[validCloses.length - 1];
        const prev = validCloses[validCloses.length - 2];
        // Use regularMarketPrice as current if available, else last bar close
        const current = price || last;
        changePct1d = (current - prev) / prev;
      }
    }

    let changePct1m: number | undefined;
    let changeDate1m: number | undefined;
    let changePct3m: number | undefined;
    let changeDate3m: number | undefined;
    let changePct1y: number | undefined;
    let changeDate1y: number | undefined;
    let changePct3y: number | undefined;
    let changeDate3y: number | undefined;
    let changePct5y: number | undefined;
    let changeDate5y: number | undefined;
    let changePctYtd: number | undefined;
    let changeDateYtd: number | undefined;

    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    let historical: { date: number, price: number }[] | undefined = undefined;

    if (closes.length > 0 && timestamps.length === closes.length) {
      // Filter out nulls (sometimes Yahoo returns nulls) and map to objects
      const points = timestamps.map((t: number, i: number) => ({ time: t, close: closes[i] }))
        .filter((p: any) => p.close != null && p.time != null);
      
      historical = points.map((p: { time: number; close: number }) => ({ date: p.time * 1000, price: p.close }));

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        // Use live price if available, otherwise last close
        const currentClose = price || lastPoint.close;

        // Helper to find absolute closest point in time
        // Used for 1M, 1Y etc where accuracy matters more than strict "not older than" constraint
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
          // We want the close of the previous year.
          // Timestamps are monthly starts (e.g. Dec 1).
          // Dec 1 candle represents Dec data (Close = Dec 31).
          // So we want the candle with timestamp <= Dec 31 of prev year.
          targetTime.setMonth(0); // Jan current year
          targetTime.setDate(0); // Dec 31 prev year
          return findClosestPoint(targetTime.getTime() / 1000);
        }

        const calcChangeAndDate = (prevPoint: any) => {
          if (!prevPoint) return { pct: undefined, date: undefined };
          return {
            pct: (currentClose - prevPoint.close) / prevPoint.close,
            date: prevPoint.time * 1000 // Convert to ms
          };
        };

        // Recent change: Look back 1 week
        const oneWeekAgoTs = getDateAgo(1, 'weeks');

        // Custom search for recent: Find closest point, but prefer more recent if similar distance.
        // Loop through all points to find the closest.
        // If diffs are equal (or very close), prefer the one with the larger timestamp (later index).

        let recentPoint = points[0];
        let minDiffRecent = Math.abs(points[0].time - oneWeekAgoTs);
        for (let i = 1; i < points.length; i++) {
          const diff = Math.abs(points[i].time - oneWeekAgoTs);
          if (diff <= minDiffRecent) {
            minDiffRecent = diff;
            recentPoint = points[i];
          }
        }

        // If the found point IS the last point (current), try previous to ensure non-zero change
        // This happens if the weekly data is sparse and the "closest" to 1 week ago is actually "today".
        if (recentPoint && recentPoint.time === lastPoint.time && points.length > 1) {
          const idx = points.indexOf(recentPoint);
          if (idx > 0) recentPoint = points[idx - 1];
        }

        console.log(`Yahoo: recentPoint search for ${ticker}. Target: ${new Date(oneWeekAgoTs * 1000).toISOString()}. Found: ${recentPoint ? new Date(recentPoint.time * 1000).toISOString() : 'None'}. Current: ${new Date(lastPoint.time * 1000).toISOString()}`);

        const recentRes = calcChangeAndDate(recentPoint);
        // Ensure we found a point, AND it's not the current live point (to avoid 0% change)
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
      exchange,
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
      changePct10y: undefined,
      timestamp: now,
      ticker,
      numericId: null,
      source: 'Yahoo Finance',
      historical,
    };

    tickerDataCache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;

  } catch (error) {
    console.error('Error parsing Yahoo data', error);
    return null;
  }
}
