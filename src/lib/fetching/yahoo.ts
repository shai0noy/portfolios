// src/lib/fetching/yahoo.ts
import { CACHE_TTL, saveToCache, loadFromCache } from './utils/cache';
import { deduplicateRequest } from './utils/request_deduplicator';
import type { TickerData } from './types';
import { Exchange, parseExchange, EXCHANGE_SETTINGS } from '../types';
import { InstrumentGroup } from '../types/instrument';

/**
 * Maps Yahoo Finance exchange codes (e.g. 'NMS', 'NYQ') to canonical Exchange names.
 * Built dynamically from the aliases defined in EXCHANGE_SETTINGS.
 */
const YAHOO_EXCHANGE_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  Object.entries(EXCHANGE_SETTINGS).forEach(([ex, config]) => {
    config.aliases.forEach(alias => {
      map[alias.toUpperCase()] = ex;
    });
  });
  return map;
})();

export const ISRAEL_TICKER_OVERRIDES: Record<string, string> = {
  '147': 'MIDCAP50.TA',
  '163': 'MIDCAP120.TA',
  '143': 'TA90.TA',
  '137': '^TA125.TA',
  '142': 'TA35.TA',
  '707': 'TELBOND20.TA',
  '709': 'TELBOND60.TA',
  '170': 'TA-OG.TA',
  '148': 'TA-FIN.TA',
  '145': 'TEL-TECH.TA',
  '169': 'TA-TECH.TA',
  '167': 'TASEBM.TA',
  '164': 'TA-BANKS.TA',
  '168': 'TA-COMP.TA',
  '149': 'ESTATE15.TA'
};

/**
 * Generates a list of candidate Yahoo symbols for a given ticker, prioritized by likelihood.
 * Merges symbol formatting logic and probing logic into a single streamlined flow.
 */
export function getYahooTickerCandidates(ticker: string, exchange: Exchange, group?: InstrumentGroup): string[] {
  const u = ticker.toUpperCase();

  // 1. Handle overrides first. These are considered final.
  if (exchange === Exchange.TASE && u in ISRAEL_TICKER_OVERRIDES) {
    return [ISRAEL_TICKER_OVERRIDES[u]];
  }

  // 2. Handle symbols that are already in a specific Yahoo format.
  // This includes special prefixes/suffixes and exchange suffixes.
  if (u.startsWith('^') || u.endsWith('=X') || u.endsWith('=F')) {
    return [u];
  }

  // 3. Reject numeric-only symbols for stocks early.
  const isNumeric = /^\d+$/.test(u);
  if (isNumeric && (exchange !== Exchange.TASE || group !== InstrumentGroup.INDEX)) {
    return [];
  }

  // 4. Generate a set of "base" candidates from the clean symbol.
  const baseCandidates = new Set<string>();
  baseCandidates.add(u); // Always include the raw symbol

  if (group === InstrumentGroup.INDEX) {
    if (!isNumeric) baseCandidates.add(`^${u}`);
  }
  else if (group === InstrumentGroup.FOREX || exchange === Exchange.FOREX) {
    // Forex is special: it doesn't get exchange suffixes, so handle and return.
    const candidates = new Set<string>([u]);
    if (u.length === 6) {
      const base = u.substring(0, 3);
      const quote = u.substring(3, 6);
      if (quote === 'USD') candidates.add(`${base}-USD`);
      candidates.add(`${u}=X`);
    } else {
      candidates.add(`${u}=X`);
    }
    return Array.from(candidates);
  }
  else if (group === InstrumentGroup.COMMODITY) {
    baseCandidates.add(`${u}=F`);
  }

  // 5. Apply exchange suffix to all generated candidates.
  const suffix = EXCHANGE_SETTINGS[exchange]?.yahooFinanceSuffix || '';

  if (!suffix) return Array.from(baseCandidates);

  const finalCandidates = new Set<string>();

  // Add suffixed candidates first for priority
  baseCandidates.forEach(c => {
    if (c.endsWith(suffix)) {
      finalCandidates.add(c);
    } else {
      finalCandidates.add(`${c}${suffix}`);
    }
  });

  return Array.from(finalCandidates);
}

/**
 * Legacy wrapper for candidates[0].
 */
export function toYahooSymbol(ticker: string, exchange: Exchange): string {
  return getYahooTickerCandidates(ticker, exchange)[0];
}

// In-memory map to remember which Yahoo symbol worked for a given (Ticker, Exchange) pair.
const symbolSuccessMap = new Map<string, string>();

/**
 * Returns a Yahoo Finance symbol that is known to work for the given ticker/exchange,
 * or the most likely one based on standard rules.
 */
export function getVerifiedYahooSymbol(ticker: string, exchange: Exchange): string {
  const successKey = `${exchange}:${ticker.toUpperCase()}`;
  return symbolSuccessMap.get(successKey) || toYahooSymbol(ticker, exchange);
}

export async function fetchYahooTickerData(
  ticker: string,
  exchange: Exchange,
  signal?: AbortSignal,
  forceRefresh = false,
  range: '1y' | '5y' | 'max' = '5y',
  group?: InstrumentGroup
): Promise<TickerData | null> {
  if (exchange === Exchange.GEMEL || exchange === Exchange.PENSION || exchange === Exchange.CBS) {
    return null;
  }

  const now = Date.now();
  const cacheKey = `yahoo:quote:v4:${exchange}:${ticker}:${range}`;
  const successKey = `${exchange}:${ticker.toUpperCase()}`;
  const knownSymbol = symbolSuccessMap.get(successKey);

  if (!forceRefresh) {
    const cached = await loadFromCache<TickerData>(cacheKey);
    if (cached?.timestamp && (now - new Date(cached.timestamp).getTime() < CACHE_TTL)) {
      if (!(range === 'max' && cached.data.changePctMax === undefined)) {
        return { ...cached.data, fromCache: true };
      }
    }
  }

  const candidates = knownSymbol ? [knownSymbol] : getYahooTickerCandidates(ticker, exchange, group);

  return deduplicateRequest(cacheKey, async () => {
    const results = await Promise.all(candidates.map(async (yahooTicker) => {
      const url = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_hist&ticker=${yahooTicker}&range=${range}`;
      try {
        const res = await fetch(url, { signal, cache: forceRefresh ? 'no-cache' : 'force-cache' });
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
      const shareVolume = meta.regularMarketVolume || (result.indicators?.quote?.[0]?.volume?.slice(-1)[0]);
      const volume = (shareVolume && price) ? shareVolume * price : undefined;
      const quote = result.indicators?.quote?.[0];
      const openPrices = quote?.open || [];
      const openPrice = openPrices.length > 0 ? openPrices[openPrices.length - 1] : null;
      const currency = meta.currency;
      const exchangeCode = meta.exchangeName || 'OTHER';

      let mappedExchange: Exchange;
      try {
        mappedExchange = parseExchange(YAHOO_EXCHANGE_MAP[exchangeCode.toUpperCase()] || exchangeCode);
      } catch {
        mappedExchange = exchange;
      }

      const longName = meta.longName || meta.shortName;
      const prevClose = meta.previousClose || meta.chartPreviousClose;
      const granularity = meta.dataGranularity;

      let changePct1d: number | undefined;
      if (price && meta.previousClose) {
        changePct1d = (price - meta.previousClose) / meta.previousClose;
      } else if (price && prevClose && granularity === '1d') {
        changePct1d = (price - prevClose) / prevClose;
      } else if (quote?.close) {
        const validCloses = quote.close.filter((c: any) => c != null);
        if (validCloses.length >= 2) {
          const last = validCloses[validCloses.length - 1];
          const prev = validCloses[validCloses.length - 2];
          changePct1d = ((price || last) - prev) / prev;
        }
      }

      let changePctRecent, changePct1m, changeDate1m, changePct3m, changeDate3m, changePct1y, changeDate1y, changePct3y, changeDate3y, changePct5y, changeDate5y, changePctYtd, changeDateYtd, changePctMax, changeDateMax;

      const closes = quote?.close || [];
      const adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [];
      const timestamps = result.timestamp || [];
      let historical, dividends, splits;

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
        const points = timestamps.map((t: number, i: number) => ({
          time: t,
          close: closes[i],
          adjClose: adjCloses[i]
        })).filter((p: any) => p.close != null && p.time != null);

        historical = points.map((p: any) => ({
          date: new Date(p.time * 1000),
          price: p.close,
          adjClose: p.adjClose
        }));

        if (points.length > 0) {
          const lastPoint = points[points.length - 1];
          const currentClose = price || lastPoint.close;

          const findClosestPoint = (targetTs: number) => {
            let closest = points[0], minDiff = Math.abs(points[0].time - targetTs);
            for (let i = 1; i < points.length; i++) {
              const diff = Math.abs(points[i].time - targetTs);
              if (diff < minDiff) { minDiff = diff; closest = points[i]; }
            }
            return closest;
          };

          const getDateAgo = (amount: number, unit: 'days' | 'months' | 'years') => {
            const d = new Date(lastPoint.time * 1000);
            if (unit === 'days') d.setUTCDate(d.getUTCDate() - amount);
            else if (unit === 'months') d.setUTCMonth(d.getUTCMonth() - amount);
            else if (unit === 'years') d.setUTCFullYear(d.getUTCFullYear() - amount);
            return d.getTime() / 1000;
          };

          const calcChange = (p: any) => (!p ? { pct: undefined, date: undefined } : { pct: (currentClose - p.close) / p.close, date: new Date(p.time * 1000) });

          // Calculate 1 Week Ago (Recent)
          const w1 = findClosestPoint(getDateAgo(7, 'days'));
          const res1w = calcChange(w1); changePctRecent = res1w.pct;

          const m1 = findClosestPoint(getDateAgo(1, 'months')), m3 = findClosestPoint(getDateAgo(3, 'months')), y1 = findClosestPoint(getDateAgo(1, 'years')), y3 = findClosestPoint(getDateAgo(3, 'years')), y5 = findClosestPoint(getDateAgo(5, 'years'));

          const res1m = calcChange(m1); changePct1m = res1m.pct; changeDate1m = res1m.date;
          const res3m = calcChange(m3); changePct3m = res3m.pct; changeDate3m = res3m.date;
          const res1y = calcChange(y1); changePct1y = res1y.pct; changeDate1y = res1y.date;
          const res3y = calcChange(y3); changePct3y = res3y.pct; changeDate3y = res3y.date;
          const res5y = calcChange(y5); changePct5y = res5y.pct; changeDate5y = res5y.date;

          const targetYtd = new Date(lastPoint.time * 1000); targetYtd.setUTCMonth(0, 1); targetYtd.setUTCHours(0, 0, 0, 0);
          const resYtd = calcChange(findClosestPoint(targetYtd.getTime() / 1000)); changePctYtd = resYtd.pct; changeDateYtd = resYtd.date;
          const resMax = calcChange(points[0]); changePctMax = resMax.pct; changeDateMax = resMax.date;
        }
      }

      if (!price) return null;

      const tickerData: TickerData = {
        price, openPrice, name: longName, currency, exchange: mappedExchange,
        changePct1d, changePctRecent, changePct1m, changeDate1m, changePct3m, changeDate3m, changePct1y, changeDate1y,
        changePct3y, changeDate3y, changePct5y, changeDate5y, changePctYtd, changeDateYtd, changePctMax, changeDateMax,
        timestamp: new Date(now), ticker, numericId: null, source: 'Yahoo Finance', historical, dividends, splits, volume,
      };

      await saveToCache(cacheKey, tickerData, now);
      return tickerData;
    } catch (error) {
      console.error('Error parsing Yahoo data', error);
      return null;
    }
  });
}