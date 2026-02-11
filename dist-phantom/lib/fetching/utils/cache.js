"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEMEL_LIST_CACHE_TTL = exports.GEMEL_CACHE_TTL = exports.TASE_CACHE_TTL = exports.CACHE_TTL = void 0;
exports.saveToCache = saveToCache;
exports.loadFromCache = loadFromCache;
exports.loadRawFromCache = loadRawFromCache;
exports.clearAllCache = clearAllCache;
exports.withTaseCache = withTaseCache;
// src/lib/fetching/utils/cache.ts
const db = __importStar(require("./idb"));
// Simple in-memory cache with a Time-To-Live (TTL)
exports.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
exports.TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days
exports.GEMEL_CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours
exports.GEMEL_LIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
async function saveToCache(key, data, timestamp = Date.now()) {
    try {
        await db.set(key, { data, timestamp });
    }
    catch (e) {
        console.error(`Error saving to cache for ${key}`, e);
    }
}
async function loadFromCache(key) {
    try {
        const cached = await db.get(key);
        if (cached) {
            return cached;
        }
    }
    catch (e) {
        console.error(`Error loading from cache for ${key}`, e);
    }
    return null;
}
/**
 * Loads raw data from cache without assuming {data, timestamp} structure wrapper,
 * unless that's what was stored.
 */
async function loadRawFromCache(key) {
    try {
        const val = await db.get(key);
        return val !== undefined ? val : null;
    }
    catch (e) {
        console.error(`Error loading raw from cache ${key}`, e);
        return null;
    }
}
async function clearAllCache() {
    try {
        await db.clear();
        console.log('Cache cleared successfully');
    }
    catch (e) {
        console.error('Error clearing cache:', e);
    }
}
async function withTaseCache(cacheKey, fetcher) {
    const now = Date.now();
    try {
        const cached = await db.get(cacheKey);
        if (cached) {
            if (now - cached.timestamp < exports.TASE_CACHE_TTL) {
                if (Array.isArray(cached.data) && cached.data.length === 0) {
                    console.warn(`Cached data for ${cacheKey} is empty, invalidating.`);
                    await db.del(cacheKey);
                }
                else {
                    console.log(`Cache hit for ${cacheKey}`);
                    return cached.data;
                }
            }
            else {
                console.log(`Cache expired for ${cacheKey}`);
                await db.del(cacheKey); // Clear expired cache
            }
        }
    }
    catch (e) {
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
        }
        else {
            await db.set(cacheKey, { data, timestamp: now });
        }
    }
    catch (e) {
        console.error(`Error writing cache for ${cacheKey}:`, e);
    }
    return data;
}
