import { fetchXml, parseXmlString } from './utils/xml_parser';
import type { ProvidentInfo, TickerData } from './types';
import type { TickerProfile } from '../types/ticker';
import { Exchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
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
  const url = `https://portfolios.noy-shai.workers.dev/?apiId=gemelnet_fund&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}&fundId=${fundId}`;
  
  console.log(`[Gemelnet] Fetching data for fund ${fundId}...`);
  
  try {
    const xmlText = await fetchXml(url);
    const xmlDoc = parseXmlString(xmlText);
    
    const rows = Array.from(xmlDoc.querySelectorAll('Row'));
    const points: FundDataPoint[] = [];

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
      fundName: '', // Name is populated by the Quote wrapper
      data: points,
      lastUpdated: now,
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

const LIST_CACHE_KEY = 'gemelnet_tickers_list_v8';

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

function compressTickers(tickers: TickerProfile[]): CompactTicker[] {
  // Compression logic remains similar but operates on TickerProfile
  return tickers.map(t => {
    if (t.meta?.type !== 'PROVIDENT') return null;
    const pInfo = t.meta;

    const compressed: CompactTicker = {
      i: pInfo.fundId,
      n: t.name, // Use name, assumed hebrew/english are same or handled
      ft: t.type.specificType || '', // Store raw type
      s: t.sector, // Use sector for specialization
      ss: t.subSector, // Use subSector for subSpecialization
      mf: pInfo.managementFee,
      df: pInfo.depositFee,
    };
    
    return compressed;
  }).filter((t): t is CompactTicker => t !== null);
}

function decompressTickers(compact: CompactTicker[]): TickerProfile[] {
  return compact.map(c => ({
    symbol: String(c.i),
    exchange: Exchange.GEMEL,
    securityId: c.i,
    name: c.n,
    nameHe: c.n,
    type: new InstrumentClassification(InstrumentType.SAVING_PROVIDENT, c.ft),
    sector: c.s,
    subSector: c.ss,
    meta: {
      type: 'PROVIDENT',
      fundId: c.i,
      managementFee: c.mf,
      depositFee: c.df
    }
  }));
}

export async function fetchGemelnetTickers(signal?: AbortSignal, forceRefresh = false): Promise<TickerProfile[]> {
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
    const tickersMap = new Map<number, TickerProfile>();
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
          securityId: id,
          name: name,
          nameHe: name,
          type: new InstrumentClassification(InstrumentType.SAVING_PROVIDENT, getText('SUG_KUPA')),
          sector: getText('HITMAHUT_RASHIT'),
          subSector: getText('HITMAHUT_MISHNIT'),
          meta: {
            type: 'PROVIDENT',
            fundId: id,
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
  // 1. Fetch history and tickers list in parallel
  const endDate = new Date();
  const startDate = new Date('2000-01-01');

  const [fundData, tickers] = await Promise.all([
    fetchGemelnetFund(fundId, startDate, endDate, forceRefresh),
    fetchGemelnetTickers() // This uses its own cache, so it's efficient
  ]);

  if (!fundData || fundData.data.length === 0) {
    console.log(`[Gemelnet] fetchGemelnetQuote: No data found for ${fundId}`, fundData);
    return null;
  }

  // 2. Join with metadata from list (Fees, Name, etc.)
  const info = tickers.find(t => t.meta?.type === 'PROVIDENT' && t.meta.fundId === fundId);
  let providentInfo: ProvidentInfo | undefined;
  
  if (info) {
      fundData.fundName = info.name || info.nameHe || '';
      if (info.meta?.type === 'PROVIDENT') {
          providentInfo = {
              fundId: info.meta.fundId,
              fundType: info.type.specificType,
              specialization: info.sector,
              subSpecialization: info.subSector,
              managementFee: info.meta.managementFee,
              depositFee: info.meta.depositFee,
          };
      }
  }

  return calculateTickerDataFromFundHistory(fundData, Exchange.GEMEL, 'Gemelnet', providentInfo);
}
      