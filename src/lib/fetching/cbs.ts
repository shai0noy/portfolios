// src/lib/fetching/cbs.ts
import { CACHE_TTL, saveToCache, loadFromCache } from './utils/cache';
import { Exchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import type { TickerProfile } from '../types/ticker';
import type { TickerData } from './types';
import { calculateTickerDataFromIndexHistory, type FundData, type FundDataPoint } from './gemel_utils';

// --- Types ---
 
interface CbsDatePoint {
  year: number;
  month: number;
  currBase: {
    value: number;
    baseDesc: string;
  };
}

interface CbsMonthData {
  date: CbsDatePoint[];
  code?: number;
}

interface CbsApiResponse {
  month: CbsMonthData[];
  name: string;
  paging: {
    total_items: number;
    page_size: number;
    current_page: number;
    last_page: number;
    next_url: string | null;
  }
}

const HEBREW_MONTHS: Record<string, number> = {
  "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
  "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12
};

const CBS_INDICES = {
  "120010": { nameHe: "מדד המחירים לצרכן, כללי" , nameEn: "Israel Consumer Price Index"},
  "120460": {nameHe: "מדד מחירי מחירי השכירות", nameEn: "Israel Housing Rental Price Index"},
  "400100": {nameHe: "מדד מחירי הדיור, כל הארץ", nameEn: "Israel House Prices Index, National"},
  "60000": { nameHe: "מדד מחירי הדיור, ירושלים", nameEn: "Israel House Prices Index, Jerusalem" },
  "60100": { nameHe: "מדד מחירי הדיור, צפון", nameEn: "House Prices Index, North" },
  "60200": { nameHe: "מדד מחירי הדיור, חיפה", nameEn: "House Prices Index, Haifa" },
  "60300": { nameHe: "מדד מחירי הדיור, מרכז", nameEn: "House Prices Index, Center" },
  "60400": { nameHe: "מדד מחירי הדיור, תל אביב", nameEn: "House Prices Index, Tel Aviv" },
  "60500": { nameHe: "מדד מחירי הדיור, דרום", nameEn: "House Prices Index, South" },
  "70000": { nameHe: "מדד מחירי דירות חדשות", nameEn: "House Prices Index, New Construction" },
  "121360": { nameHe: "מדד המחירים לצרכן: אחזקת כלי רכב", nameEn: "Israel Consumer Price Index: Car Ownership" },
  "140704": { nameHe: "מדד המחירים לצרכן: מכוניות חדשות", nameEn: "Israel Consumer Price Index: New Cars" },
  "140690": { nameHe: "מדד המחירים לצרכן: דלק ושמנים לכלי רכב", nameEn: "Israel Consumer Price Index: Car Fuel and Oils" },
  
  // Included because it's funny
  "150050": {nameHe: "מדד המחירים לצרכן: עגבניות", nameEn: "Israel Consumer Price Index: Tomatoes" },
  "150060": {nameHe: "מדד המחירים לצרכן: מלפפונים", nameEn: "Israel Consumer Price Index: Cucumbers" },
  "150270": {nameHe: "מדד המחירים לצרכן: מלפפונים כבושים", nameEn: "Israel Consumer Price Index: Canned Cucumbers"},
  "120070": { nameHe: "מדד המחירים לצרכן: לחם", nameEn: "Israel Consumer Price Index: Bread" },
  "120320": { nameHe: "מדד המחירים לצרכן: קפה", nameEn: "Israel Consumer Price Index: Coffee" },
  "121440": { nameHe: "מדד המחירים לצרכן: סיגריות וטבק", nameEn: "Israel Consumer Price Index: Cigarettes and Tobacco" },
  "140220": { nameHe: "מדד המחירים לצרכן: בירה", nameEn: "Israel Consumer Price Index: Beer" }
}

export function getCbsTickers(): TickerProfile[] {
  return Object.entries(CBS_INDICES).map(([id, info]) => ({
    symbol: id,
    exchange: Exchange.CBS,
    securityId: id,
    name: info.nameEn,
    nameHe: info.nameHe,
    type: new InstrumentClassification(InstrumentType.CPI, undefined, { en: 'CPI' })
  }));
}

// --- Normalization Logic ---

function normalizeCpiSeries(series: CbsDatePoint[], id: number): FundDataPoint[] {
  // 1. Sort Chronologically (Oldest -> Newest)
  const sorted = [...series].sort((a, b) => (a.year - b.year) || (a.month - b.month));

  if (!sorted.length) return [];

  // 2. Strict Assertion: Must start at Sept 1951 (only for 120010)
  if (id === 120010) {
    if (sorted[0].year !== 1951 || sorted[0].month !== 9) {
      throw new Error(`Series invalid: Must start at Sept 1951 (found ${sorted[0].month}/${sorted[0].year})`);
    }
  }

  // 3. State Tracking
  let chainFactor = 1.0;
  let currentBase = sorted[0].currBase.baseDesc;
  
  // Storage for linking: maps "YYYY-MM" -> normalized_value and "YYYY" -> annual_avg
  const history = new Map<string, number>();
  const yearSums = new Map<number, { sum: number; count: number }>();

  return sorted.map(entry => {
    // Check for Base Change
    if (entry.currBase.baseDesc !== currentBase) {
      const isAvg = entry.currBase.baseDesc.includes("ממוצע");
      const yearMatch = parseInt(entry.currBase.baseDesc.match(/\d{4}/)?.[0] || "0");

      let prevBaseVal = 0;
      if (isAvg) {
        // Link via Yearly Average
        const yData = yearSums.get(yearMatch);
        if (!yData) throw new Error(`Missing avg data for base transition: ${entry.currBase.baseDesc}`);
        prevBaseVal = yData.sum / yData.count;
      } else {
        // Link via Specific Month (e.g., "ספטמבר 1951")
        const monthName = entry.currBase.baseDesc.split(" ").find(w => HEBREW_MONTHS[w]);
        const mKey = `${yearMatch}-${HEBREW_MONTHS[monthName!]}`;
        if (!history.has(mKey)) throw new Error(`Missing month data for base transition: ${entry.currBase.baseDesc}`);
        prevBaseVal = history.get(mKey)!;
      }

      // New Factor = (Value of new base in old terms) / 100
      chainFactor = prevBaseVal / 100;
      currentBase = entry.currBase.baseDesc;
    }

    // Calculate & Store
    const val = entry.currBase.value * chainFactor;
    const key = `${entry.year}-${entry.month}`;
    
    history.set(key, val);
    
    // Update Year Avg Stats
    const yStat = yearSums.get(entry.year) || { sum: 0, count: 0 };
    yearSums.set(entry.year, { sum: yStat.sum + val, count: yStat.count + 1 });

    // Return Format: End of Month Date
    const lastDay = new Date(entry.year, entry.month, 0); 
    return {
      date: lastDay.getTime(),
      nominalReturn: Number(val.toFixed(2))
    };
  });
}

// --- Fetcher ---

/**
 * Fetches Consumer Price Index (CPI) data from Israel's Central Bureau of Statistics (CBS).
 * @param id The index ID. Defaults to '120010' for the general CPI.
 * @param signal An optional AbortSignal.
 * @returns A promise that resolves to an array of CPI data points or null if an error occurs.
 */
export async function fetchCpi(
  id: number ,
  signal?: AbortSignal
): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `cpi:${id}:full_v1`;

  const cached = await loadFromCache<TickerData>(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let allRawData: CbsDatePoint[] = [];
  let currentPage = 1;
  let morePages = true;
  let name = '';
  try {
    while (morePages) {
      const url = `https://portfolios.noy-shai.workers.dev/?apiId=cbs_price_index&id=${id}&page=${currentPage}`;
      
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`CBS API fetch failed with status ${res.status}`);
      }
      
      const data: CbsApiResponse = await res.json();
      
      if (!data.month || data.month.length === 0) {
        console.warn(`No 'month' data in CBS response for page ${currentPage}`);
        break; // Exit loop if data is missing
      }

      // Collect raw points from the first series found
      const seriesData = data.month[0].date;
      if (seriesData) {
        allRawData = allRawData.concat(seriesData);
      }
      
      if (data.paging && data.paging.current_page < data.paging.last_page) {
        currentPage++;
      } else {
        morePages = false;
      }
      name ||= data.name;
    }

    // Normalize the data
    const normalizedData = normalizeCpiSeries(allRawData, id);
    const fundData: FundData = {
      fundId: id,
      fundName: CBS_INDICES[String(id)]?.nameHe || name,
      data: normalizedData,
      lastUpdated: Date.now()
    };
    const info = calculateTickerDataFromIndexHistory(fundData, Exchange.CBS, 'CBS');
    

    // Cache the final consolidated and sorted result
    await saveToCache(cacheKey, info);
    return info;

  } catch (e) {
    console.error("Failed to fetch or parse CPI data", e);
    return null;
  }
}
