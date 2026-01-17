/**
 * @fileoverview Fetches and combines stock data from TASE (Tel Aviv Stock Exchange) and Globes financial news.
 * This file provides functions to get a full list of TASE-traded securities and enrich them with data from Globes.
 */

import { fetchXml, parseXmlString, extractDataFromXmlNS } from './utils/xml_parser';
import { withTaseCache } from './utils/cache';
import type { TaseTicker, SecurityTypeConfig, TaseSecurity } from './types';
import { fetchGemelnetTickers } from './gemelnet';
import taseTypeIds from './tase_type_ids.json';

// Internal type for data fetched from Globes. Not exported.
interface GlobesTicker {
    numericSecurityId: string;
    symbol: string;
    name_he: string;
    name_en: string;
    globesInstrumentId: string;
    type: string;
}

const GLOBES_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Default configuration for fetching ticker types.
 * Specifies which security types are enabled for fetching by default.
 */
export const DEFAULT_SECURITY_TYPE_CONFIG: SecurityTypeConfig = {
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

// Todo: mapping is incomplete and semi arbitrary
// Pattern matching for TASE main type to Globes type
const taseTypePatterns: [RegExp, string][] = [
    // Order matters: more specific patterns should come first.
    // Stocks and similar
    [/share/i, 'stock'],
    [/warrant/i, 'stock'], 
    [/rights/i, 'stock'],
    [/r&d unit/i, 'stock'],
    [/part\. unit/i, 'stock'],

    // ETFs and similar
    [/etf/i, 'etf'],
    [/etn/i, 'etf'],
    [/certificate/i, 'etf'],

    // Government Bonds
    [/treasury bill/i, 'makam'],
    [/govt\. bond/i, 'gov_generic'],
    
    // Corporate/Convertible Bonds
    [/convert\. bond/i, 'bond_conversion'],
    [/corp\. bond/i, 'bond_ta'],
    [/bond/i, 'bond_ta'], // General fallback for bonds

    // Funds
    [/mutual fund/i, 'fund'],
    [/investment fund/i, 'fund'],
    [/high tech fund/i, 'fund'],

    // Options/Futures
    [/w\.call/i, 'option_ta'],
    [/w\.put/i, 'option_ta'],
    [/w\.future/i, 'option_ta'],
    [/call option/i, 'option_maof'],
    [/put option/i, 'option_maof'],
    [/future/i, 'option_maof'],
    [/dollar option/i, 'option_other'],
    [/option/i, 'option_ta'], 
    
    // Index
    [/index/i, 'index'],
];

/**
 * Finds a corresponding Globes type for a given TASE security type description using pattern matching.
 * @param taseType - The TASE security type description (e.g., "SHARE", "CONVERT. BOND").
 * @returns The matching Globes type string (e.g., "stock", "bond_conversion") or undefined if no match is found.
 */
function getGlobesTypeFromTaseType(taseType: string): string | undefined {
    for (const [pattern, globesType] of taseTypePatterns) {
        if (pattern.test(taseType)) {
            return globesType;
        }
    }
    return undefined;
}

function getEffectiveTicker(ticker: string | undefined, exchange: string | undefined) {
  if (!ticker || !exchange) return ticker;
  const upperExchange = exchange.toUpperCase();
  if (upperExchange === 'TASE') {
    let t = ticker;
    if (t.endsWith('-M')) {
      t = t.slice(0, -2);
    }
    if (t.includes('-')) {
      console.warn(`TASE ticker ${t} contains a hyphen.`);
    }
    return t;
  }
  return ticker;
}

// Create a mapping from TASE security type code to a broad category description.
const taseSecurityTypeMap = new Map<string, { type: string, subType: string }>();
taseTypeIds.securitiesTypes.result.forEach(type => {
    if (type.securityFullTypeCode && type.securityMainTypeDesc) {
        taseSecurityTypeMap.set(type.securityFullTypeCode, { type: type.securityMainTypeDesc, subType: type.securityTypeDesc || type.securityMainTypeDesc });
    }
});


/**
 * Fetches the complete list of securities from the TASE API.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to an array of TASE securities. Returns an empty array on failure.
 */
async function fetchTaseSecurities(signal?: AbortSignal): Promise<TaseSecurity[]> {
    const url = `https://portfolios.noy-shai.workers.dev/?apiId=tase_list_stocks`;
    try {
        console.log(`Fetching TASE securities...`);
        const response = await fetch(url, { signal });
        if (!response.ok) {
            console.error(`Failed to fetch TASE securities: ${response.statusText}`);
            return [];
        }
        const data = await response.json();
        // The API nests the results in `tradeSecuritiesList.result`
        const result = data?.tradeSecuritiesList?.result || [];
        console.log(`Fetched ${result.length} TASE securities.`);
        return result;
    } catch(e) {
        console.error('Error fetching or parsing TASE securities', e);
        return [];
    }
}

/**
 * Fetches ticker data from Globes for a specific security type.
 * @param type - The type of security to fetch (e.g., 'stock', 'etf').
 * @param exchange - The exchange to fetch from.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to an array of Globes tickers.
 */
async function fetchGlobesTickersByType(type: string, exchange: string, signal?: AbortSignal): Promise<GlobesTicker[]> {
  const cacheKey = `globes:tickers:${exchange}:${type}`;
  return withTaseCache(cacheKey, async () => {
    const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_list&exchange=${exchange}&type=${type}`;
    const xmlString = await fetchXml(globesApiUrl, signal);
    const xmlDoc = parseXmlString(xmlString);
    return extractDataFromXmlNS(xmlDoc, GLOBES_API_NAMESPACE, 'anyType', (element): GlobesTicker | null => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') {
        return null;
      }
      
      const getElementText = (tagName: string) => element.getElementsByTagNameNS(GLOBES_API_NAMESPACE, tagName)[0]?.textContent || '';

      // The 'symbol' tag from the Globes API XML is used as the numeric security ID for joining with TASE data.
      const numericSecurityId = getElementText('symbol');
      const name_he = getElementText('name_he');
      const name_en = getElementText('name_en');
      const globesInstrumentId = getElementText('instrumentId');

      if (!numericSecurityId || !globesInstrumentId) {
        // Essential data is missing, so we can't use this entry.
        return null;
      }
      return {
        numericSecurityId,
        // The symbol from Globes is the security ID, which we also use as the symbol itself here.
        symbol: numericSecurityId,
        name_he,
        name_en,
        globesInstrumentId,
        type: type,
      };
    });
  });
}

/**
 * Helper to fetch all enabled Globes tickers for a given exchange.
 */
async function fetchGlobesTickers(
  exchange: string,
  config: SecurityTypeConfig,
  signal?: AbortSignal
): Promise<GlobesTicker[]> {
  const instrumentTypes = Object.keys(config);
  return (await Promise.all(instrumentTypes.map(async (type) => {
    if (config[type]?.enabled) {
      try {
        console.log(`Fetching Globes tickers for type: ${type} on exchange: ${exchange}`);
        const res = await fetchGlobesTickersByType(type, exchange, signal);
        console.log(`Fetched ${res.length} Globes tickers for type: ${type} on exchange: ${exchange}`);
        return res;
      } catch (e) {
        console.warn(`Failed to fetch Globes tickers for type ${type} on exchange ${exchange}:`, e);
      }
    }
    return [];
  }))).flat().filter((t): t is GlobesTicker => t !== undefined);
}

/**
 * Fetches all tickers based on exchange and configuration.
 * @param exchange - The exchange to fetch tickers for (e.g., 'TASE').
 * @param config - Configuration specifying which security types to fetch.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to a record of tickers grouped by type.
 */
export async function fetchAllTickers(
  exchange: string,
  config: SecurityTypeConfig = DEFAULT_SECURITY_TYPE_CONFIG,
  signal?: AbortSignal
): Promise<Record<string, TaseTicker[]>> {
  if (exchange.toUpperCase() === 'TASE') {
    return fetchTaseTickers(signal, config);
  }
  
  if (exchange.toUpperCase() === 'IL_FUND') {
    const tickers = await fetchGemelnetTickers(signal);
    return { 'fund': tickers };
  }

  // Fetch from Globes alone for other exchanges
  const allGlobesTickers = await fetchGlobesTickers(exchange, config, signal);

   const allTickers: TaseTicker[] = allGlobesTickers.map(globesTicker => ({
      securityId: Number(globesTicker.numericSecurityId) || 0, // Fallback if not numeric
      symbol: getEffectiveTicker(globesTicker.symbol, exchange) || globesTicker.symbol,
      exchange: exchange,
      companyName: globesTicker.name_en,
      companySuperSector: '',
      companySector: '',
      companySubSector: '',
      globesInstrumentId: globesTicker.globesInstrumentId,
      type: globesTicker.type,
      name_he: globesTicker.name_he,
      name_en: globesTicker.name_en,
      taseType: config[globesTicker.type]?.displayName || 'Unknown',
   }));

   // Group by type
   const grouped = allTickers.reduce((acc, ticker) => {
    const type = ticker.type || 'unknown';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(ticker);
    return acc;
  }, {} as Record<string, TaseTicker[]>);

  console.log(`Final ${exchange} tickers distribution:`, Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));
  return grouped;
}

/**
 * Fetches all TASE tickers, enriched with data from Globes.
 * Private implementation for TASE specific logic (fetching from TASE API and merging with Globes).
 */
async function fetchTaseTickers(
  signal?: AbortSignal,
  config: SecurityTypeConfig = DEFAULT_SECURITY_TYPE_CONFIG
): Promise<Record<string, TaseTicker[]>> {

  // 1. Fetch base data from TASE
  const taseSecurities = await fetchTaseSecurities(signal);

  // 2. Fetch all enabled types from Globes
  const allGlobesTickers = await fetchGlobesTickers('tase', config, signal);

  // 3. Create a map for efficient lookup of Globes data
  const globesTickerMap = new Map<string, GlobesTicker>();
  for (const ticker of allGlobesTickers) {
      globesTickerMap.set(ticker.numericSecurityId, ticker);
  }

  console.log(`Total Globes tickers fetched: ${allGlobesTickers.length}. Unique IDs: ${globesTickerMap.size}`);

  const allTickers: TaseTicker[] = [];
  const matchedGlobesIds = new Set<string>();

  // 4. Left join: Iterate TASE securities and enrich with Globes data
  for (const security of taseSecurities) {
      const globesTicker = globesTickerMap.get(String(security.securityId));
      if (globesTicker) {
        matchedGlobesIds.add(globesTicker.numericSecurityId);
      }

      const taseType = taseSecurityTypeMap.get(security.securityFullTypeCode);
      const globesType = globesTicker?.type  || (globesTicker ? getGlobesTypeFromTaseType(globesTicker.type) : undefined);
 
      allTickers.push({
          // Data from TASE API
          securityId: security.securityId,
          exchange: 'TASE',
          name_en: security.securityName,
          symbol: getEffectiveTicker(security.symbol, 'TASE') || security.symbol,
          companyName: security.companyName,
          companySuperSector: security.companySuperSector,
          companySector: security.companySector,
          companySubSector: security.companySubSector,
          // Enriched/fallback data from Globes
          globesInstrumentId: globesTicker?.globesInstrumentId || '',
          type: globesType || 'Unknown',
          name_he: globesTicker?.name_he || security.securityName,
          taseType: taseType?.subType || 'Unknown',
      });
  }

  console.log(`Merged TASE data. Matched ${matchedGlobesIds.size} securities with Globes data out of ${taseSecurities.length} TASE securities.`);

  // 5. Complete the outer join: Add Globes tickers that didn't have a match in the TASE list
  for (const globesTicker of allGlobesTickers) {
      if (!matchedGlobesIds.has(globesTicker.numericSecurityId)) {
        // For globes-only tickers, we can't reliably determine the TASE type.
        allTickers.push({
            securityId: Number(globesTicker.numericSecurityId),
            exchange: 'TASE',
            symbol: getEffectiveTicker(globesTicker.symbol, 'TASE') || globesTicker.symbol,
            companyName: globesTicker.name_en, // Fallback to globes name
            companySuperSector: '',
            companySector: '',
            companySubSector: '',
            globesInstrumentId: globesTicker.globesInstrumentId,
            type: globesTicker.type,
            name_he: globesTicker.name_he,
            name_en: globesTicker.name_en,
            taseType: DEFAULT_SECURITY_TYPE_CONFIG[globesTicker.type]?.displayName || 'Unknown', // Use globes type as a fallback
        });
      }
  }
  
  // 6. Group all resulting tickers by type for the final output
  const grouped = allTickers.reduce((acc, ticker) => {
    const type = ticker.type || 'unknown';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(ticker);
    return acc;
  }, {} as Record<string, TaseTicker[]>);

  console.log('Final TASE tickers distribution:', Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));
  return grouped;
}