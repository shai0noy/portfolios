// src/lib/fetching/utils/cache.ts
import type { TickerData, HistoricalDataPoint } from '../types';

// Simple in-memory cache with a Time-To-Live (TTL)
export const tickerDataCache = new Map<string, { data: TickerData, timestamp: number }>();
export const historicalDataCache = new Map<string, { data: HistoricalDataPoint[], timestamp: number }>();
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export function withTaseCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed: CachedData<T> = JSON.parse(cached);
      if (now - parsed.timestamp < TASE_CACHE_TTL) {
        if (Array.isArray(parsed.data) && parsed.data.length === 0) {
          console.warn(`Cached data for ${cacheKey} is empty, invalidating.`);
          localStorage.removeItem(cacheKey);
        } else {
          console.log(`Cache hit for ${cacheKey}`);
          return Promise.resolve(parsed.data);
        }
      } else {
        console.log(`Cache expired for ${cacheKey}`);
        localStorage.removeItem(cacheKey); // Clear expired cache
      }
    }
  } catch (e) {
    console.error(`Error reading cache for ${cacheKey}:`, e);
    localStorage.removeItem(cacheKey); // Clear potentially corrupt cache
  }

  console.log(`Cache miss for ${cacheKey}, fetching data...`);
  return fetcher().then(data => {
    try {
      if (Array.isArray(data) && data.length === 0) {
        console.warn(`Fetched data for ${cacheKey} is empty, not caching.`);
        localStorage.removeItem(cacheKey);
      } else {
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
      }
    } catch (e) {
      console.error(`Error writing cache for ${cacheKey}:`, e);
    }
    return data;
  });
}
