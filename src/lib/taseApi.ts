// src/lib/taseApi.ts
import { fetchXml, parseXmlString, extractDataFromXml } from './xmlParser';

const TASE_API_BASE_URL = 'https://www.globes.co.il/data/webservices/financial.asmx';

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
        console.log(`Cache hit for ${cacheKey}`);
        return Promise.resolve(parsed.data);
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
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: now }));
    } catch (e) {
      console.error(`Error writing cache for ${cacheKey}:`, e);
    }
    return data;
  });
}

export interface TaseInstrumentType {
  type: string;
  description: string; // Hebrew description
  quantity: number;
}

export interface TaseTicker {
  symbol: string;
  name_he: string;
  name_en: string;
  instrumentId: string;
}

/**
 * Fetches the list of available instrument types from the TASE API.
 * @param signal AbortSignal for canceling the fetch.
 * @returns A promise that resolves to an array of TaseInstrumentType.
 */
export async function fetchTaseInstrumentTypes(signal?: AbortSignal): Promise<TaseInstrumentType[]> {
  const cacheKey = 'tase:instrumentTypes';
  return withTaseCache(cacheKey, async () => {
    const url = `${TASE_API_BASE_URL}/listTypes?exchange=tase`;
    const xmlString = await fetchXml(url, signal);
    const xmlDoc = parseXmlString(xmlString);

    return extractDataFromXml(xmlDoc, 'Table1', (element) => {
      const typeElement = element.querySelector('type');
      const descriptionElement = element.querySelector('description');
      const quantityElement = element.querySelector('quantity');

      if (!typeElement || !descriptionElement || !quantityElement) {
        throw new Error('Missing expected elements in TASE instrument type XML.');
      }

      return {
        type: typeElement.textContent || '',
        description: descriptionElement.textContent || '',
        quantity: parseInt(quantityElement.textContent || '0', 10),
      };
    });
  });
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
    const url = `${TASE_API_BASE_URL}/listByType?exchange=tase&type=${type}`;
    const xmlString = await fetchXml(url, signal);
    const xmlDoc = parseXmlString(xmlString);

    return extractDataFromXml(xmlDoc, 'anyType[xsi|type="Instrument"]', (element) => {
      const symbolElement = element.querySelector('symbol');
      const nameHeElement = element.querySelector('name_he');
      const nameEnElement = element.querySelector('name_en');
      const instrumentIdElement = element.querySelector('instrumentId');

      if (!symbolElement || !nameHeElement || !nameEnElement || !instrumentIdElement) {
        throw new Error(`Missing expected elements in TASE ticker XML for type: ${type}`);
      }

      return {
        symbol: symbolElement.textContent || '',
        name_he: nameHeElement.textContent || '',
        name_en: nameEnElement.textContent || '',
        instrumentId: instrumentIdElement.textContent || '',
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

const DEFAULT_TASE_TYPE_CONFIG: TaseTypeConfig = {
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
): Promise<TaseTicker[]> {
  const allTickers: TaseTicker[] = [];
  const instrumentTypes = await fetchTaseInstrumentTypes(signal);

  const fetchPromises = instrumentTypes.map(async (typeInfo) => {
    const typeConfig = config[typeInfo.type];
    if (typeConfig && typeConfig.enabled) {
      try {
        const tickers = await fetchTaseTickersByType(typeInfo.type, signal);
        allTickers.push(...tickers);
      } catch (e) {
        console.warn(`Failed to fetch tickers for type ${typeInfo.type}:`, e);
      }
    }
  });

  await Promise.all(fetchPromises);
  return allTickers;
}
