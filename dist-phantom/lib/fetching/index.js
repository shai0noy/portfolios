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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTickersDataset = getTickersDataset;
exports.getTickerData = getTickerData;
exports.fetchTickerHistory = fetchTickerHistory;
// src/lib/fetching/index.ts
const globes_1 = require("./globes");
const yahoo_1 = require("./yahoo");
const stock_list_1 = require("./stock_list");
const gemelnet_1 = require("./gemelnet");
const pensyanet_1 = require("./pensyanet");
const cbs_1 = require("./cbs");
const yahoo_tickers_1 = require("./yahoo_tickers");
const types_1 = require("../types");
__exportStar(require("./types"), exports);
__exportStar(require("./stock_list"), exports);
__exportStar(require("./cbs"), exports);
__exportStar(require("./yahoo"), exports);
__exportStar(require("./yahoo_tickers"), exports);
__exportStar(require("./globes"), exports);
__exportStar(require("./gemelnet"), exports);
__exportStar(require("./pensyanet"), exports);
let tickersDataset = null;
let tickersDatasetLoading = null;
function getTickersDataset(signal, forceRefresh = false) {
    if (tickersDataset && !forceRefresh) {
        return Promise.resolve(tickersDataset);
    }
    if (tickersDatasetLoading) {
        return tickersDatasetLoading;
    }
    tickersDatasetLoading = (async () => {
        try {
            const exchanges = [types_1.Exchange.TASE, types_1.Exchange.NASDAQ, types_1.Exchange.NYSE, types_1.Exchange.GEMEL, types_1.Exchange.PENSION, types_1.Exchange.FOREX];
            const results = await Promise.all(exchanges.map(ex => (0, stock_list_1.fetchAllTickers)(ex, undefined, signal)));
            const combined = {};
            results.forEach(res => {
                Object.entries(res).forEach(([type, items]) => {
                    if (!combined[type])
                        combined[type] = [];
                    combined[type] = combined[type].concat(items);
                });
            });
            // Add CBS tickers
            const cbsTickers = (0, cbs_1.getCbsTickers)();
            if (cbsTickers.length > 0) {
                if (!combined['Index'])
                    combined['Index'] = [];
                combined['Index'] = combined['Index'].concat(cbsTickers);
            }
            // Add Predefined Yahoo Tickers (Futures, Commodities)
            const yahooTickers = (0, yahoo_tickers_1.getPredefinedYahooTickers)();
            yahooTickers.forEach((t) => {
                const groupName = t.type.nameEn; // Use the English name of the classification as group
                if (!combined[groupName])
                    combined[groupName] = [];
                combined[groupName].push(t);
            });
            tickersDataset = combined;
            return combined;
        }
        catch (e) {
            console.error('Failed to load tickers dataset:', e);
            return {};
        }
        finally {
            tickersDatasetLoading = null;
        }
    })();
    return tickersDatasetLoading;
}
function combineHistory(histShort, histMax) {
    const hShort = histShort || [];
    const hMax = histMax || [];
    if (hShort.length === 0 && hMax.length === 0)
        return undefined;
    if (hShort.length === 0)
        return hMax;
    if (hMax.length === 0)
        return hShort;
    // Assume hMax covers the full range but might be lower resolution.
    // We want to use hShort (e.g. 5y daily) for the recent period and hMax for older data.
    // Find the start date of hShort
    const shortStartDate = hShort[0].date.getTime();
    // Take everything from hMax that is BEFORE hShort starts
    const olderData = hMax.filter(p => p.date.getTime() < shortStartDate);
    const combined = [...olderData, ...hShort];
    return combined.sort((a, b) => a.date.getTime() - b.date.getTime());
}
async function getTickerData(ticker, exchange, numericSecurityId, signal, forceRefresh = false) {
    let parsedExchange;
    try {
        parsedExchange = (0, types_1.parseExchange)(exchange);
    }
    catch (e) {
        console.warn(`getTickerData: Invalid exchange '${exchange}', defaulting to NASDAQ for Yahoo fallback logic.`, e);
        // For invalid exchange, we can only try yahoo.
        return (0, yahoo_1.fetchYahooTickerData)(ticker, types_1.Exchange.NASDAQ, signal, forceRefresh, 'max');
    }
    const secId = numericSecurityId ? Number(numericSecurityId) : undefined;
    const tickerNum = Number(ticker);
    // Lookup profile to determine group/type for smart fetching
    const profileLookupPromise = getTickersDataset(signal).then(dataset => {
        for (const list of Object.values(dataset)) {
            const found = list.find(t => t.exchange === parsedExchange &&
                (t.symbol === ticker || (secId && t.securityId === secId)));
            if (found)
                return found;
        }
        return undefined;
    }).catch(e => {
        console.warn('Error looking up ticker profile:', e);
        return undefined;
    });
    // GEMEL has its own dedicated fetcher
    if (parsedExchange === types_1.Exchange.GEMEL) {
        return (0, gemelnet_1.fetchGemelnetQuote)(tickerNum, signal, forceRefresh);
    }
    // PENSION has its own dedicated fetcher
    if (parsedExchange === types_1.Exchange.PENSION) {
        return (0, pensyanet_1.fetchPensyanetQuote)(tickerNum, signal, forceRefresh);
    }
    // CBS has its own dedicated fetcher
    if (parsedExchange === types_1.Exchange.CBS) {
        return (0, cbs_1.fetchCpi)(tickerNum, signal);
    }
    const profile = await profileLookupPromise;
    const group = profile?.type.group;
    const [yahooData5y, yahooDataMax] = await Promise.all([
        (0, yahoo_1.fetchYahooTickerData)(ticker, parsedExchange, signal, forceRefresh, '5y', group),
        (0, yahoo_1.fetchYahooTickerData)(ticker, parsedExchange, signal, forceRefresh, 'max', group)
    ]);
    let yahooData = null;
    if (yahooData5y || yahooDataMax) {
        if (!yahooData5y)
            yahooData = yahooDataMax;
        else if (!yahooDataMax)
            yahooData = yahooData5y;
        else {
            // Merge: use 5y for recent stats/precision, max for long term
            yahooData = {
                // TODO: Make merging logic cleaner
                ...yahooDataMax,
                ...yahooData5y,
                // Explicitly ensure long term stats come from Max
                changePct3y: yahooDataMax.changePct3y,
                changeDate3y: yahooDataMax.changeDate3y,
                changePct5y: yahooDataMax.changePct5y,
                changeDate5y: yahooDataMax.changeDate5y,
                changePctMax: yahooDataMax.changePctMax,
                changeDateMax: yahooDataMax.changeDateMax,
                // Use combined historical data so the chart has max range immediately
                historical: combineHistory(yahooData5y.historical, yahooDataMax.historical),
                dividends: yahooDataMax.dividends,
                splits: yahooDataMax.splits,
                fromCache: yahooData5y.fromCache,
                fromCacheMax: yahooDataMax.fromCache
            };
        }
    }
    let globesPromise;
    let taseProfilePromise = Promise.resolve(profile);
    if (parsedExchange === types_1.Exchange.TASE) {
        taseProfilePromise = Promise.resolve(profile);
        if (secId) {
            globesPromise = (0, globes_1.fetchGlobesStockQuote)(ticker, secId, parsedExchange, signal, forceRefresh);
        }
        else {
            // If we don't have securityId, we try to find it from the profile
            const sid = profile?.securityId;
            if (sid) {
                globesPromise = (0, globes_1.fetchGlobesStockQuote)(ticker, sid, parsedExchange, signal, forceRefresh);
            }
            else {
                globesPromise = Promise.resolve(null);
            }
        }
    }
    else {
        globesPromise = (0, globes_1.fetchGlobesStockQuote)(ticker, secId, parsedExchange, signal, forceRefresh);
    }
    const [globesData, _unusedYahoo, taseProfile] = await Promise.all([
        globesPromise,
        Promise.resolve(yahooData),
        taseProfilePromise
    ]);
    if (parsedExchange === types_1.Exchange.TASE && taseProfile) {
        console.log(`[getTickerData] Found TASE profile for ${ticker}:`, taseProfile);
    }
    // Fallback to Yahoo if the first source fails, or merge data if both succeed.
    if (!globesData) {
        if (yahooData) {
            return {
                ...yahooData,
                meta: taseProfile?.meta || yahooData.meta,
                type: taseProfile?.type || yahooData.type,
                name: taseProfile?.name || yahooData.name,
                nameHe: taseProfile?.nameHe || yahooData.nameHe,
                sector: taseProfile?.sector || yahooData.sector,
                subSector: taseProfile?.subSector || yahooData.subSector,
            };
        }
        // No data from Globes or Yahoo, but maybe we have TASE profile info
        if (taseProfile) {
            return {
                ticker: taseProfile.symbol,
                exchange: types_1.Exchange.TASE,
                numericId: taseProfile.securityId ?? null,
                name: taseProfile.name,
                nameHe: taseProfile.nameHe,
                type: taseProfile.type,
                meta: taseProfile.meta,
                price: 0,
                source: 'TASE Profile'
            };
        }
        return yahooData;
    }
    // Merge data: Prefer TASE Profile > Globes > Yahoo
    const finalData = {
        ...globesData,
        meta: taseProfile?.meta || globesData?.meta || yahooData?.meta,
        type: taseProfile?.type || globesData?.type || yahooData?.type,
        name: taseProfile?.name || globesData?.name || yahooData?.name,
        nameHe: taseProfile?.nameHe || globesData?.nameHe || yahooData?.nameHe,
        sector: taseProfile?.sector || globesData?.sector || yahooData?.sector,
        subSector: taseProfile?.subSector || globesData?.subSector || yahooData?.subSector,
    };
    if (yahooData) {
        // Fill in missing fields from Yahoo.
        return {
            ...finalData,
            historical: globesData.historical ?? yahooData.historical, // Use the merged historical from yahooData if globes is missing it
            dividends: globesData.dividends ?? yahooData.dividends,
            splits: globesData.splits ?? yahooData.splits,
            changePct1d: globesData.changePct1d ?? yahooData.changePct1d,
            changeDate1d: globesData.changePct1d !== undefined ? globesData.changeDate1d : yahooData.changeDate1d,
            changePctRecent: globesData.changePctRecent ?? yahooData.changePctRecent,
            changeDateRecent: globesData.changePctRecent !== undefined ? globesData.changeDateRecent : yahooData.changeDateRecent,
            recentChangeDays: globesData.changePctRecent !== undefined ? globesData.recentChangeDays : yahooData.recentChangeDays,
            changePct1m: globesData.changePct1m ?? yahooData.changePct1m,
            changeDate1m: globesData.changePct1m !== undefined ? globesData.changeDate1m : yahooData.changeDate1m,
            changePct3m: globesData.changePct3m ?? yahooData.changePct3m,
            changeDate3m: globesData.changePct3m !== undefined ? globesData.changeDate3m : yahooData.changeDate3m,
            changePct1y: globesData.changePct1y ?? yahooData.changePct1y,
            changeDate1y: globesData.changePct1y !== undefined ? globesData.changeDate1y : yahooData.changeDate1y,
            changePct3y: globesData.changePct3y ?? yahooData.changePct3y,
            changeDate3y: globesData.changePct3y !== undefined ? globesData.changeDate3y : yahooData.changeDate3y,
            changePct5y: globesData.changePct5y ?? yahooData.changePct5y,
            changeDate5y: globesData.changePct5y !== undefined ? globesData.changeDate5y : yahooData.changeDate5y,
            changePctYtd: globesData.changePctYtd ?? yahooData.changePctYtd,
            changeDateYtd: globesData.changePctYtd !== undefined ? globesData.changeDateYtd : yahooData.changeDateYtd,
            changePctMax: globesData.changePctMax ?? yahooData.changePctMax,
            changeDateMax: globesData.changePctMax !== undefined ? globesData.changeDateMax : yahooData.changeDateMax,
            openPrice: globesData.openPrice ?? yahooData.openPrice,
            source: `${globesData.source} + Yahoo Finance`,
            sector: taseProfile?.sector || globesData.sector || yahooData.sector,
            subSector: taseProfile?.subSector || globesData.subSector || yahooData.subSector,
            taseType: globesData.taseType,
            volume: globesData.volume ?? yahooData.volume,
            fromCache: yahooData.fromCache,
            fromCacheMax: yahooData.fromCacheMax
        };
    }
    return finalData;
}
async function fetchTickerHistory(ticker, exchange, signal, forceRefresh = false) {
    const tickerNum = Number(ticker);
    if (exchange === types_1.Exchange.GEMEL) {
        const data = await (0, gemelnet_1.fetchGemelnetQuote)(tickerNum, signal, forceRefresh);
        return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }
    if (exchange === types_1.Exchange.PENSION) {
        const data = await (0, pensyanet_1.fetchPensyanetQuote)(tickerNum, signal, forceRefresh);
        return { historical: data?.historical, dividends: data?.dividends, splits: data?.splits, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }
    if (exchange === types_1.Exchange.CBS) {
        const data = await (0, cbs_1.fetchCpi)(tickerNum, signal);
        return { historical: data?.historical, fromCache: data?.fromCache, fromCacheMax: data?.fromCacheMax };
    }
    // Lookup profile to determine group for smart fetching
    const profile = await getTickersDataset(signal).then(dataset => {
        const tickerNum = parseInt(ticker, 10);
        for (const list of Object.values(dataset)) {
            const found = list.find(t => t.exchange === exchange &&
                (t.symbol === ticker || (!isNaN(tickerNum) && t.securityId === tickerNum)));
            if (found)
                return found;
        }
        return undefined;
    }).catch(() => undefined);
    const group = profile?.type.group;
    const [yahooData5y, yahooDataMax] = await Promise.all([
        (0, yahoo_1.fetchYahooTickerData)(ticker, exchange, signal, forceRefresh, '5y', group),
        (0, yahoo_1.fetchYahooTickerData)(ticker, exchange, signal, false, 'max', group)
    ]);
    return {
        historical: combineHistory(yahooData5y?.historical, yahooDataMax?.historical),
        dividends: yahooDataMax?.dividends,
        splits: yahooDataMax?.splits,
        fromCache: yahooData5y?.fromCache,
        fromCacheMax: yahooDataMax?.fromCache
    };
}
