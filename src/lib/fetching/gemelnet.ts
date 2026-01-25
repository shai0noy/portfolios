import { fetchXml, parseXmlString } from './utils/xml_parser';
import type { TickerListItem, TickerData } from './types';
import { Exchange } from '../types';


export interface GemelnetDataPoint {
  date: number; // Unix timestamp (start of month)
  nominalReturn: number; // Percentage return (TSUA_NOMINALI_BFOAL)
}

export interface GemelnetFundData {
  fundId: number;
  fundName: string;
  data: GemelnetDataPoint[];
  lastUpdated: number;
}

const CACHE_KEY_PREFIX = 'gemelnet_v1_';
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours

// Helper to get date parts
function getDateParts(date: Date): { year: string, month: string } {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return { year: y, month: m };
}

// Helper to parse YYYYMM to timestamp (returns End of Month)
function parseDateStr(dateStr: string): number {
  if (!dateStr || dateStr.length !== 6) return 0;
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed in JS Date
  // Day 0 of next month is the last day of the current month
  return new Date(y, m + 1, 0).getTime();
}

/**
 * Fetches historical fund data from Gemelnet.
 * Uses a local storage cache with a 48-hour TTL.
 * 
 * @param fundId The ID of the fund.
 * @param startMonth Start date for the range.
 * @param endMonth End date for the range (default: Today).
 * @param forceRefresh If true, bypasses the cache.
 */
export async function fetchGemelnetFund(
  fundId: number,
  startMonth: Date,
  endMonth: Date = new Date(),
  forceRefresh = false
): Promise<GemelnetFundData | null> {
  const sParts = getDateParts(startMonth);
  const eParts = getDateParts(endMonth);
  const cacheKey = `${CACHE_KEY_PREFIX}${fundId}_${sParts.year}${sParts.month}_${eParts.year}${eParts.month}`;
  const now = Date.now();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached: GemelnetFundData = JSON.parse(cachedRaw);
        if (now - cached.lastUpdated < CACHE_TTL) {
          console.log(`[Gemelnet] Using cached data for fund ${fundId}`);
          return cached;
        }
      }
    } catch (e) {
      console.warn('[Gemelnet] Error reading cache:', e);
    }
  }

  // 2. Fetch Data
  // Note: Direct calls to gemelnet.cma.gov.il may fail in a browser due to CORS.
  // We use our worker proxy to bypass this.
  const url = `https://portfolios.noy-shai.workers.dev/?apiId=gemelnet_fund&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}&fundId=${fundId}`;
  
  console.log(`[Gemelnet] Fetching data for fund ${fundId}...`);
  
  try {
    const [xmlText, tickersList] = await Promise.all([
      fetchXml(url),
      fetchGemelnetTickers() // This uses its own cache, so it's efficient
    ]);
    const xmlDoc = parseXmlString(xmlText);
    
    const rows = Array.from(xmlDoc.querySelectorAll('Row'));
    const points: GemelnetDataPoint[] = [];
    const fundInfo = tickersList.find(t => t.providentInfo?.fundId === fundId);
    const fundName = fundInfo?.nameEn || '';

    rows.forEach(row => {
      const getText = (tag: string) => row.querySelector(tag)?.textContent || '';
      
      const idKupaStr = getText('ID_KUPA');
      if (!idKupaStr || parseInt(idKupaStr, 10) !== fundId) {
        return;
      }

      const dateStr = getText('TKF_DIVUACH');
      if (dateStr) {
        const returnStr = getText('TSUA_NOMINALI_BFOAL');
        points.push({
          date: parseDateStr(dateStr),
          nominalReturn: returnStr ? parseFloat(returnStr) : 0
        });
      }
    });

    // Sort by date ascending
    points.sort((a, b) => a.date - b.date);

    const result: GemelnetFundData = {
      fundId: fundId,
      fundName,
      data: points,
      lastUpdated: now
    };

    // 3. Save to Cache
    try {
      localStorage.setItem(cacheKey, JSON.stringify(result));
    } catch (e) {
      console.warn('[Gemelnet] Failed to save to cache (likely quota exceeded):', e);
    }

    return result;

  } catch (error) {
    console.error(`[Gemelnet] Failed to fetch or parse data for fund ${fundId}:`, error);
    return null;
  }
}

const LIST_CACHE_KEY = 'gemelnet_tickers_list';
const LIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function fetchGemelnetTickers(signal?: AbortSignal, forceRefresh = false): Promise<TickerListItem[]> {
  const now = Date.now();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const cachedRaw = localStorage.getItem(LIST_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (now - cached.timestamp < LIST_CACHE_TTL) {
          console.log('[Gemelnet] Using cached tickers list');
          return cached.data;
        }
      }
    } catch (e) {
      console.warn('[Gemelnet] Cache read error', e);
    }
  }

  // 2. Fetch Data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const sParts = getDateParts(startDate);
  const eParts = getDateParts(endDate);
  const url = `https://portfolios.noy-shai.workers.dev/?apiId=gemelnet_list&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}`;

  console.log('[Gemelnet] Fetching tickers list...');
  try {
    const xmlText = await fetchXml(url, signal);
    const xmlDoc = parseXmlString(xmlText);
    const rows = Array.from(xmlDoc.querySelectorAll('Row'));
    const tickersMap = new Map<number, TickerListItem>();
    const parseFee = (feeStr: string): number | undefined => {
        const fee = parseFloat(feeStr);
        return isNaN(fee) ? undefined : fee;
      };
    rows.forEach(row => {
      const getText = (tag: string) => row.querySelector(tag)?.textContent || '';
      const idStr = getText('ID');
      const id = parseInt(idStr, 10);
      if (id && !tickersMap.has(id)) {
        const name = getText('SHM_KUPA');
        tickersMap.set(id, {
          symbol: idStr,
          exchange: Exchange.GEMEL,
          nameHe: name,
          nameEn: name,
          globesTypeCode: 'gemel_fund',
          providentInfo: {
            fundId: id,
            fundType: getText('SUG_KUPA'),
            specialization: getText('HITMAHUT_RASHIT'),
            subSpecialization: getText('HITMAHUT_MISHNIT'),
            managementFee: parseFee(getText('SHIUR_DMEI_NIHUL_AHARON')),
            depositFee: parseFee(getText('SHIUR_D_NIHUL_AHARON_HAFKADOT')),
          }
        });
      }
    });

    const tickers = Array.from(tickersMap.values());
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ timestamp: now, data: tickers }));
    } catch (e) {
      console.warn('[Gemelnet] Cache write error', e);
    }
    return tickers;
  } catch (e) {
    console.error('[Gemelnet] Error fetching tickers', e);
    return [];
  }
}

export async function fetchGemelnetQuote(
  fundId: number,
  _signal?: AbortSignal,
  forceRefresh = false
): Promise<TickerData | null> {
  // Fetch history from 2000
  const endDate = new Date();
  const startDate = new Date('2000-01-01');

  const fundData = await fetchGemelnetFund(fundId, startDate, endDate, forceRefresh);
  if (!fundData || fundData.data.length === 0) {
    console.log(`[Gemelnet] fetchGemelnetQuote: No data found for ${fundId}`, fundData);
    return null;
  }

  let fundName = fundData.fundName;
  if (!fundName) {
      // Name missing in cache? Try to fetch/lookup again
      const tickers = await fetchGemelnetTickers();
      const info = tickers.find(t => t.providentInfo?.fundId === fundId);
      if (info) fundName = info.nameEn || info.nameHe || '';
  }

  // Sort by date ascending for index calculation
  const sortedData = [...fundData.data].sort((a, b) => a.date - b.date);
  
  // Build Price Index (Map: YYYY-MM -> { price, date })
  const priceMap = new Map<string, { price: number, date: number }>();
  let currentPrice = 100;
  const historical: { date: Date, price: number }[] = [];

  const getKey = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  for (const point of sortedData) {
      currentPrice *= (1 + point.nominalReturn / 100);
      priceMap.set(getKey(point.date), { price: currentPrice, date: point.date });
      historical.push({ date: new Date(point.date), price: currentPrice });
  }

  const latestPoint = sortedData[sortedData.length - 1];
  const latestPrice = currentPrice;
  
  const getChange = (months: number) => {
      const d = new Date(latestPoint.date);
      d.setDate(1); // Set to 1st of month to avoid overflow when subtracting months from 31st
      d.setMonth(d.getMonth() - months);
      const base = priceMap.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      return base ? { pct: latestPrice / base.price - 1, date: base.date } : undefined;
  };

  const [chg1m, chg3m, chg1y, chg3y, chg5y, chg10y] = [1, 3, 12, 36, 60, 120].map(getChange);

  // YTD
  const lastYear = new Date(latestPoint.date).getFullYear();
  const currYear = new Date().getFullYear();
  let chgYtd: { pct: number, date: number } | undefined;
  
  if (lastYear < currYear) {
      chgYtd = { pct: 0, date: new Date(currYear, 0, 1).getTime() };
  } else {
      const base = priceMap.get(`${lastYear - 1}-12`) || (() => {
          const first = sortedData.find(d => new Date(d.date).getFullYear() === lastYear);
          if (!first) return undefined;
          const startPrice = priceMap.get(getKey(first.date))!.price / (1 + first.nominalReturn / 100);
          return { price: startPrice, date: first.date };
      })();
      if (base) chgYtd = { pct: latestPrice / base.price - 1, date: base.date };
  }

  // Max
  const first = sortedData[0];
  const startPrice = priceMap.get(getKey(first.date))!.price / (1 + first.nominalReturn / 100);
  const chgMax = { pct: latestPrice / startPrice - 1, date: first.date };

  const tickerData: TickerData = {
    ticker: String(fundId),
    numericId: fundId,
    exchange: Exchange.GEMEL,
    price: latestPrice,
    ...(chg1m && { changePct1m: chg1m.pct, changeDate1m: new Date(chg1m.date) }),
    ...(chg3m && { changePct3m: chg3m.pct, changeDate3m: new Date(chg3m.date) }),
    ...(chgYtd && { changePctYtd: chgYtd.pct, changeDateYtd: new Date(chgYtd.date) }),
    ...(chg1y && { changePct1y: chg1y.pct, changeDate1y: new Date(chg1y.date) }),
    ...(chg3y && { changePct3y: chg3y.pct, changeDate3y: new Date(chg3y.date) }),
    ...(chg5y && { changePct5y: chg5y.pct, changeDate5y: new Date(chg5y.date) }),
    ...(chg10y && { changePct10y: chg10y.pct, changeDate10y: new Date(chg10y.date) }),
    ...(chgMax && { changePctMax: chgMax.pct, changeDateMax: new Date(chgMax.date) }),
    timestamp: new Date(latestPoint.date),
    currency: 'ILS', // Could also be 'ILA', doesn't matter due to lack of real price
    name: fundName,
    nameHe: fundName,
    source: 'Gemelnet',
    historical,
  };
  return tickerData;
}