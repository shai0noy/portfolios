// src/lib/fetching/cbs.ts
import { CACHE_TTL, saveToCache, loadFromCache } from './utils/cache';

// --- Types ---

export interface CpiDataPoint {
  date: number; // Unix timestamp (for start of month)
  value: number;
}

interface CbsDatePoint {
  year: number;
  month: number;
  currBase: {
    value: number;
  };
}

interface CbsMonthData {
  date: CbsDatePoint[];
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

// --- Fetcher ---

/**
 * Fetches Consumer Price Index (CPI) data from Israel's Central Bureau of Statistics (CBS).
 * @param id The index ID. Defaults to '120010' for the general CPI.
 * @param startPeriod The start period in 'MM-YYYY' format.
 * @param endPeriod The end period in 'MM-YYYY' format.
 * @param signal An optional AbortSignal.
 * @returns A promise that resolves to an array of CPI data points or null if an error occurs.
 */
export async function fetchCpi(
  id: string = '120010', // Default to general CPI
  startPeriod: string, // e.g. '01-2020'
  endPeriod: string,   // e.g. '12-2023'
  signal?: AbortSignal
): Promise<CpiDataPoint[] | null> {
  const now = Date.now();
  const cacheKey = `cpi:${id}:${startPeriod}:${endPeriod}`;

  const cached = await loadFromCache<CpiDataPoint[]>(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let allData: CpiDataPoint[] = [];
  let currentPage = 1;
  let lastPage = 1;

  try {
    do {
      const url = `https://portfolios.noy-shai.workers.dev/?apiId=cbs_price_index&id=${id}&startPeriod=${startPeriod}&endPeriod=${endPeriod}&format=json&download=false&Page=${currentPage}`;
      
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`CBS API fetch failed with status ${res.status}`);
      }
      
      const data: CbsApiResponse = await res.json();
      
      if (!data.month || data.month.length === 0) {
        console.warn(`No 'month' data in CBS response for page ${currentPage}`);
        break; // Exit loop if data is missing
      }

      const points = data.month[0].date.map(d => {
        // Create a date for the first day of the month. Month from API is 1-based.
        const date = new Date(d.year, d.month - 1, 1);
        return {
          date: date.getTime(),
          value: d.currBase.value,
        };
      });

      allData = allData.concat(points);
      
      lastPage = data.paging.last_page;
      currentPage++;

    } while (currentPage <= lastPage);

    // Sort by date ascending to ensure chronological order
    allData.sort((a, b) => a.date - b.date);

    // Cache the final consolidated and sorted result
    await saveToCache(cacheKey, allData);

    return allData;

  } catch (e) {
    console.error("Failed to fetch or parse CPI data", e);
    return null;
  }
}
