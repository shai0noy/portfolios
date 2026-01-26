/**
 * @fileoverview Fetches and combines stock data from TASE (Tel Aviv Stock Exchange) and Globes financial news.
 * This file provides functions to get a full list of TASE-traded securities and enrich them with data from Globes.
 */

import type { TaseSecurity } from './types';
import type { TickerProfile } from '../types/ticker';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import { fetchGemelnetTickers } from './gemelnet';
import { fetchPensyanetTickers } from './pensyanet';
import taseTypeIds from './tase_type_ids.json';
import { Exchange } from '../types';
import { fetchGlobesTickersByType } from './globes';

// Pattern matching for TASE main type to our canonical InstrumentType
const taseTypePatterns: [RegExp, InstrumentType][] = [
    // Order matters: more specific patterns should come first.
    
    // Stocks
    [/preferred share/i, InstrumentType.STOCK_PREF],
    [/share/i, InstrumentType.STOCK], // Covers "ORDINARY SHARE", "SHARE"
    [/warrant/i, InstrumentType.STOCK_WARRANT], 
    [/rights/i, InstrumentType.STOCK], // Treat rights as stock-like for now
    [/r&d unit/i, InstrumentType.STOCK],
    [/part\. unit/i, InstrumentType.STOCK_PARTICIPATING_UNIT],
    [/reit/i, InstrumentType.STOCK_REIT], // Often not explicit in type string, but good to have pattern

    // ETFs
    [/etf/i, InstrumentType.ETF],
    [/etn/i, InstrumentType.ETF],
    [/certificate/i, InstrumentType.ETF], // SAL/Certificate

    // Mutual Funds
    [/mutual fund/i, InstrumentType.MUTUAL_FUND],
    [/investment fund/i, InstrumentType.MUTUAL_FUND],
    [/high tech fund/i, InstrumentType.MUTUAL_FUND],

    // Bonds
    [/treasury bill/i, InstrumentType.BOND_MAKAM],
    [/govt\. bond/i, InstrumentType.BOND_GOV],
    [/convert\. bond/i, InstrumentType.BOND_CONVERTIBLE],
    [/corp\. bond/i, InstrumentType.BOND_CORP],
    [/bond/i, InstrumentType.BOND_CORP], // General fallback for bonds

    // Options/Futures
    [/w\.call/i, InstrumentType.OPTION_TASE], // Warrants traded like options? TASE specific naming
    [/w\.put/i, InstrumentType.OPTION_TASE],
    [/w\.future/i, InstrumentType.FUTURE],
    [/call option/i, InstrumentType.OPTION_MAOF], // Usually Maof options
    [/put option/i, InstrumentType.OPTION_MAOF],
    [/future/i, InstrumentType.FUTURE],
    [/dollar option/i, InstrumentType.OPTION],
    [/option/i, InstrumentType.OPTION], 
    
    // Index
    [/index/i, InstrumentType.INDEX],
];

/**
 * Finds a corresponding canonical InstrumentType for a given TASE security type description using pattern matching.
 */
function getInstrumentTypeFromTaseType(taseType: string): InstrumentType {
    for (const [pattern, type] of taseTypePatterns) {
        if (pattern.test(taseType)) {
            return type;
        }
    }
    return InstrumentType.UNKNOWN;
}

function getEffectiveTicker(ticker: string | undefined, exchange: Exchange | undefined) {
  if (!ticker || !exchange) return ticker || '';
  if (exchange === Exchange.TASE) {
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
 * Helper to fetch all enabled Globes tickers for a given exchange.
 * Returns TickerProfile[] directly from globes fetcher.
 */
async function fetchGlobesTickers(
  exchange: Exchange,
  // We fetch all relevant types for the exchange.
  // Ideally this list should come from INSTRUMENT_METADATA groups but for now we iterate legacy keys
  signal?: AbortSignal
): Promise<TickerProfile[]> {
  
  // List of globes legacy type keys we care about for general exchanges
  // Note: We could derive this from GLOBES_TYPE_MAPPING keys
  const globesTypes = [
      'stock', 'etf', 'fund', 'index', 'currency'
      // bond, option etc are usually TASE specific in our current Globes usage context
  ];

  if (exchange === Exchange.TASE) {
      // For TASE, we might fetch more specific globes lists if needed, 
      // but fetchTaseTickers handles the main TASE logic.
      // This function is mostly for NON-TASE exchanges (US, Forex).
      return [];
  }

  return (await Promise.all(globesTypes.map(async (type) => {
      try {
        // console.log(`Fetching Globes tickers for type: ${type} on exchange: ${exchange}`);
        const res = await fetchGlobesTickersByType(type, exchange, signal);
        return res;
      } catch (e) {
        console.warn(`Failed to fetch Globes tickers for type ${type} on exchange ${exchange}:`, e);
      }
    return [];
  }))).flat();
}

/**
 * Fetches all tickers based on exchange.
 * @param exchange - The exchange to fetch tickers for (e.g., 'TASE').
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to a record of tickers grouped by type.
 */
export async function fetchAllTickers(
  exchange: Exchange,
  _config: any = {}, // Deprecated config
  signal?: AbortSignal
): Promise<Record<string, TickerProfile[]>> {
  if (exchange === Exchange.TASE) {
    return fetchTaseTickers(signal);
  }
  
  if (exchange === Exchange.GEMEL) {
    const tickers = await fetchGemelnetTickers(signal);
    return { 'gemel_fund': tickers }; // Key matches legacy/globes key for compatibility if needed, or just grouping key
  }

  if (exchange === Exchange.PENSION) {
    const tickers = await fetchPensyanetTickers(signal);
    return { 'pension_fund': tickers };
  }

  // Fetch from Globes alone for other exchanges (US, Forex)
  const allGlobesTickers = await fetchGlobesTickers(exchange, signal);

   const allTickers: TickerProfile[] = allGlobesTickers.map(globesTicker => ({
      ...globesTicker,
      symbol: getEffectiveTicker(globesTicker.symbol, exchange) || globesTicker.symbol,
      exchange: exchange,
      // Ensure type is classified if not already (Globes fetcher does this, but good to ensure)
   }));

   // Group by canonical type code
   const grouped = allTickers.reduce((acc, ticker) => {
    const typeCode = ticker.type.type;
    if (!acc[typeCode]) {
      acc[typeCode] = [];
    }
    acc[typeCode].push(ticker);
    return acc;
  }, {} as Record<string, TickerProfile[]>);

  console.log(`Final ${exchange} tickers distribution:`, Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));
  return grouped;
}

/**
 * Fetches all TASE tickers, enriched with data from Globes.
 * Private implementation for TASE specific logic (fetching from TASE API and merging with Globes).
 */
async function fetchTaseTickers(
  signal?: AbortSignal
): Promise<Record<string, TickerProfile[]>> {

  // Fetch TASE securities (Primary Source for TASE)
  const taseSecuritiesPromise = fetchTaseSecurities(signal);
  
  // Fetch Globes data for TASE (Enrichment Source)
  // We fetch all relevant globes categories for TASE
  const globesTypes = [
      'stock', 'etf', 'fund', 'makam', 'gov_generic', 'bond_ta', 'bond_conversion', 'option_ta', 'option_maof', 'option_other', 'index'
  ];
  
  const globesTickersPromise = Promise.all(globesTypes.map(async type => {
      try {
          return await fetchGlobesTickersByType(type, Exchange.TASE, signal);
      } catch (e) {
          console.warn(`Failed to fetch Globes TASE tickers for type ${type}:`, e);
          return [];
      }
  })).then(results => results.flat());

  const [taseSecurities, allGlobesTickers] = await Promise.all([
    taseSecuritiesPromise,
    globesTickersPromise
  ]);

  // 3. Create a map for efficient lookup of Globes data
  // Map by securityId (stringified)
  const globesTickerMap = new Map<string, TickerProfile>();
  for (const ticker of allGlobesTickers) {
      if (ticker.securityId) {
        globesTickerMap.set(String(ticker.securityId), ticker);
      }
  }

  console.log(`Total Globes tickers fetched: ${allGlobesTickers.length}. Unique IDs: ${globesTickerMap.size}`);

  const allTickers: TickerProfile[] = [];
  const matchedGlobesIds = new Set<string>();

  // 4. Left join: Iterate TASE securities and enrich with Globes data
  for (const security of taseSecurities) {
      const securityIdStr = String(security.securityId);
      const globesTicker = globesTickerMap.get(securityIdStr);
      
      if (globesTicker) {
        matchedGlobesIds.add(securityIdStr);
      }

      // Determine Type
      // Priority 1: TASE Type (Finer grain)
      const taseTypeRaw = taseSecurityTypeMap.get(security.securityFullTypeCode);
      const taseTypeStr = taseTypeRaw?.subType || 'Unknown';
      let classification = new InstrumentClassification(InstrumentType.UNKNOWN, taseTypeStr);
      
      // Attempt to resolve TASE type to canonical type
      const canonicalFromTase = getInstrumentTypeFromTaseType(taseTypeStr);
      if (canonicalFromTase !== InstrumentType.UNKNOWN) {
          classification = new InstrumentClassification(canonicalFromTase, taseTypeStr);
      } else if (globesTicker) {
          // Priority 2: Globes Type (if TASE resolution failed)
          // We trust Globes classification if TASE one was ambiguous
          classification = globesTicker.type; 
      }

      // Determine Name
      // Priority: Globes Name (often cleaner) > TASE Name
      const name = globesTicker?.name || security.securityName;
      const nameHe = globesTicker?.nameHe || security.securityNameHe;

      // Determine Sector
      // Priority: TASE Sector (official) > Globes
      const sector = security.companySubSector || security.companySector || globesTicker?.sector;
      const subSector = security.companySubSector || globesTicker?.subSector;

      allTickers.push({
          symbol: getEffectiveTicker(security.symbol, Exchange.TASE) || security.symbol,
          exchange: Exchange.TASE,
          securityId: securityIdStr,
          
          name: name,
          nameHe: nameHe,
          
          type: classification,
          
          sector: sector,
          subSector: subSector,
          
          meta: {
            type: 'TASE',
            securityId: security.securityId,
            isin: security.isin
          }
      });
  }

  console.log(`Merged TASE data. Matched ${matchedGlobesIds.size} securities with Globes data out of ${taseSecurities.length} TASE securities.`);

  // 5. Complete the outer join: Add Globes tickers that didn't have a match in the TASE list
  // (e.g. Indices, or data sync issues)
  for (const globesTicker of allGlobesTickers) {
      if (globesTicker.securityId && !matchedGlobesIds.has(globesTicker.securityId)) {
        allTickers.push(globesTicker);
      }
  }
  
  // 6. Group all resulting tickers by type for the final output
  const grouped = allTickers.reduce((acc, ticker) => {
    const typeCode = ticker.type.type;
    if (!acc[typeCode]) {
      acc[typeCode] = [];
    }
    acc[typeCode].push(ticker);
    return acc;
  }, {} as Record<string, TickerProfile[]>);

  console.log('Final TASE tickers distribution:', Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));
  return grouped;
}