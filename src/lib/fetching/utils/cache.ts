// src/lib/fetching/utils/cache.ts
import * as db from './idb';
import { deduplicateRequest } from './request_deduplicator';

// Simple in-memory cache with a Time-To-Live (TTL)
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days
export const GEMEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const GEMEL_LIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SLOW_DATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const SLOW_DATA_MIN_REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
export const FAST_DATA_MIN_REFRESH_INTERVAL = 30 * 1000; // 30 seconds

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

export async function clearAllCache(): Promise<void> {
    try {
        await db.clear();
        console.debug('Cache cleared successfully');
    } catch (e) {
        console.error('Error clearing cache:', e);
    }
}

export async function withTaseCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  try {
    const cached = await db.get<CachedData<T>>(cacheKey);
    if (cached) {
      const jitter = Math.min(TASE_CACHE_TTL * 0.1, 30 * 60 * 1000) * Math.random();
      if (now - cached.timestamp < TASE_CACHE_TTL + jitter) {
        if (Array.isArray(cached.data) && cached.data.length === 0) {
          console.warn(`Cached data for ${cacheKey} is empty, invalidating.`);
          await db.del(cacheKey);
        } else {
          console.debug(`Cache hit for ${cacheKey}`);
          return cached.data;
        }
      } else {
        console.debug(`Cache expired for ${cacheKey}`);
      }
    }
  } catch (e) {
    console.error(`Error reading cache for ${cacheKey}:`, e);
    // Ignore error and proceed to fetch
  }

  console.debug(`Cache miss for ${cacheKey}, fetching data...`);
  try {
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
  } catch (e) {
    console.debug(`[Cache] Fetch failed for ${cacheKey}, falling back to expired cache.`, e);
    const cached = await db.get<CachedData<T>>(cacheKey);
    if (cached && cached.data !== null) {
        if (typeof cached.data === 'object' && !Array.isArray(cached.data)) {
          return { ...cached.data, isStaleFallback: true } as unknown as T;
        }
        return cached.data;
    }
    throw e;
  }
}

export async function fetchWithCache<T>(
  cacheKey: string,
  ttl: number,
  forceRefresh: boolean,
  fetcher: () => Promise<T | null>,
  cacheHitValidator?: (cachedData: T) => boolean,
  minRefreshInterval?: number
): Promise<T | null> {
  const now = Date.now();
  let cached: CachedData<T | null> | null = null;
  let loadedFromCache = false;

  const getCached = async () => {
    if (loadedFromCache) return cached;
    cached = await loadFromCache<T | null>(cacheKey);
    loadedFromCache = true;
    return cached;
  };

  let shouldSkipCache = forceRefresh;

  if (forceRefresh && minRefreshInterval !== undefined) {
    try {
      const c = await getCached();
      if (c && c.data !== null) {
        const age = now - new Date(c.timestamp).getTime();
        if (age < minRefreshInterval) {
          console.debug(`[Cache] Ignoring forceRefresh for ${cacheKey} as cache age (${Math.round(age/1000)}s) is less than minRefreshInterval (${Math.round(minRefreshInterval/1000)}s).`);
          shouldSkipCache = false;
        }
      }
    } catch (e) {
      console.error(`[Cache] Error checking minRefreshInterval for ${cacheKey}`, e);
    }
  }

  if (!shouldSkipCache) {
    const c = await getCached();
    const jitter = Math.min(ttl * 0.1, 30 * 60 * 1000) * Math.random();
    if (c?.timestamp && (now - new Date(c.timestamp).getTime() < ttl + jitter)) {
      if (c.data === null) {
        return null;
      }
      if (!cacheHitValidator || cacheHitValidator(c.data)) {
        if (typeof c.data === 'object' && !Array.isArray(c.data)) {
          return { ...c.data, fromCache: true } as unknown as T;
        }
        return c.data;
      }
    }
  }

  let cachedData: T | null = null;
  try {
    const cached = await loadFromCache<T | null>(cacheKey);
    cachedData = cached ? cached.data : null;
  } catch (loadErr) {
    console.error(`[Cache] Error loading from cache for ${cacheKey} before fetch fallback check`, loadErr);
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const data = await fetcher();
      if (data === null && cachedData !== null) {
          console.debug(`[Cache] Fetcher returned null but valid cache exists for ${cacheKey}. Keeping cache.`);
          if (typeof cachedData === 'object' && !Array.isArray(cachedData)) {
            return { ...cachedData, isStaleFallback: true } as unknown as T;
          }
          return cachedData;
      }
      await saveToCache(cacheKey, data, now);
      return data;
    } catch (e: any) {
      if (cachedData !== null) {
          console.debug(`[Cache] Fetch failed for ${cacheKey}, falling back to expired cache.`, e);
          if (typeof cachedData === 'object' && !Array.isArray(cachedData)) {
            return { ...cachedData, fromCache: true, isStaleFallback: true } as unknown as T;
          }
          return cachedData;
      }
      if (e?.status && e.status !== 429 && e.status < 500) {
        console.debug(`[Cache] Persistent error ${e.status} for ${cacheKey}, caching as Not Found.`);
        await saveToCache(cacheKey, null, now);
      } else {
        console.debug(`[Cache] Transient error or exception for ${cacheKey}, not caching null.`, e);
      }
      return null;
    }
  });
}
