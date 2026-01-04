// src/lib/taseApi.ts
import { fetchXml, parseXmlString, extractDataFromXmlNS } from './xmlParser';

const TASE_API_BASE_URL = 'https://www.globes.co.il/data/webservices/financial.asmx';
const TASE_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

const TASE_CACHE_TTL = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

interface CachedData<T> {
  data: T;
  timestamp: number;
}

function withTaseCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed: CachedData<T> = JSON.parse(cached);
      if (now - parsed.timestamp < TASE_CACHE_TTL) {
        // Check if cached data is an empty array
        if (Array.isArray(parsed.data) && parsed.data.length === 0) {
          console.warn(`Cached data for ${cacheKey} is empty, invalidating.`);
          localStorage.removeItem(cacheKey);
          // Proceed to fetch as if cache miss
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
      // Check if data is an empty array
      if (Array.isArray(data) && data.length === 0) {
        console.warn(`Fetched data for ${cacheKey} is empty, not caching.`);
        localStorage.removeItem(cacheKey); // Ensure no bad cache remains
      } else {
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
      }
    } catch (e) {
      console.error(`Error writing cache for ${cacheKey}:`, e);
    }
    return data;
  });
}

export interface TaseTicker {
  symbol: string;
  name_he: string;
  name_en: string;
  instrumentId: string;
  type: string;
}

/**
 * Fetches tickers for a specific instrument type from the TASE API.
 * @param type The instrument type (e.g., 'stock', 'etf').
 * @param signal AbortSignal for canceling the fetch.
 * @returns A promise that resolves to an array of TaseTicker.
 */
export async function fetchTaseTickersByType(type: string, signal?: AbortSignal): Promise<TaseTicker[]> {
  const cacheKey = `tase:tickers:${type}`;
  return withTaseCache(cacheKey, async () => {
    const url = import.meta.env.DEV
      ? `/api/globes/data/webservices/financial.asmx/listByType?exchange=tase&type=${type}`
      : `${TASE_API_BASE_URL}/listByType?exchange=tase&type=${type}`;
    const xmlString = await fetchXml(url, signal);
    const xmlDoc = parseXmlString(xmlString);

    return extractDataFromXmlNS(xmlDoc, TASE_API_NAMESPACE, 'anyType', (element) => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') {
        return null;
      }

      const symbolElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'symbol')[0];
      const nameHeElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'name_he')[0];
      const nameEnElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'name_en')[0];
      const instrumentIdElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'instrumentId')[0];

      if (!symbolElement || !nameHeElement || !nameEnElement || !instrumentIdElement) {
        console.warn('Missing expected elements in TASE ticker XML for type:', type, element);
        return null;
      }

      return {
        symbol: symbolElement.textContent || '',
        name_he: nameHeElement.textContent || '',
        name_en: nameEnElement.textContent || '',
        instrumentId: instrumentIdElement.textContent || '',
        type: type,
      };
    });
  });
}

// Configuration for TASE ticker types
// Each type can be enabled/disabled and assigned a human-readable name
export interface TaseTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}

export const DEFAULT_TASE_TYPE_CONFIG: TaseTypeConfig = {
  stock: { enabled: true, displayName: 'Stocks' },
  etf: { enabled: true, displayName: 'ETFs' },
  index: { enabled: false, displayName: 'Indices' },
  makam: { enabled: false, displayName: 'Makam' },
  gov_generic: { enabled: false, displayName: 'Gov Bonds' },
  bond_conversion: { enabled: false, displayName: 'Convertible Bonds' },
  bond_ta: { enabled: false, displayName: 'Corporate Bonds' },
  fund: { enabled: false, displayName: 'Funds' },
  option_ta: { enabled: false, displayName: 'Options TA' },
  option_maof: { enabled: false, displayName: 'Options Maof' },
  option_other: { enabled: false, displayName: 'Other Derivatives' },
};

/**
 * Fetches all TASE tickers from enabled instrument types and merges them into a single dataset.
 * @param signal AbortSignal for canceling the fetch.
 * @param config Optional configuration to override default type enablement.
 * @returns A promise that resolves to an array of all TaseTicker.
 */
export async function fetchAllTaseTickers(
  signal?: AbortSignal, 
  config: TaseTypeConfig = DEFAULT_TASE_TYPE_CONFIG
): Promise<Record<string, TaseTicker[]>> {
  const allTickersByType: Record<string, TaseTicker[]> = {};
  const instrumentTypes = Object.keys(config);

  const fetchPromises = instrumentTypes.map(async (type) => {
    const typeConfig = config[type];
    if (typeConfig && typeConfig.enabled) {
      try {
        console.log(`Fetching TASE tickers for type: ${type}`);
        const tickers = await fetchTaseTickersByType(type, signal);
        allTickersByType[type] = tickers;
      } catch (e) {
        console.warn(`Failed to fetch tickers for type ${type}:`, e);
        allTickersByType[type] = [];
      }
    }
  });

  await Promise.all(fetchPromises);
  return allTickersByType;
}
