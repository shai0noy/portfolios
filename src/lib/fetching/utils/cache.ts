// src/lib/fetching/utils/cache.ts
import type { TickerData, HistoricalDataPoint } from '../types';
import * as db from './idb';

// Simple in-memory cache with a Time-To-Live (TTL)
export const tickerDataCache = new Map<string, { data: TickerData, timestamp: number }>();
export const historicalDataCache = new Map<string, { data: HistoricalDataPoint[], timestamp: number }>();
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export async function withTaseCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  try {
    const cached = await db.get<CachedData<T>>(cacheKey);
    if (cached) {
      if (now - cached.timestamp < TASE_CACHE_TTL) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
          console.warn(`Cached data for ${cacheKey} is empty, invalidating.`);
          await db.del(cacheKey);
        } else {
          console.log(`Cache hit for ${cacheKey}`);
          return cached.data;
        }
      } else {
        console.log(`Cache expired for ${cacheKey}`);
        await db.del(cacheKey); // Clear expired cache
      }
    }
  } catch (e) {
    console.error(`Error reading cache for ${cacheKey}:`, e);
    // Ignore error and proceed to fetch
  }

  console.log(`Cache miss for ${cacheKey}, fetching data...`);
  const data = await fetcher();
  
  try {
    if (Array.isArray(data) && data.length === 0) {
      console.warn(`Fetched data for ${cacheKey} is empty, not caching.`);
      // Ensure we don't have bad data stored
      await db.del(cacheKey); 
    } else {
      await db.set(cacheKey, { data, timestamp: now });
    }
  } catch (e) {
    console.error(`Error writing cache for ${cacheKey}:`, e);
  }
  
  return data;
}
