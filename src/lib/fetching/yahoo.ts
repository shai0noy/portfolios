// src/lib/fetching/yahoo.ts
import { fetchWithCache } from './utils/cache';
import type { TickerData, IncomeStatement, AdvancedStats } from './types';
import { Exchange, parseExchange, EXCHANGE_SETTINGS } from '../types';
import { InstrumentGroup } from '../types/instrument';
import { convertCurrency, normalizeCurrency } from '../currency';

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
  let u = ticker.toUpperCase();

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

  // Fix for MTF TASE tickers (MTF.F30 -> MTF-F30)
  if (exchange === Exchange.TASE) {
    u = u.replace(/\.(F\d+)/, '-$1');
  }

  // 4. Generate a set of "base" candidates from the clean symbol.
  const baseCandidates = new Set<string>();
  baseCandidates.add(u); // Always include the raw symbol

  if (group === InstrumentGroup.INDEX || (group === undefined && !isNumeric)) {
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

const autoRetryTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
let globalRefreshDebounceId: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoRetry(
  ticker: string,
  exchange: Exchange,
  range: '1y' | '5y' | 'max',
  group: InstrumentGroup | undefined,
  maxAge: number | undefined,
  retryAfterSec: number
) {
  const key = `${ticker}_${exchange}_${range}`;
  if (autoRetryTimeouts.has(key)) return; // Already queued

  // Wait exactly "Retry-After" seconds + a random few ms (5 to 150) as requested
  const jitterMs = Math.floor(Math.random() * (150 - 5 + 1)) + 5;
  const waitMs = (retryAfterSec * 1000) + jitterMs;

  const timeoutId = setTimeout(async () => {
    autoRetryTimeouts.delete(key);
    try {
      // Execute the fetch forcefully, bypassing short local cache errors
      const result = await fetchYahooTickerData(ticker, exchange, undefined, true, range, group, maxAge);
      if (result) {
        // Debounce a unified UI update so 50 retries don't trigger 50 renders
        if (globalRefreshDebounceId) clearTimeout(globalRefreshDebounceId);
        globalRefreshDebounceId = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('market-data-refreshed'));
        }, 1500);
      }
    } catch (e) {
      // silently fail the retry
    }
  }, waitMs);

  autoRetryTimeouts.set(key, timeoutId);
}

export async function fetchYahooTickerData(
  ticker: string,
  exchange: Exchange,
  signal?: AbortSignal,
  forceRefresh = false,
  range: '1y' | '5y' | 'max' = '5y',
  group?: InstrumentGroup,
  maxAge?: number
): Promise<TickerData | null> {
  if (exchange === Exchange.GEMEL || exchange === Exchange.PENSION || exchange === Exchange.CBS) {
    return null;
  }


  const now = Date.now();
  const cacheKey = `yahoo:quote:v7:${exchange}:${ticker}:${range}`;
  const successKey = `${exchange}:${ticker.toUpperCase()}`;
  const knownSymbol = symbolSuccessMap.get(successKey);
  const candidates = knownSymbol ? [knownSymbol] : getYahooTickerCandidates(ticker, exchange, group);

  // 1 day + up to 2 hours of jitter
  const defaultTTL = (24 * 60 * 60 * 1000) + Math.random() * (30 * 60 * 1000);
  const ttl = maxAge ?? defaultTTL;

  return fetchWithCache(
    cacheKey,
    ttl,
    forceRefresh,
    async () => {
      let hasTransientError = false;
      const results = await Promise.all(candidates.map(async (yahooTicker) => {
        const histUrl = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_hist&ticker=${yahooTicker}&range=${range}`;
        const calUrl = `https://portfolios.noy-shai.workers.dev/?apiId=yahoo_quote_summary&ticker=${encodeURIComponent(yahooTicker)}&modules=calendarEvents,incomeStatementHistory,incomeStatementHistoryQuarterly,defaultKeyStatistics,financialData,recommendationTrend,price`;

        try {
          const fetchOpts: RequestInit = { signal, cache: forceRefresh ? 'no-cache' : 'force-cache' };
          const [res, calRes] = await Promise.all([
            fetch(histUrl, fetchOpts),
            fetch(calUrl, fetchOpts).catch(() => null)
          ]);

          if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
            hasTransientError = true;
            if (res.status === 429) {
              const retryHeader = res.headers.get('Retry-After');
              const waitSec = retryHeader ? parseInt(retryHeader, 10) : 60;
              scheduleAutoRetry(ticker, exchange, range, group, maxAge, isNaN(waitSec) ? 60 : waitSec);
            }
            return null;
          }
          if (!res.ok) return null;

          const data = await res.json();
          const result = data?.chart?.result?.[0];
          if (!result) return null;

          let calData = null;
          if (calRes && calRes.ok) {
            try { calData = await calRes.json(); } catch (e) { }
          }

          return { yahooTicker, result, calData };
        } catch {
          hasTransientError = true;
          return null;
        }
      }));

      const match = results.find(r => r !== null);
      if (!match) {
        if (hasTransientError) {
          console.log(`Yahoo: Failed to get result for ${ticker} (${exchange}) but encountered transient errors. Will not cache Not Found.`);
          const err = new Error('Transient error');
          (err as any).status = 429;
          throw err;
        }
        console.log(`Yahoo: No result found for ${ticker} (${exchange}), caching as Not Found.`);
        return null;
      }

      const { yahooTicker, result, calData } = match;
      symbolSuccessMap.set(successKey, yahooTicker);

      try {
        const quote = result.indicators?.quote?.[0];
        const timestamps = result.timestamp || [];
        let closes = quote?.close || [];
        let openPrices = quote?.open || [];
        let highPrices = quote?.high || [];
        let lowPrices = quote?.low || [];
        const periodVolumes = quote?.volume || [];
        let adjCloses = result.indicators?.adjclose?.[0]?.adjclose || [];

        const getLatestValidValue = (arr: (number | null)[], cutoffDays = 40) => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (timestamps[i] < Date.now() / 1000 - cutoffDays * 24 * 60 * 60) {
              return null;
            }
            if (arr[i] !== null && arr[i] !== undefined) {
              return arr[i];
            }
          }
          return null;
        };

        const meta = result.meta;
        const price = meta.regularMarketPrice;
        const shareVolume = meta.regularMarketVolume || getLatestValidValue(periodVolumes);
        const volume = (shareVolume && price) ? shareVolume * price : undefined;
        const openPrice = getLatestValidValue(openPrices) ?? undefined;
        const currency = meta.currency;
        const exchangeCode = meta.exchangeName || 'OTHER';
        let lastClose = getLatestValidValue(closes);

        const lastCloseIsToday = timestamps.length > 0 && (Date.now() / 1000 - timestamps[timestamps.length - 1]) < 24 * 60 * 60;
        if (lastClose === price && lastCloseIsToday && closes?.length > 1) {
          lastClose = closes[closes.length - 2];
        }

        if (exchange === Exchange.TASE && meta.instrumentType !== "EQUITY") {
          // Handle a rare case where price points are in ILS.
          if (closes?.length > 0 && closes[closes.length - 1] < price / 90
            && openPrices?.length > 0 && openPrices[openPrices.length - 1] < price / 90
            && adjCloses?.length > 0 && adjCloses[adjCloses.length - 1] < price / 90) {
            closes = closes.map((c: number) => c ? c * 100 : c);
            openPrices = openPrices.map((c: number) => c ? c * 100 : c);
            adjCloses = adjCloses.map((c: number) => c ? c * 100 : c);
            highPrices = highPrices.map((c: number) => c ? c * 100 : c);
            lowPrices = lowPrices.map((c: number) => c ? c * 100 : c);
          }
        }

        let mappedExchange: Exchange;
        try {
          mappedExchange = parseExchange(YAHOO_EXCHANGE_MAP[exchangeCode.toUpperCase()] || exchangeCode);
        } catch {
          mappedExchange = exchange;
        }

        const longName = meta.longName || meta.shortName;
        let changePct1d = lastClose !== null && lastClose !== 0 ? (price - lastClose) / lastClose : undefined;

        let changePctRecent, changePct1m, changeDate1m, changePct3m, changeDate3m, changePct1y, changeDate1y, changePct3y, changeDate3y, changePct5y, changeDate5y, changePctYtd, changeDateYtd, changePctMax, changeDateMax;

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
            adjClose: adjCloses[i],
            open: openPrices[i],
            high: highPrices[i],
            low: lowPrices[i],
            volume: periodVolumes[i]
          })).filter((p: any) => p.close != null && p.time != null);

          historical = points.map((p: any) => ({
            date: new Date(p.time * 1000),
            price: p.close,
            adjClose: p.adjClose,
            open: p.open,
            high: p.high,
            low: p.low,
            volume: p.volume
          }));

          if (points.length > 0) {
            const lastPoint = points[points.length - 1];
            const findClosestPoint = (targetTs: number) => {
              if (targetTs < points[0].time - 86400 * 5) return null; // Too far back
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

            const calcChange = (p: any) => (!p || Math.abs(p.time * 1000 - lastPoint.time * 1000) < 86400 * 1000) ? { pct: undefined, date: undefined } : { pct: (price - p.close) / p.close, date: new Date(p.time * 1000) };

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

        let calendarEvents: any = undefined;
        let incomeStatementHistory: IncomeStatement[] | undefined;
        let incomeStatementHistoryQuarterly: IncomeStatement[] | undefined;

        const defaultKeyStatistics = calData?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        const financialData = calData?.quoteSummary?.result?.[0]?.financialData;
        const finCurr = financialData?.financialCurrency ? normalizeCurrency(financialData.financialCurrency) : currency;

        if (calData) {
          const calEvents = calData?.quoteSummary?.result?.[0]?.calendarEvents;
          if (calEvents) {
            const nowMs = Date.now();
            const findClosestDate = (datesArray: any[]) => {
              if (!datesArray || !datesArray.length) return undefined;
              let closest = undefined;
              let minDiff = Infinity;
              for (const d of datesArray) {
                if (d?.raw) {
                  const diff = Math.abs(d.raw * 1000 - nowMs);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closest = new Date(d.raw * 1000);
                  }
                }
              }
              return closest;
            };

            const eventMap: any = {};
            const earnings = calEvents.earnings;
            if (earnings) {
              eventMap.earningsDate = findClosestDate(earnings.earningsDate);
              eventMap.earningsCallDate = findClosestDate(earnings.earningsCallDate);
              eventMap.isEarningsDateEstimate = earnings.isEarningsDateEstimate;

              if (earnings.earningsLow?.raw !== undefined && earnings.earningsHigh?.raw !== undefined && earnings.earningsAverage?.raw !== undefined) {
                eventMap.earningsAnalystEstimate = {
                  low: earnings.earningsLow.raw,
                  high: earnings.earningsHigh.raw,
                  avg: earnings.earningsAverage.raw
                };
              }
              if (earnings.revenueLow?.raw !== undefined && earnings.revenueHigh?.raw !== undefined && earnings.revenueAverage?.raw !== undefined) {
                eventMap.revenueEstimate = {
                  low: earnings.revenueLow.raw,
                  high: earnings.revenueHigh.raw,
                  avg: earnings.revenueAverage.raw
                };
              }
            }

            if (calEvents.exDividendDate?.raw) {
              eventMap.exDividendDate = new Date(calEvents.exDividendDate.raw * 1000);
            }
            if (calEvents.dividendDate?.raw) {
              eventMap.dividendDate = new Date(calEvents.dividendDate.raw * 1000);
            }

            if (defaultKeyStatistics?.lastDividendValue?.raw !== undefined && defaultKeyStatistics?.lastDividendDate?.raw !== undefined) {
              eventMap.dividendAmount = defaultKeyStatistics.lastDividendValue.raw;
              // Check if the stock currency is ILA and the financial currency is different
              if (financialData?.financialCurrency && financialData.financialCurrency !== currency) {
                eventMap.dividendCurrency = finCurr;
              } else {
                eventMap.dividendCurrency = currency;
              }
            }

            if (Object.keys(eventMap).length > 0) {
              calendarEvents = eventMap;
            }
          }

          const parseIncomeHistory = (historyArr: any[]) => {
            if (!historyArr || !Array.isArray(historyArr)) return undefined;
            const statements: IncomeStatement[] = [];
            for (const item of historyArr) {
              if (item.endDate?.raw) {
                statements.push({
                  endDate: new Date(item.endDate.raw * 1000),
                  totalRevenue: item.totalRevenue?.raw,
                  grossProfit: item.grossProfit?.raw,
                  operatingIncome: item.operatingIncome?.raw,
                  ebit: item.ebit?.raw,
                  netIncome: item.netIncome?.raw
                });
              }
            }
            if (statements.length > 0) {
              return statements.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
            }
            return undefined;
          };

          const incomeHistory = calData?.quoteSummary?.result?.[0]?.incomeStatementHistory?.incomeStatementHistory;
          if (incomeHistory) {
            incomeStatementHistory = parseIncomeHistory(incomeHistory);
          }

          const incomeHistoryQ = calData?.quoteSummary?.result?.[0]?.incomeStatementHistoryQuarterly?.incomeStatementHistory;
          if (incomeHistoryQ) {
            incomeStatementHistoryQuarterly = parseIncomeHistory(incomeHistoryQ);
          }
        }

        let advancedStats: AdvancedStats | undefined = undefined;
        const recTrendResult = calData?.quoteSummary?.result?.[0]?.recommendationTrend?.trend;
        const priceData = calData?.quoteSummary?.result?.[0]?.price;
        const currentTrend = Array.isArray(recTrendResult) && recTrendResult.length > 0 ? recTrendResult[0] : undefined;

        if (defaultKeyStatistics || currentTrend || financialData || priceData) {
          const parseNum = (obj: any) => obj?.raw !== undefined ? obj.raw : undefined;

          advancedStats = {
            financialCurrency: finCurr,
            forwardPE: parseNum(defaultKeyStatistics?.forwardPE),
            pegRatio: parseNum(defaultKeyStatistics?.pegRatio),
            priceToBook: parseNum(defaultKeyStatistics?.priceToBook),
            profitMargins: parseNum(defaultKeyStatistics?.profitMargins) ?? parseNum(financialData?.profitMargins),
            beta: parseNum(defaultKeyStatistics?.beta),
            trailingEps: parseNum(defaultKeyStatistics?.trailingEps),
            forwardEps: parseNum(defaultKeyStatistics?.forwardEps),
            fiftyTwoWeekChange: parseNum(defaultKeyStatistics?.['52WeekChange']),
            heldPercentInsiders: parseNum(defaultKeyStatistics?.heldPercentInsiders),
            heldPercentInstitutions: parseNum(defaultKeyStatistics?.heldPercentInstitutions),
            shortPercentOfFloat: parseNum(defaultKeyStatistics?.shortPercentOfFloat),
            shortRatio: parseNum(defaultKeyStatistics?.shortRatio),
            earningsQuarterlyGrowth: parseNum(defaultKeyStatistics?.earningsQuarterlyGrowth),
            revenueQuarterlyGrowth: parseNum(defaultKeyStatistics?.revenueQuarterlyGrowth),
            sharesOutstanding: parseNum(defaultKeyStatistics?.sharesOutstanding),
            floatShares: parseNum(defaultKeyStatistics?.floatShares),
            sharesShort: parseNum(defaultKeyStatistics?.sharesShort),
            targetHighPrice: parseNum(financialData?.targetHighPrice),
            numberOfAnalystOpinions: parseNum(financialData?.numberOfAnalystOpinions),
            targetLowPrice: parseNum(financialData?.targetLowPrice),
            targetMeanPrice: parseNum(financialData?.targetMeanPrice),
            targetMedianPrice: parseNum(financialData?.targetMedianPrice),
            recommendationMean: parseNum(financialData?.recommendationMean),
            totalCash: parseNum(financialData?.totalCash),
            totalCashPerShare: parseNum(financialData?.totalCashPerShare),
            totalDebt: parseNum(financialData?.totalDebt),
            quickRatio: parseNum(financialData?.quickRatio),
            currentRatio: parseNum(financialData?.currentRatio),
            totalRevenue: parseNum(financialData?.totalRevenue),
            debtToEquity: parseNum(financialData?.debtToEquity),
            returnOnAssets: parseNum(financialData?.returnOnAssets),
            returnOnEquity: parseNum(financialData?.returnOnEquity),
            freeCashflow: parseNum(financialData?.freeCashflow),
            operatingCashflow: parseNum(financialData?.operatingCashflow),
            earningsGrowth: parseNum(financialData?.earningsGrowth),
            revenueGrowth: parseNum(financialData?.revenueGrowth),
            grossMargins: parseNum(financialData?.grossMargins),
            ebitdaMargins: parseNum(financialData?.ebitdaMargins),
            operatingMargins: parseNum(financialData?.operatingMargins),
          };

          // Manual fwdPE calculation for Israeli stocks due to Yahoo API wrong values
          if (exchange === Exchange.TASE && advancedStats.forwardEps && price) {
            const priceInFinancialCurrency = convertCurrency(price, currency, finCurr);
            if (priceInFinancialCurrency && advancedStats.forwardEps > 0) {
              advancedStats.forwardPE = priceInFinancialCurrency / advancedStats.forwardEps;
            }
          }

          if (priceData) {
            advancedStats.priceInfo = {
              marketState: priceData.marketState,
              preMarketPrice: parseNum(priceData.preMarketPrice),
              preMarketChangePercent: parseNum(priceData.preMarketChangePercent),
              preMarketTime: priceData.preMarketTime,
              postMarketPrice: parseNum(priceData.postMarketPrice),
              postMarketChangePercent: parseNum(priceData.postMarketChangePercent),
              postMarketTime: priceData.postMarketTime,
              regularMarketTime: priceData.regularMarketTime,
            };
            // Clean up undefined
            Object.keys(advancedStats.priceInfo).forEach(k => (advancedStats!.priceInfo as any)[k] === undefined && delete (advancedStats!.priceInfo as any)[k]);
          }

          if (Array.isArray(recTrendResult) && recTrendResult.length > 0) {
            advancedStats.recommendationTrend = recTrendResult.map((t: any) => ({
              period: t.period || '',
              strongBuy: t.strongBuy || 0,
              buy: t.buy || 0,
              hold: t.hold || 0,
              sell: t.sell || 0,
              strongSell: t.strongSell || 0,
            }));
          }

          // Remove undefined keys
          Object.keys(advancedStats).forEach(key => (advancedStats as any)[key] === undefined && delete (advancedStats as any)[key]);
          if (Object.keys(advancedStats).length === 0) {
            advancedStats = undefined;
          }
        }

        if (dividends && dividends.length > 0) {
          dividends = dividends.map((d: any) => ({
            ...d,
            currency: currency
          }));
        }

        const tickerData: TickerData = {
          price, openPrice, name: longName, currency, exchange: mappedExchange,
          changePct1d,
          changeDate1d: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : undefined,
          changePctRecent, changePct1m, changeDate1m, changePct3m, changeDate3m, changePct1y, changeDate1y,
          changePct3y, changeDate3y, changePct5y, changeDate5y, changePctYtd, changeDateYtd, changePctMax, changeDateMax,
          timestamp: new Date(now), ticker, numericId: null, source: 'Yahoo Finance', historical, dividends, splits, volume,
          calendarEvents,
          incomeStatementHistory,
          incomeStatementHistoryQuarterly,
          advancedStats
        };

        return tickerData;
      } catch (error) {
        console.error('Error parsing Yahoo data', error);
        return null;
      }
    }, (cachedData) => !(range === 'max' && cachedData.changePctMax === undefined));
}
