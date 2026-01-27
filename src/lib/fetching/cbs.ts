// src/lib/fetching/cbs.ts
import { CACHE_TTL, saveToCache, loadFromCache } from './utils/cache';

// --- Types ---

export interface CpiDataPoint {
  date: number; // Unix timestamp (End of month)
  value: number;
}

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
  paging: {
    total_items: number;
    page_size: number;
    current_page: number;
    last_page: number;
    next_url: string | null;
  }
}

const HEBREW_MONTHS: Record<string, number> = {
  "ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
  "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12
};

// --- Normalization Logic ---

function normalizeCpiSeries(series: CbsDatePoint[], id: string): CpiDataPoint[] {
  // 1. Sort Chronologically (Oldest -> Newest)
  const sorted = [...series].sort((a, b) => (a.year - b.year) || (a.month - b.month));

  if (!sorted.length) return [];

  // 2. Strict Assertion: Must start at Sept 1951 (only for 120010)
  if (id === '120010') {
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
      value: Number(val.toFixed(2))
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
  id: string = '120010', // Default to general CPI
  signal?: AbortSignal
): Promise<CpiDataPoint[] | null> {
  const now = Date.now();
  const cacheKey = `cpi:${id}:full_v1`;

  const cached = await loadFromCache<CpiDataPoint[]>(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let allRawData: CbsDatePoint[] = [];
  let currentPage = 1;
  let morePages = true;

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
    }

    // Normalize the data
    const normalized = normalizeCpiSeries(allRawData, id);

    // Cache the final consolidated and sorted result
    await saveToCache(cacheKey, normalized);

    return normalized;

  } catch (e) {
    console.error("Failed to fetch or parse CPI data", e);
    return null;
  }
}
