// src/lib/fetching/utils/cache.ts
import * as db from './idb';

// Simple in-memory cache with a Time-To-Live (TTL)
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days
export const GEMEL_CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours
export const GEMEL_LIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export async function saveToCache<T>(key: string, data: T, timestamp: number = Date.now()): Promise<void> {
    try {
        await db.set(key, { data, timestamp });
    } catch (e) {
        console.error(`Error saving to cache for ${key}`, e);
    }
}

export async function loadFromCache<T>(key: string): Promise<CachedData<T> | null> {
    try {
        const cached = await db.get<CachedData<T>>(key);
        if (cached) {
             return cached;
        }
    } catch (e) {
        console.error(`Error loading from cache for ${key}`, e);
    }
    return null;
}

/**
 * Loads raw data from cache without assuming {data, timestamp} structure wrapper, 
 * unless that's what was stored.
 */
export async function loadRawFromCache<T>(key: string): Promise<T | null> {
    try {
        const val = await db.get<T>(key);
        return val !== undefined ? val : null;
    } catch(e) {
        console.error(`Error loading raw from cache ${key}`, e);
        return null;
    }
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
