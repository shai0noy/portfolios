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

export type GemelnetDataPoint = FundDataPoint;
export type GemelnetFundData = FundData;

const CACHE_KEY_PREFIX = 'gemelnet_v1_';

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
          console.log(`[Gemelnet] Using cached data for fund ${fundId}`);
          return cached.data;
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
    const points: FundDataPoint[] = [];
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
      console.warn('[Gemelnet] Failed to save to cache (likely quota exceeded):', e);
    }

    return result;

  } catch (error) {
    console.error(`[Gemelnet] Failed to fetch or parse data for fund ${fundId}:`, error);
    return null;
  }
}

const LIST_CACHE_KEY = 'gemelnet_tickers_list_v3';

interface CompactTicker {
  i: number; // id
  n: string; // name
  ft: string; // fundType
  s?: string; // specialization
  ss?: string; // subSpecialization
  mf?: number; // managementFee
  df?: number; // depositFee
  x?: Record<string, any>; // Extras
}

function compressTickers(tickers: TickerListItem[]): CompactTicker[] {
  const KNOWN_KEYS = new Set(['fundId', 'managingCompany', 'fundType', 'specialization', 'subSpecialization', 'managementFee', 'depositFee']);
  
  return tickers.map(t => {
    const pInfo = t.providentInfo;
    const extras: Record<string, any> = {};
    
    if (pInfo) {
      Object.keys(pInfo).forEach(key => {
        if (!KNOWN_KEYS.has(key)) {
          console.warn(`[Gemelnet] Unexpected key in ProvidentInfo during compression: ${key} (Value: ${(pInfo as any)[key]}) for ticker ${t.symbol}`);
          extras[key] = (pInfo as any)[key];
        }
      });
    }

    const compressed: CompactTicker = {
      i: pInfo?.fundId || parseInt(t.symbol, 10),
      n: t.nameHe || t.nameEn,
      ft: pInfo?.fundType || '',
      s: pInfo?.specialization,
      ss: pInfo?.subSpecialization,
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
    exchange: Exchange.GEMEL,
    nameHe: c.n,
    nameEn: c.n,
    globesTypeCode: 'gemel_fund',
    providentInfo: {
      fundId: c.i,
      fundType: c.ft,
      specialization: c.s,
      subSpecialization: c.ss,
      managementFee: c.mf,
      depositFee: c.df,
      ...(c.x || {})
    }
  }));
}

export async function fetchGemelnetTickers(signal?: AbortSignal, forceRefresh = false): Promise<TickerListItem[]> {
  const now = Date.now();

  // 1. Check Cache
  if (!forceRefresh) {
    try {
      const cached = await loadFromCache<CompactTicker[]>(LIST_CACHE_KEY);
      if (cached) {
        if (now - cached.timestamp < GEMEL_LIST_CACHE_TTL) {
          console.log('[Gemelnet] Using cached tickers list');
          return decompressTickers(cached.data);
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
      const compressed = compressTickers(tickers);
      await saveToCache(LIST_CACHE_KEY, compressed);
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

  // Ensure fundName is populated if missing (it should be in fundData, but double check cache issues)
  if (!fundData.fundName) {
      // Name missing in cache? Try to fetch/lookup again
      const tickers = await fetchGemelnetTickers();
      const info = tickers.find(t => t.providentInfo?.fundId === fundId);
      if (info) fundData.fundName = info.nameEn || info.nameHe || '';
  }

  return calculateTickerDataFromFundHistory(fundData, Exchange.GEMEL, 'Gemelnet');
}
