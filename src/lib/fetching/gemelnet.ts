import { fetchXml, parseXmlString } from './utils/xml_parser';
import type { TickerListItem, TickerData } from './types';
import { Exchange } from '../types';

// URL for listing: https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach=202510&adTkfDivuach=202512&kupot=0000&Dochot=1&sug=1
// always use current moth as end and year previous as start
// Example response:
/*
<ROWSET>
<DESCRIPTION1>₪ כל הסכומים במיליוני</DESCRIPTION1>
<DESCRIPTION2>כל התשואות הינן נומינליות ברוטו</DESCRIPTION2>
<Row>
<ID>103</ID>
<SHM_KUPA>מיטב גמל לבני 50 עד 60</SHM_KUPA> 
<SUG_KUPA>תגמולים ואישית לפיצויים</SUG_KUPA>
<SHM_HEVRA_MENAHELET>מיטב גמל ופנסיה בע"מ</SHM_HEVRA_MENAHELET>
<HITMAHUT_RASHIT>מדרגות</HITMAHUT_RASHIT>
<HITMAHUT_MISHNIT>50-60</HITMAHUT_MISHNIT>
<AD_TKUFAT_DIVUACH>202511</AD_TKUFAT_DIVUACH>
<HAFKADOT_LLO_HAAVAROT>90.82</HAFKADOT_LLO_HAAVAROT>
<MSHICHOT_LLO_HAAVAROT>69.43</MSHICHOT_LLO_HAAVAROT>
<HAAVAROT_BEIN_HAKUPOT>525.06</HAAVAROT_BEIN_HAKUPOT>
<TZVIRA_NETO>546.45</TZVIRA_NETO>
<SHIUR_DMEI_NIHUL_AHARON>0.5</SHIUR_DMEI_NIHUL_AHARON>
<SHIUR_D_NIHUL_AHARON_HAFKADOT>0.1</SHIUR_D_NIHUL_AHARON_HAFKADOT>
</Row>
...
*/

export interface GemelnetDataPoint {
  date: number; // Unix timestamp (start of month)
  nominalReturn: number; // Percentage return (TSUA_NOMINALI_BFOAL)
  assets: number; // Asset balance (YIT_NCHASIM_BFOAL)
}

export interface GemelnetFundData {
  fundId: number;
  fundName?: string;
  data: GemelnetDataPoint[];
  lastUpdated: number;
}

const CACHE_KEY_PREFIX = 'gemelnet_cache_v2_';
const CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours

// Helper to get date parts
function getDateParts(date: Date): { year: string, month: string } {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return { year: y, month: m };
}

// Helper to parse YYYYMM to timestamp
function parseDateStr(dateStr: string): number {
  if (!dateStr || dateStr.length !== 6) return 0;
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed in JS Date
  return new Date(y, m, 1).getTime();
}

/**
 * Fetches historical fund data from Gemelnet.
 * Uses a local storage cache with a 48-hour TTL.
 * 
 * @param fundId The ID of the fund.
 * @param startMonth Start date for the range (default: Jan 1990).
 * @param endMonth End date for the range (default: Today).
 * @param forceRefresh If true, bypasses the cache.
 */
export async function fetchGemelnetFund(
  fundId: number,
  startMonth: Date = new Date('1990-01-01'),
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
    const xmlText = await fetchXml(url);
    const xmlDoc = parseXmlString(xmlText);
    
    const rows = Array.from(xmlDoc.querySelectorAll('Row'));
    const points: GemelnetDataPoint[] = [];
    let fundName = '';

    rows.forEach((row, index) => {
      const getText = (tag: string) => row.querySelector(tag)?.textContent || '';
      
      if (index === 0) {
          fundName = getText('SHM_KUPA');
          console.log(`[Gemelnet] Parsed fund name for ${fundId}: ${fundName}`);
      }

      const dateStr = getText('TKF_DIVUACH');
      const returnStr = getText('TSUA_NOMINALI_BFOAL');
      const assetsStr = getText('YIT_NCHASIM_BFOAL');

      if (dateStr) {
        points.push({
          date: parseDateStr(dateStr),
          nominalReturn: returnStr ? parseFloat(returnStr) : 0,
          assets: assetsStr ? parseFloat(assetsStr) : 0,
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

export async function fetchGemelnetTickers(signal?: AbortSignal): Promise<TickerListItem[]> {
  const now = Date.now();

  // 1. Check Cache
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
          type: 'gemel_fund',
          gemelInfo: {
            fundId: id,
            managingCompany: getText('SHM_HEVRA_MENAHELET'),
            fundSubType: getText('SUG_KUPA'),
            specialization: getText('HITMAHUT_RASHIT'),
            subSpecialization: getText('HITMAHUT_MISHNIT'),
            managementFee: parseFloat(getText('SHIUR_DMEI_NIHUL_AHARON')) || 0,
            depositFee: parseFloat(getText('SHIUR_D_NIHUL_AHARON_HAFKADOT')) || 0,
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
  // Fetch last 12 months to ensure we get recent data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const fundData = await fetchGemelnetFund(fundId, startDate, endDate, forceRefresh);

  if (!fundData || fundData.data.length === 0) {
    console.log(`[Gemelnet] fetchGemelnetQuote: No data found for ${fundId}`, fundData);
    return null;
  }

  // Sort by date descending
  const sortedData = [...fundData.data].sort((a, b) => b.date - a.date);
  const latest = sortedData[0];

  return {
    ticker: String(fundId),
    numericId: fundId,
    exchange: Exchange.GEMEL,
    // Gemel funds don't have a daily price like stocks. 
    // We'll use 100 as a base index price, or we could use the 'assets' if that made sense (but it doesn't for price).
    // Let's use 1 and rely on performance fields.
    price: 1, 
    changePct1d: latest.nominalReturn,
    changeDate1d: latest.date,
    timestamp: latest.date,
    currency: 'ILS', // Usually ILS
    name: fundData.fundName || String(fundId),
    nameHe: fundData.fundName,
    source: 'Gemelnet',
  };
}