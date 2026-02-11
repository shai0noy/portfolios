"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateParts = getDateParts;
exports.parseDateStr = parseDateStr;
exports.calculateTickerDataFromFundHistory = calculateTickerDataFromFundHistory;
exports.calculateTickerDataFromIndexHistory = calculateTickerDataFromIndexHistory;
// Helper to get date parts
function getDateParts(date) {
    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return { year: y, month: m };
}
// Helper to parse YYYYMM to timestamp (returns End of Month)
function parseDateStr(dateStr) {
    if (!dateStr || dateStr.length !== 6)
        return 0;
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed in JS Date
    // Day 0 of next month is the last day of the current month
    return new Date(y, m + 1, 0).getTime();
}
/**
 * Calculates historical performance metrics and builds TickerData
 * from raw fund history.
 */
function calculateTickerDataFromFundHistory(fundData, exchange, sourceName, providentInfo) {
    if (!fundData || fundData.data.length === 0) {
        return null;
    }
    const { fundId, fundName, data } = fundData;
    // Sort by date ascending for index calculation
    const sortedData = [...data].sort((a, b) => a.date - b.date);
    // Build Price Index (Map: YYYY-MM -> { price, date })
    const priceMap = new Map();
    let currentPrice = 100;
    const historical = [];
    const getKey = (ts) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    for (const point of sortedData) {
        currentPrice *= (1 + point.nominalReturn / 100);
        priceMap.set(getKey(point.date), { price: currentPrice, date: point.date });
        historical.push({ date: new Date(point.date), price: currentPrice });
    }
    const latestPoint = sortedData[sortedData.length - 1];
    const latestPrice = currentPrice;
    const getChange = (months) => {
        const d = new Date(latestPoint.date);
        d.setDate(1); // Set to 1st of month to avoid overflow when subtracting months from 31st
        d.setMonth(d.getMonth() - months);
        const base = priceMap.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        return base ? { pct: latestPrice / base.price - 1, date: base.date } : undefined;
    };
    const [chg1m, chg3m, chg1y, chg3y, chg5y, chg10y] = [1, 3, 12, 36, 60, 120].map(getChange);
    // YTD
    const lastYear = new Date(latestPoint.date).getFullYear();
    const currYear = new Date().getFullYear();
    let chgYtd;
    if (lastYear < currYear) {
        chgYtd = { pct: 0, date: new Date(currYear, 0, 1).getTime() };
    }
    else {
        const base = priceMap.get(`${lastYear - 1}-12`) || (() => {
            const first = sortedData.find(d => new Date(d.date).getFullYear() === lastYear);
            if (!first)
                return undefined;
            const startPrice = priceMap.get(getKey(first.date)).price / (1 + first.nominalReturn / 100);
            return { price: startPrice, date: first.date };
        })();
        if (base)
            chgYtd = { pct: latestPrice / base.price - 1, date: base.date };
    }
    // Max
    const first = sortedData[0];
    const startPrice = priceMap.get(getKey(first.date)).price / (1 + first.nominalReturn / 100);
    const chgMax = { pct: latestPrice / startPrice - 1, date: first.date };
    const tickerData = {
        ticker: String(fundId),
        numericId: fundId,
        exchange: exchange,
        price: latestPrice,
        ...(chg1m && { changePct1m: chg1m.pct, changeDate1m: new Date(chg1m.date) }),
        ...(chg3m && { changePct3m: chg3m.pct, changeDate3m: new Date(chg3m.date) }),
        ...(chgYtd && { changePctYtd: chgYtd.pct, changeDateYtd: new Date(chgYtd.date) }),
        ...(chg1y && { changePct1y: chg1y.pct, changeDate1y: new Date(chg1y.date) }),
        ...(chg3y && { changePct3y: chg3y.pct, changeDate3y: new Date(chg3y.date) }),
        ...(chg5y && { changePct5y: chg5y.pct, changeDate5y: new Date(chg5y.date) }),
        ...(chg10y && { changePct10y: chg10y.pct, changeDate10y: new Date(chg10y.date) }),
        ...(chgMax && { changePctMax: chgMax.pct, changeDateMax: new Date(chgMax.date) }),
        timestamp: new Date(latestPoint.date),
        currency: 'ILS', // Could also be 'ILA', doesn't matter due to lack of real price
        name: fundName,
        nameHe: fundName,
        source: sourceName,
        historical,
        providentInfo,
    };
    return tickerData;
}
/**
 * Calculates historical performance metrics and builds TickerData
 * from a raw series of index values.
 * The `nominalReturn` field in `FundDataPoint` is expected to be the absolute index value.
 */
function calculateTickerDataFromIndexHistory(fundData, exchange, sourceName, providentInfo) {
    if (!fundData || fundData.data.length === 0) {
        return null;
    }
    const { fundId, fundName, data } = fundData;
    // Sort by date ascending
    const sortedData = [...data].sort((a, b) => a.date - b.date);
    // Build Price Index Map (Map: YYYY-MM -> { price, date })
    // Here, "price" is the index value.
    const priceMap = new Map();
    const historical = [];
    const getKey = (ts) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    for (const point of sortedData) {
        // The 'nominalReturn' field holds the absolute index value.
        const indexValue = point.nominalReturn;
        priceMap.set(getKey(point.date), { price: indexValue, date: point.date });
        historical.push({ date: new Date(point.date), price: indexValue });
    }
    const latestPoint = sortedData[sortedData.length - 1];
    const latestPrice = latestPoint.nominalReturn;
    const getChange = (months) => {
        const d = new Date(latestPoint.date);
        d.setDate(1); // Set to 1st of month to avoid overflow
        d.setMonth(d.getMonth() - months);
        const base = priceMap.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        return base ? { pct: latestPrice / base.price - 1, date: base.date } : undefined;
    };
    const [chg1m, chg3m, chg1y, chg3y, chg5y, chg10y] = [1, 3, 12, 36, 60, 120].map(getChange);
    // YTD
    const currentYear = new Date(latestPoint.date).getFullYear();
    let chgYtd;
    const ytdBase = priceMap.get(`${currentYear - 1}-12`);
    if (ytdBase) {
        chgYtd = { pct: latestPrice / ytdBase.price - 1, date: ytdBase.date };
    }
    // Max change
    const firstPoint = sortedData[0];
    const chgMax = { pct: latestPrice / firstPoint.nominalReturn - 1, date: firstPoint.date };
    const tickerData = {
        ticker: String(fundId),
        numericId: fundId,
        exchange: exchange,
        price: latestPrice,
        ...(chg1m && { changePct1m: chg1m.pct, changeDate1m: new Date(chg1m.date) }),
        ...(chg3m && { changePct3m: chg3m.pct, changeDate3m: new Date(chg3m.date) }),
        ...(chgYtd && { changePctYtd: chgYtd.pct, changeDateYtd: new Date(chgYtd.date) }),
        ...(chg1y && { changePct1y: chg1y.pct, changeDate1y: new Date(chg1y.date) }),
        ...(chg3y && { changePct3y: chg3y.pct, changeDate3y: new Date(chg3y.date) }),
        ...(chg5y && { changePct5y: chg5y.pct, changeDate5y: new Date(chg5y.date) }),
        ...(chg10y && { changePct10y: chg10y.pct, changeDate10y: new Date(chg10y.date) }),
        ...(chgMax && { changePctMax: chgMax.pct, changeDateMax: new Date(chgMax.date) }),
        timestamp: new Date(latestPoint.date),
        currency: 'ILS',
        name: fundName,
        nameHe: fundName,
        source: sourceName,
        historical,
        providentInfo,
    };
    return tickerData;
}
