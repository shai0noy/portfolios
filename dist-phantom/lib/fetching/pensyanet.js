"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPensyanetFund = fetchPensyanetFund;
exports.fetchPensyanetTickers = fetchPensyanetTickers;
exports.fetchPensyanetQuote = fetchPensyanetQuote;
const xml_parser_1 = require("./utils/xml_parser");
const types_1 = require("../types");
const instrument_1 = require("../types/instrument");
const gemel_utils_1 = require("./gemel_utils");
const cache_1 = require("./utils/cache");
const config_1 = require("../../config");
const CACHE_KEY_PREFIX = 'pensyanet_v1_';
/**
 * Fetches historical fund data from Pensyanet.
 * Uses a local storage cache with a 48-hour TTL.
 *
 * @param fundId The ID of the fund.
 * @param startMonth Start date for the range.
 * @param endMonth End date for the range (default: Today).
 * @param forceRefresh If true, bypasses the cache.
 */
async function fetchPensyanetFund(fundId, startMonth, endMonth = new Date(), forceRefresh = false) {
    const sParts = (0, gemel_utils_1.getDateParts)(startMonth);
    const eParts = (0, gemel_utils_1.getDateParts)(endMonth);
    const cacheKey = `${CACHE_KEY_PREFIX}${fundId}_${sParts.year}${sParts.month}_${eParts.year}${eParts.month}`;
    const now = Date.now();
    // 1. Check Cache
    if (!forceRefresh) {
        try {
            const cached = await (0, cache_1.loadFromCache)(cacheKey);
            if (cached) {
                if (now - cached.timestamp < cache_1.GEMEL_CACHE_TTL) {
                    console.log(`[Pensyanet] Using cached data for fund ${fundId}`);
                    return cached.data;
                }
            }
        }
        catch (e) {
            console.warn('[Pensyanet] Error reading cache:', e);
        }
    }
    // 2. Fetch Data
    const url = `${config_1.WORKER_URL}/?apiId=pensyanet_fund&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}&fundId=${fundId}`;
    console.log(`[Pensyanet] Fetching data for fund ${fundId}...`);
    try {
        const xmlText = await (0, xml_parser_1.fetchXml)(url);
        const xmlDoc = (0, xml_parser_1.parseXmlString)(xmlText);
        // Pensyanet XML response uses 'ROW' (uppercase)
        const rows = Array.from(xmlDoc.querySelectorAll('ROW'));
        const points = [];
        rows.forEach(row => {
            const getText = (tag) => row.querySelector(tag)?.textContent || '';
            const dateStr = getText('TKF_DIVUACH');
            if (dateStr) {
                const returnStr = getText('TSUA_NOMINALI_BFOAL');
                points.push({
                    date: (0, gemel_utils_1.parseDateStr)(dateStr),
                    nominalReturn: returnStr ? parseFloat(returnStr) : 0
                });
            }
        });
        // Sort by date ascending
        points.sort((a, b) => a.date - b.date);
        const result = {
            fundId: fundId,
            fundName: '', // Populated by Quote wrapper
            data: points,
            lastUpdated: now,
        };
        // 3. Save to Cache
        try {
            await (0, cache_1.saveToCache)(cacheKey, result);
        }
        catch (e) {
            console.warn('[Pensyanet] Failed to save to cache (likely quota exceeded):', e);
        }
        return result;
    }
    catch (error) {
        console.error(`[Pensyanet] Failed to fetch or parse data for fund ${fundId}:`, error);
        return null;
    }
}
const LIST_CACHE_KEY = 'pensyanet_tickers_list_v10';
function compressTickers(tickers) {
    return tickers.map(t => {
        if (t.meta?.type !== 'PROVIDENT')
            return null;
        const pInfo = t.meta;
        const compressed = {
            i: pInfo.fundId,
            n: t.name,
            ft: t.type.specificType || '',
            mf: pInfo.managementFee,
            df: pInfo.depositFee,
        };
        return compressed;
    }).filter((t) => t !== null);
}
function decompressTickers(compact) {
    return compact.map(c => ({
        symbol: String(c.i),
        exchange: types_1.Exchange.PENSION,
        securityId: c.i,
        name: c.n,
        nameHe: c.n,
        type: new instrument_1.InstrumentClassification(instrument_1.InstrumentType.SAVING_PENSION, c.ft),
        meta: {
            type: 'PROVIDENT',
            fundId: c.i,
            managementFee: c.mf,
            depositFee: c.df,
        }
    }));
}
async function fetchPensyanetTickers(signal, forceRefresh = false) {
    const now = Date.now();
    // 1. Check Cache
    if (!forceRefresh) {
        try {
            const cached = await (0, cache_1.loadFromCache)(LIST_CACHE_KEY);
            if (cached) {
                if (now - cached.timestamp < cache_1.GEMEL_LIST_CACHE_TTL) {
                    console.log('[Pensyanet] Using cached tickers list');
                    return decompressTickers(cached.data);
                }
            }
        }
        catch (e) {
            console.warn('[Pensyanet] Cache read error', e);
        }
    }
    // 2. Fetch Data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const sParts = (0, gemel_utils_1.getDateParts)(startDate);
    const eParts = (0, gemel_utils_1.getDateParts)(endDate);
    const url = `${config_1.WORKER_URL}/?apiId=pensyanet_list&startYear=${sParts.year}&startMonth=${sParts.month}&endYear=${eParts.year}&endMonth=${eParts.month}`;
    console.log('[Pensyanet] Fetching tickers list...');
    try {
        const xmlText = await (0, xml_parser_1.fetchXml)(url, signal);
        const xmlDoc = (0, xml_parser_1.parseXmlString)(xmlText);
        const rows = Array.from(xmlDoc.querySelectorAll('ROW'));
        const tickersMap = new Map();
        const parseFee = (feeStr) => {
            const fee = parseFloat(feeStr);
            return isNaN(fee) ? undefined : fee;
        };
        rows.forEach(row => {
            const getText = (tag) => row.querySelector(tag)?.textContent || '';
            const idStr = getText('ID');
            const id = parseInt(idStr, 10);
            if (id && !tickersMap.has(id)) {
                const name = getText('SHM_KRN');
                tickersMap.set(id, {
                    symbol: idStr,
                    exchange: types_1.Exchange.PENSION,
                    securityId: id,
                    name: name,
                    nameHe: name,
                    type: new instrument_1.InstrumentClassification(instrument_1.InstrumentType.SAVING_PENSION, getText('SUG_KRN')),
                    meta: {
                        type: 'PROVIDENT',
                        fundId: id,
                        managementFee: parseFee(getText('SHIUR_D_NIHUL_AHARON_NCHASIM')),
                        depositFee: parseFee(getText('SHIUR_D_NIHUL_AHARON_HAFKADOT')),
                    }
                });
            }
        });
        const tickers = Array.from(tickersMap.values());
        try {
            const compressed = compressTickers(tickers);
            await (0, cache_1.saveToCache)(LIST_CACHE_KEY, compressed);
        }
        catch (e) {
            console.warn('[Pensyanet] Cache write error', e);
        }
        return tickers;
    }
    catch (e) {
        console.error('[Pensyanet] Error fetching tickers', e);
        return [];
    }
}
async function fetchPensyanetQuote(fundId, _signal, forceRefresh = false) {
    // 1. Fetch history and tickers list in parallel
    const endDate = new Date();
    const startDate = new Date('2000-01-01');
    const [fundData, tickers] = await Promise.all([
        fetchPensyanetFund(fundId, startDate, endDate, forceRefresh),
        fetchPensyanetTickers() // This uses its own cache, so it's efficient
    ]);
    if (!fundData || fundData.data.length === 0) {
        console.log(`[Pensyanet] fetchPensyanetQuote: No data found for ${fundId}`, fundData);
        return null;
    }
    // 2. Join with metadata from list (Fees, Name, etc.)
    const info = tickers.find(t => t.meta?.type === 'PROVIDENT' && t.meta.fundId === fundId);
    let providentInfo;
    if (info) {
        fundData.fundName = info.name || info.nameHe || '';
        if (info.meta?.type === 'PROVIDENT') {
            providentInfo = {
                fundId: info.meta.fundId,
                fundType: info.type.specificType,
                specialization: info.sector,
                subSpecialization: info.subSector,
                managementFee: info.meta.managementFee,
                depositFee: info.meta.depositFee,
            };
        }
    }
    return (0, gemel_utils_1.calculateTickerDataFromFundHistory)(fundData, types_1.Exchange.PENSION, 'Pensyanet', providentInfo);
}
