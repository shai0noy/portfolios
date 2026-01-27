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
 * Fetches the list of mutual funds from the TASE API.
 */
async function fetchTaseFunds(signal?: AbortSignal): Promise<any[]> {
    const url = `https://portfolios.noy-shai.workers.dev/?apiId=tase_list_funds`;
    try {
        console.log(`Fetching TASE funds...`);
        const response = await fetch(url, { signal });
        if (!response.ok) {
            console.error(`Failed to fetch TASE funds: ${response.statusText}`);
            return [];
        }
        const data = await response.json();
        const result = data?.funds?.result || [];
        console.log(`Fetched ${result.length} TASE funds.`);
        return result;
    } catch(e) {
        console.error('Error fetching or parsing TASE funds', e);
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

  // 1. Fetch all sources in parallel
  const [taseSecurities, taseFunds, allGlobesTickers] = await Promise.all([
    fetchTaseSecurities(signal),
    fetchTaseFunds(signal),
    Promise.all([
        'stock', 'etf', 'fund', 'makam', 'gov_generic', 'bond_ta', 'bond_conversion', 'option_ta', 'option_maof', 'option_other', 'index'
    ].map(async type => {
        try {
            return await fetchGlobesTickersByType(type, Exchange.TASE, signal);
        } catch (e) {
            console.warn(`Failed to fetch Globes TASE tickers for type ${type}:`, e);
            return [];
        }
    })).then(results => results.flat())
  ]);

  // 2. Build lookup maps by security ID (as string)
  const stockMap = new Map<string, TaseSecurity>();
  taseSecurities.forEach(s => stockMap.set(String(s.securityId), s));

  const fundMap = new Map<string, any>();
  taseFunds.forEach(f => fundMap.set(String(f.fundId), f));

  const globesMap = new Map<string, TickerProfile>();
  allGlobesTickers.forEach(t => {
      if (t.securityId) globesMap.set(String(t.securityId), t);
  });

  // 3. Gather all unique IDs
  const allIds = new Set([...stockMap.keys(), ...fundMap.keys(), ...globesMap.keys()]);
  const allTickers: TickerProfile[] = [];

  // 4. Merge logic for each unique ID
  allIds.forEach(id => {
      const security = stockMap.get(id);
      const fund = fundMap.get(id);
      const globes = globesMap.get(id);

      // --- Determine Symbol ---
      // Priority: TASE Stock List Symbol > TASE Fund ID > Globes Symbol
      const symbol = (security?.symbol ? getEffectiveTicker(security.symbol, Exchange.TASE) : null) || 
                     (fund?.fundId ? String(fund.fundId) : null) || 
                     globes?.symbol || 
                     id;

      // --- Determine Name ---
      // Priority: TASE Funds List (Long > Short) > Globes > TASE Stock List
      const name = (fund?.fundLongName || fund?.fundName) || 
                   globes?.name || 
                   security?.securityName || 
                   id;
      
      const nameHe = (fund?.fundLongName || fund?.fundName) || 
                     globes?.nameHe || 
                     security?.securityNameHe || 
                     security?.securityName || 
                     name;

      // --- Determine Type & Classification ---
      // We prioritize TASE's classification as it's more definitive.
      // Funds list can contain ETFs and MTFs.
      let typeCodeStr = fund?.classificationMain?.value || fund?.classificationMajor?.value;
      if (!typeCodeStr && security) {
          const taseTypeRaw = taseSecurityTypeMap.get(security.securityFullTypeCode);
          typeCodeStr = taseTypeRaw?.subType;
      }
      
      let classification = new InstrumentClassification(
          fund ? InstrumentType.MUTUAL_FUND : (globes?.type.type || InstrumentType.UNKNOWN), 
          typeCodeStr || 'Unknown'
      );

      const canonicalFromTase = getInstrumentTypeFromTaseType(typeCodeStr || '');
      if (canonicalFromTase !== InstrumentType.UNKNOWN) {
          classification = new InstrumentClassification(canonicalFromTase, typeCodeStr);
      } else if (globes) {
          classification = globes.type;
      }

      // --- Determine Sectors ---
      const superSector = fund?.classificationMajor?.value || security?.companySuperSector;
      const sector = fund?.classificationMain?.value || security?.companySector || globes?.sector;
      const subSector = fund?.classificationSecondary?.value || security?.companySubSector || globes?.subSector;

      // --- Underlying Assets (Funds only) ---
      const underlyingAssets = fund?.underlyingAsset?.map((a: any) => {
          // Handle both direct and nested asset structures found in TASE API responses
          const assetName = a.value || a.underlyingAsset?.value;
          const assetWeight = a.weight ?? a.underlyingAsset?.weight;
          return {
              name: assetName,
              weight: assetWeight
          };
      }).filter((a: any) => a.name && a.weight != null);

      if (underlyingAssets && underlyingAssets.length > 0) {
          console.log(`[fetchTaseTickers] Found ${underlyingAssets.length} assets for fund ${id}:`, underlyingAssets);
      }

      allTickers.push({
          symbol,
          exchange: Exchange.TASE,
          securityId: id,
          name,
          nameHe,
          type: classification,
          sector,
          subSector,
          meta: {
              type: 'TASE',
              securityId: parseInt(id, 10),
              isin: security?.isin || fund?.isin,
              superSector,
              shortName: fund?.fundName || security?.securityName,
              exposureProfile: fund?.exposureProfile,
              underlyingAssets
          }
      });
  });

  console.log(`Merged TASE data from ${stockMap.size} stocks, ${fundMap.size} funds, and ${globesMap.size} globes entries into ${allTickers.length} unique tickers.`);

  // 5. Group all resulting tickers by type for the final output
  const grouped = allTickers.reduce((acc, ticker) => {
    const typeCode = ticker.type.type;
    if (!acc[typeCode]) {
      acc[typeCode] = [];
    }
    acc[typeCode].push(ticker);
    return acc;
  }, {} as Record<string, TickerProfile[]>);

  return grouped;
}
