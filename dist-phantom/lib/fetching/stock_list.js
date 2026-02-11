"use strict";
/**
 * @fileoverview Fetches and combines stock data from TASE (Tel Aviv Stock Exchange) and Globes financial news.
 * This file provides functions to get a full list of TASE-traded securities and enrich them with data from Globes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllTickers = fetchAllTickers;
const instrument_1 = require("../types/instrument");
const gemelnet_1 = require("./gemelnet");
const pensyanet_1 = require("./pensyanet");
const tase_type_ids_json_1 = __importDefault(require("./tase_type_ids.json"));
const types_1 = require("../types");
const globes_1 = require("./globes");
const config_1 = require("../../config");
// Pattern matching for TASE main type to our canonical InstrumentType
const taseTypePatterns = [
    // Order matters: more specific patterns should come first.
    // Stocks
    [/preferred share/i, instrument_1.InstrumentType.STOCK_PREF],
    [/share/i, instrument_1.InstrumentType.STOCK], // Covers "ORDINARY SHARE", "SHARE"
    [/warrant/i, instrument_1.InstrumentType.STOCK_WARRANT],
    [/rights/i, instrument_1.InstrumentType.STOCK], // Treat rights as stock-like for now
    [/r&d unit/i, instrument_1.InstrumentType.STOCK],
    [/part\. unit/i, instrument_1.InstrumentType.STOCK_PARTICIPATING_UNIT],
    [/reit/i, instrument_1.InstrumentType.STOCK_REIT], // Often not explicit in type string, but good to have pattern
    // ETFs
    [/etf/i, instrument_1.InstrumentType.ETF],
    [/etn/i, instrument_1.InstrumentType.ETF],
    [/certificate/i, instrument_1.InstrumentType.ETF], // SAL/Certificate
    // Mutual Funds
    [/mutual fund/i, instrument_1.InstrumentType.MUTUAL_FUND],
    [/investment fund/i, instrument_1.InstrumentType.MUTUAL_FUND],
    [/high tech fund/i, instrument_1.InstrumentType.MUTUAL_FUND],
    // Bonds
    [/treasury bill/i, instrument_1.InstrumentType.BOND_MAKAM],
    [/govt\. bond/i, instrument_1.InstrumentType.BOND_GOV],
    [/convert\. bond/i, instrument_1.InstrumentType.BOND_CONVERTIBLE],
    [/corp\. bond/i, instrument_1.InstrumentType.BOND_CORP],
    [/bond/i, instrument_1.InstrumentType.BOND_CORP], // General fallback for bonds
    // Options/Futures
    [/w\.call/i, instrument_1.InstrumentType.OPTION_TASE], // Warrants traded like options? TASE specific naming
    [/w\.put/i, instrument_1.InstrumentType.OPTION_TASE],
    [/w\.future/i, instrument_1.InstrumentType.FUTURE],
    [/call option/i, instrument_1.InstrumentType.OPTION_MAOF], // Usually Maof options
    [/put option/i, instrument_1.InstrumentType.OPTION_MAOF],
    [/future/i, instrument_1.InstrumentType.FUTURE],
    [/dollar option/i, instrument_1.InstrumentType.OPTION],
    [/option/i, instrument_1.InstrumentType.OPTION],
    // Index
    [/index/i, instrument_1.InstrumentType.INDEX],
];
/**
 * Finds a corresponding canonical InstrumentType for a given TASE security type description using pattern matching.
 */
function getInstrumentTypeFromTaseType(taseType) {
    for (const [pattern, type] of taseTypePatterns) {
        if (pattern.test(taseType)) {
            return type;
        }
    }
    return instrument_1.InstrumentType.UNKNOWN;
}
function getEffectiveTicker(ticker, exchange) {
    if (!ticker || !exchange)
        return ticker || '';
    if (exchange === types_1.Exchange.TASE) {
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
const taseSecurityTypeMap = new Map();
tase_type_ids_json_1.default.securitiesTypes.result.forEach(type => {
    if (type.securityFullTypeCode && type.securityMainTypeDesc) {
        taseSecurityTypeMap.set(type.securityFullTypeCode, { type: type.securityMainTypeDesc, subType: type.securityTypeDesc || type.securityMainTypeDesc });
    }
});
/**
 * Fetches the complete list of securities from the TASE API.
 * @param signal - Optional AbortSignal to cancel the request.
 * @returns A promise that resolves to an array of TASE securities. Returns an empty array on failure.
 */
async function fetchTaseSecurities(signal) {
    const url = `${config_1.WORKER_URL}/?apiId=tase_list_stocks`;
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
    }
    catch (e) {
        console.error('Error fetching or parsing TASE securities', e);
        return [];
    }
}
/**
 * Fetches the list of mutual funds from the TASE API.
 */
async function fetchTaseFunds(signal) {
    const url = `${config_1.WORKER_URL}/?apiId=tase_list_funds`;
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
    }
    catch (e) {
        console.error('Error fetching or parsing TASE funds', e);
        return [];
    }
}
/**
 * Helper to fetch all enabled Globes tickers for a given exchange.
 * Returns TickerProfile[] directly from globes fetcher.
 */
async function fetchGlobesTickers(exchange, 
// We fetch all relevant types for the exchange.
// Ideally this list should come from INSTRUMENT_METADATA groups but for now we iterate legacy keys
signal) {
    // List of globes legacy type keys we care about for general exchanges
    // Note: We could derive this from GLOBES_TYPE_MAPPING keys
    const globesTypes = [
        'stock', 'etf', 'fund', 'index', 'currency'
        // bond, option etc are usually TASE specific in our current Globes usage context
    ];
    if (exchange === types_1.Exchange.TASE) {
        // For TASE, we might fetch more specific globes lists if needed, 
        // but fetchTaseTickers handles the main TASE logic.
        // This function is mostly for NON-TASE exchanges (US, Forex).
        return [];
    }
    return (await Promise.all(globesTypes.map(async (type) => {
        try {
            // console.log(`Fetching Globes tickers for type: ${type} on exchange: ${exchange}`);
            const res = await (0, globes_1.fetchGlobesTickersByType)(type, exchange, signal);
            return res;
        }
        catch (e) {
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
async function fetchAllTickers(exchange, _config = {}, // Deprecated config
signal) {
    if (exchange === types_1.Exchange.TASE) {
        return fetchTaseTickers(signal);
    }
    if (exchange === types_1.Exchange.GEMEL) {
        const tickers = await (0, gemelnet_1.fetchGemelnetTickers)(signal);
        return { 'gemel_fund': tickers }; // Key matches legacy/globes key for compatibility if needed, or just grouping key
    }
    if (exchange === types_1.Exchange.PENSION) {
        const tickers = await (0, pensyanet_1.fetchPensyanetTickers)(signal);
        return { 'pension_fund': tickers };
    }
    // Fetch from Globes alone for other exchanges (US, Forex)
    const allGlobesTickers = await fetchGlobesTickers(exchange, signal);
    const allTickers = allGlobesTickers.map(globesTicker => ({
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
    }, {});
    console.log(`Final ${exchange} tickers distribution:`, Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));
    return grouped;
}
/**
 * Fetches all TASE tickers, enriched with data from Globes.
 * Private implementation for TASE specific logic (fetching from TASE API and merging with Globes).
 */
async function fetchTaseTickers(signal) {
    // 1. Fetch all sources in parallel
    const [taseSecurities, taseFunds, allGlobesTickers] = await Promise.all([
        fetchTaseSecurities(signal),
        fetchTaseFunds(signal),
        Promise.all([
            'stock', 'etf', 'fund', 'makam', 'gov_generic', 'bond_ta', 'bond_conversion', 'option_ta', 'option_maof', 'option_other', 'index'
        ].map(async (type) => {
            try {
                return await (0, globes_1.fetchGlobesTickersByType)(type, types_1.Exchange.TASE, signal);
            }
            catch (e) {
                console.warn(`Failed to fetch Globes TASE tickers for type ${type}:`, e);
                return [];
            }
        })).then(results => results.flat())
    ]);
    // 2. Build lookup maps by security ID (as string)
    const stockMap = new Map();
    taseSecurities.forEach(s => stockMap.set(String(s.securityId), s));
    const fundMap = new Map();
    taseFunds.forEach(f => fundMap.set(String(f.fundId), f));
    const globesMap = new Map();
    allGlobesTickers.forEach(t => {
        if (t.securityId)
            globesMap.set(String(t.securityId), t);
    });
    // 3. Gather all unique IDs
    const allIds = new Set([...stockMap.keys(), ...fundMap.keys(), ...globesMap.keys()]);
    const allTickers = [];
    // 4. Merge logic for each unique ID
    allIds.forEach(id => {
        const security = stockMap.get(id);
        const fund = fundMap.get(id);
        const globes = globesMap.get(id);
        // --- Determine Symbol ---
        // Priority: TASE Stock List Symbol > TASE Fund ID > Globes Symbol
        const symbol = (security?.symbol ? getEffectiveTicker(security.symbol, types_1.Exchange.TASE) : null) ||
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
        let classification = new instrument_1.InstrumentClassification(fund ? instrument_1.InstrumentType.MUTUAL_FUND : (globes?.type.type || instrument_1.InstrumentType.UNKNOWN), typeCodeStr || 'Unknown');
        const canonicalFromTase = getInstrumentTypeFromTaseType(typeCodeStr || '');
        if (canonicalFromTase !== instrument_1.InstrumentType.UNKNOWN) {
            classification = new instrument_1.InstrumentClassification(canonicalFromTase, typeCodeStr);
        }
        else if (globes) {
            classification = globes.type;
        }
        // --- Determine Sectors ---
        const superSector = fund?.classificationMajor?.value || security?.companySuperSector;
        const sector = fund?.classificationMain?.value || security?.companySector || globes?.sector;
        const subSector = fund?.classificationSecondary?.value || security?.companySubSector || globes?.subSector;
        // --- Underlying Assets (Funds only) ---
        const underlyingAssets = fund?.underlyingAsset?.map((a) => {
            // Handle both direct and nested asset structures found in TASE API responses
            const assetName = a.value || a.underlyingAsset?.value;
            const assetWeight = a.weight ?? a.underlyingAsset?.weight;
            return {
                name: assetName,
                weight: assetWeight
            };
        }).filter((a) => a.name && a.weight != null);
        const parsedId = parseInt(id, 10);
        allTickers.push({
            symbol,
            exchange: types_1.Exchange.TASE,
            securityId: !isNaN(parsedId) ? parsedId : undefined,
            name,
            nameHe,
            type: classification,
            sector,
            subSector,
            meta: {
                type: 'TASE',
                securityId: !isNaN(parsedId) ? parsedId : 0, // Fallback to 0 if NaN, though should be valid here
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
    }, {});
    return grouped;
}
