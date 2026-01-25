import { fetchXml, parseXmlString } from './utils/xml_parser';
import type { TickerListItem, TickerData } from './types';
import { Exchange } from '../types';
import { 
  getDateParts, 
  parseDateStr, 
  calculateTickerDataFromFundHistory,
} from './gemel_utils';
import { 
  saveToCache, 
  loadFromCache,
  GEMEL_CACHE_TTL,
  GEMEL_LIST_CACHE_TTL
} from './utils/cache';
import type { 
  FundData, 
  FundDataPoint 
} from './gemel_utils';

export type PensyanetDataPoint = FundDataPoint;
export type PensyanetFundData = FundData;

const CACHE_KEY_PREFIX = 'pensyanet_v1_';

/**
 * Fetches historical fund data from Pensyanet.
 * Uses a local storage cache with a 48-hour TTL.
 * 
 * @param fundId The ID of the fund.
 * @param startMonth Start date for the range.
 * @param endMonth End date for the range (default: Today).
 * @param forceRefresh If true, bypasses the cache.
 */
export async function fetchPensyanetFund(
  fundId: number,
  startMonth: Date,
  endMonth: Date = new Date(),
  forceRefresh = false
): Promise<FundData | null> {
  const sParts = getDateParts(startMonth);
  const eParts = getDateParts(endMonth);
  const cacheKey = `${CACHE_KEY_PREFIX}${fundId}_${sParts.year}${sParts.month}_${eParts.year}${eParts.month}`;
  const now = Date.now();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const cached = await loadFromCache<FundData>(cacheKey);
      if (cached) {
        if (now - cached.timestamp < GEMEL_CACHE_TTL) {
          console.log(`[Pensyanet] Using cached data for fund ${fundId}`);
          return cached.data;
        }
      }
    } catch (e) {
      console.warn('[Pensyanet] Error reading cache:', e);
    }
  }

  // 2. Fetch Data
  const url = `https://portfolios.noy-shai.workers.dev/?apiId=pensyanet_fund&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}&fundId=${fundId}`;
  
  console.log(`[Pensyanet] Fetching data for fund ${fundId}...`);
  
  try {
    const [xmlText, tickersList] = await Promise.all([
      fetchXml(url),
      fetchPensyanetTickers() // This uses its own cache, so it's efficient
    ]);
    const xmlDoc = parseXmlString(xmlText);
    
    // Pensyanet XML response uses 'ROW' (uppercase)
    const rows = Array.from(xmlDoc.querySelectorAll('ROW'));
    const points: FundDataPoint[] = [];
    const fundInfo = tickersList.find(t => t.providentInfo?.fundId === fundId);
    const fundName = fundInfo?.nameEn || '';

    rows.forEach(row => {
      const getText = (tag: string) => row.querySelector(tag)?.textContent || '';
      
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

    const result: FundData = {
      fundId: fundId,
      fundName,
      data: points,
      lastUpdated: now
    };

    // 3. Save to Cache
    try {
      await saveToCache(cacheKey, result);
    } catch (e) {
      console.warn('[Pensyanet] Failed to save to cache (likely quota exceeded):', e);
    }

    return result;

  } catch (error) {
    console.error(`[Pensyanet] Failed to fetch or parse data for fund ${fundId}:`, error);
    return null;
  }
}

const LIST_CACHE_KEY = 'pensyanet_tickers_list_v5';

interface CompactTicker {
  i: number; // id
  n: string; // name
  ft: string; // fundType
  mf?: number; // managementFee
  df?: number; // depositFee
  x?: Record<string, any>; // Extras
}

function compressTickers(tickers: TickerListItem[]): CompactTicker[] {
  const KNOWN_KEYS = new Set(['fundId', 'managingCompany', 'fundType', 'managementFee', 'depositFee']);
  
  return tickers.map(t => {
    const pInfo = t.providentInfo;
    const extras: Record<string, any> = {};
    
    if (pInfo) {
      Object.keys(pInfo).forEach(key => {
        if (!KNOWN_KEYS.has(key)) {
          console.warn(`[Pensyanet] Unexpected key in ProvidentInfo during compression: ${key} (Value: ${(pInfo as any)[key]}) for ticker ${t.symbol}`);
          extras[key] = (pInfo as any)[key];
        }
      });
    }

    const compressed: CompactTicker = {
      i: pInfo?.fundId || parseInt(t.symbol, 10),
      n: t.nameHe || t.nameEn,
      ft: pInfo?.fundType || '',
      mf: pInfo?.managementFee,
      df: pInfo?.depositFee,
    };

    if (Object.keys(extras).length > 0) {
      compressed.x = extras;
    }
    
    return compressed;
  });
}

function decompressTickers(compact: CompactTicker[]): TickerListItem[] {
  return compact.map(c => ({
    symbol: String(c.i),
    exchange: Exchange.PENSION,
    nameHe: c.n,
    nameEn: c.n,
    globesTypeCode: 'pension_fund',
    providentInfo: {
      fundId: c.i,
      fundType: c.ft,
      managementFee: c.mf,
      depositFee: c.df,
      ...(c.x || {})
    }
  }));
}

export async function fetchPensyanetTickers(signal?: AbortSignal, forceRefresh = false): Promise<TickerListItem[]> {
  const now = Date.now();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const cached = await loadFromCache<CompactTicker[]>(LIST_CACHE_KEY);
      if (cached) {
        if (now - cached.timestamp < GEMEL_LIST_CACHE_TTL) {
          console.log('[Pensyanet] Using cached tickers list');
          return decompressTickers(cached.data);
        }
      }
    } catch (e) {
      console.warn('[Pensyanet] Cache read error', e);
    }
  }

  // 2. Fetch Data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const sParts = getDateParts(startDate);
  const eParts = getDateParts(endDate);
  const url = `https://portfolios.noy-shai.workers.dev/?apiId=pensyanet_list&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}`;

  console.log('[Pensyanet] Fetching tickers list...');
  try {
    const xmlText = await fetchXml(url, signal);
    const xmlDoc = parseXmlString(xmlText);
    const rows = Array.from(xmlDoc.querySelectorAll('ROW'));
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
        const name = getText('SHM_KRN');
        tickersMap.set(id, {
          symbol: idStr,
          exchange: Exchange.PENSION,
          nameHe: name,
          nameEn: name,
          globesTypeCode: 'pension_fund',
          providentInfo: {
            fundId: id,
            fundType: getText('SUG_KRN'),
            managementFee: parseFee(getText('SHIUR_D_NIHUL_AHARON_NCHASIM')),
            depositFee: parseFee(getText('SHIUR_D_NIHUL_AHARON_HAFKADOT')),
          }
        });
      }
    });

    const tickers = Array.from(tickersMap.values());
    try {
      const compressed = compressTickers(tickers);
      await saveToCache(LIST_CACHE_KEY, compressed);
    } catch (e) {
      console.warn('[Pensyanet] Cache write error', e);
    }
    return tickers;
  } catch (e) {
    console.error('[Pensyanet] Error fetching tickers', e);
    return [];
  }
}

export async function fetchPensyanetQuote(
  fundId: number,
  _signal?: AbortSignal,
  forceRefresh = false
): Promise<TickerData | null> {
  // Fetch history from 2000
  const endDate = new Date();
  const startDate = new Date('2000-01-01');

  const fundData = await fetchPensyanetFund(fundId, startDate, endDate, forceRefresh);
  if (!fundData || fundData.data.length === 0) {
    console.log(`[Pensyanet] fetchPensyanetQuote: No data found for ${fundId}`, fundData);
    return null;
  }

  if (!fundData.fundName) {
      // Name missing in cache? Try to fetch/lookup again
      const tickers = await fetchPensyanetTickers();
      const info = tickers.find(t => t.providentInfo?.fundId === fundId);
      if (info) fundData.fundName = info.nameEn || info.nameHe || '';
  }

  return calculateTickerDataFromFundHistory(fundData, Exchange.PENSION, 'Pensyanet');
}
