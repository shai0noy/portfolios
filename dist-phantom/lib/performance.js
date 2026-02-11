"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePortfolioPerformance = calculatePortfolioPerformance;
exports.calculatePeriodReturns = calculatePeriodReturns;
// src/lib/performance.ts
const fetching_1 = require("./fetching");
const currency_1 = require("./currency");
const types_1 = require("./types");
/**
 * Computes historical portfolio performance (Market Value and Gains) over time.
 */
async function calculatePortfolioPerformance(holdings, transactions, displayCurrency, exchangeRates, portfolioPolicies, signal, fetchHistoryFn = fetching_1.fetchTickerHistory) {
    if (!transactions || !Array.isArray(transactions)) {
        console.warn("calculatePortfolioPerformance received invalid transactions:", transactions);
        return { points: [], historyMap: new Map() };
    }
    // Treat vesting date as buy date (ignore unvested until they vest)
    const effectiveTxns = transactions.map(t => t.vestDate ? { ...t, date: t.vestDate } : t);
    const relevantPortIds = new Set([...holdings.map(h => h.portfolioId), ...effectiveTxns.map(t => t.portfolioId)]);
    const sortedTxns = effectiveTxns
        .filter(t => relevantPortIds.has(t.portfolioId))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sortedTxns.length === 0)
        return { points: [], historyMap: new Map() };
    // 1. Identify all tickers ever held and fetch their history
    const allTickersEver = new Map();
    sortedTxns.forEach(t => {
        if (t.exchange) {
            allTickersEver.set(`${t.exchange}:${t.ticker}`, { ticker: t.ticker, exchange: t.exchange });
        }
    });
    const histories = await Promise.all(Array.from(allTickersEver.values()).map(info => fetchHistoryFn(info.ticker, info.exchange, signal)
        .then(data => ({ key: `${info.exchange}:${info.ticker}`, data }))
        .catch(() => ({ key: `${info.exchange}:${info.ticker}`, data: null }))));
    const historyMap = new Map();
    histories.forEach(h => historyMap.set(h.key, h.data));
    // 2. Build a unique set of all dates across all histories
    const allTimestamps = new Set();
    histories.forEach(h => {
        h.data?.historical?.forEach((p) => {
            const d = new Date(p.date);
            d.setUTCHours(0, 0, 0, 0);
            allTimestamps.add(d.getTime());
        });
    });
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    if (sortedTimestamps.length === 0)
        return { points: [], historyMap: new Map() };
    // Filter to only include dates from the first transaction
    const fDate = new Date(sortedTxns[0].date);
    fDate.setUTCHours(0, 0, 0, 0);
    const firstTxnDate = fDate.getTime();
    const activeTimestamps = sortedTimestamps.filter(ts => ts >= firstTxnDate);
    if (activeTimestamps.length === 0)
        return { points: [], historyMap: new Map() };
    // 4. Time-series aggregation
    const points = [];
    const currentHoldings = new Map();
    let otherGains = 0; // Cumulative dividends, fees, realized gains
    let txnIdx = 0;
    // TWR State
    let prevHoldingsValue = 0;
    let twrIndex = 1.0;
    // Pre-calculate indices for historical prices and map current holdings metadata
    const historyPointers = new Map();
    histories.forEach(h => historyPointers.set(h.key, 0));
    const holdingsMap = new Map();
    holdings.forEach(h => holdingsMap.set(`${h.exchange}:${h.ticker}`, h));
    for (const ts of activeTimestamps) {
        const currentDate = new Date(ts);
        let dayNetFlow = 0;
        let dayDividends = 0;
        let dayFees = 0;
        // Apply all transactions that happened ON or BEFORE this date (by Day)
        while (txnIdx < sortedTxns.length) {
            const tDate = new Date(sortedTxns[txnIdx].date);
            tDate.setUTCHours(0, 0, 0, 0);
            if (tDate.getTime() > ts)
                break;
            const t = sortedTxns[txnIdx];
            const tickerKey = `${t.exchange}:${t.ticker}`;
            const stateKey = `${t.portfolioId}:${tickerKey}`;
            const holding = holdingsMap.get(tickerKey);
            const resolvedStockCurrency = holding?.stockCurrency || t.currency || types_1.Currency.USD;
            const state = currentHoldings.get(stateKey) || { qty: 0, costBasis: 0, stockCurrency: resolvedStockCurrency };
            let tQty = t.qty || 0;
            const tPrice = t.price || 0;
            // Strict DRIP Policy Check
            if (t.type === 'DIVIDEND' && tQty > 0) {
                const policy = portfolioPolicies?.get(t.portfolioId)?.divPolicy;
                if (policy === 'cash_taxed') {
                    // console.warn(`[Performance] Ignoring DRIP qty for portfolio ${t.portfolioId} with policy ${policy}`);
                    tQty = 0;
                }
            }
            // Calculate Value: Prefer grossValue, fallback to qty*price, or price if div/fee with 0 qty
            let tValue = t.grossValue || 0;
            if (!tValue) {
                if ((t.type === 'DIVIDEND' || t.type === 'FEE') && Math.abs(tQty) < 1e-9) {
                    tValue = tPrice;
                }
                else {
                    tValue = tQty * tPrice;
                }
            }
            const stockCurrency = state.stockCurrency;
            const costToAdd = (0, currency_1.convertCurrency)(tValue, t.currency || types_1.Currency.USD, stockCurrency, exchangeRates);
            if (t.type === 'BUY') {
                state.qty += tQty;
                state.costBasis += costToAdd;
                const flowValDisplay = (0, currency_1.convertCurrency)(tValue, t.currency || types_1.Currency.USD, displayCurrency, exchangeRates);
                dayNetFlow += flowValDisplay;
            }
            else if (t.type === 'SELL') {
                const avgCost = state.qty > 0 ? state.costBasis / state.qty : 0;
                state.qty -= tQty;
                state.costBasis -= tQty * avgCost;
                const proceedsDisplay = (0, currency_1.convertCurrency)(tValue, t.currency || types_1.Currency.USD, displayCurrency, exchangeRates);
                const costOfSoldDisplay = (0, currency_1.convertCurrency)(tQty * avgCost, stockCurrency, displayCurrency, exchangeRates);
                otherGains += (proceedsDisplay - costOfSoldDisplay);
                dayNetFlow -= proceedsDisplay;
            }
            else if (t.type === 'DIVIDEND') {
                // For dividends, value is ALWAYS added to returns (cash flow out of stock into pocket/account)
                // If it was DRIP (qty > 0):
                //  - value added to Performance (Income)
                //  - But since we bought shares, is it "Flow"? 
                //  - Actually, DRIP is effectively: Dividend Income (Flow Out/Income) + Immediate Buy (Flow In).
                //  - Net Flow = 0?
                //  - If we model it as just "Qty Increase", we miss the "Income" part in `dayDividends`.
                //  - But `otherGains` captures it?
                // Let's stick to simple model:
                // Dividend = Value gained.
                // If Qty > 0 (Allowed DRIP):
                //   - We likely need to treat it as a Buy too?
                //   - Current logic: `state.qty += ...`? No, DIVIDEND block doesn't add to `state.qty` below!
                //   - WAIT. Previous code logic for DIVIDEND did NOT update `state.qty`.
                //   - So DRIP was effectively broken anyway unless handled as a separate BUY?
                //   - Checks lines 157+ (old 147): Yes, `else if (t.type === 'DIVIDEND')` only adds to `otherGains`. It does NOT increase `qty`.
                //   - So `qty` on DIVIDEND transactions was ALREADY ignored for holding count!
                //   - The user asked to "assert that drip only occurs on portfolios that have it".
                //   - If the previous code ignored qty, then DRIP wasn't working.
                // Correction: If `qty` is passed, we probably SHOULD increase quantity if it's a DRIP.
                // But if the code never did `state.qty += tQty` for dividends, then it never supported DRIP.
                // UNLESS DRIPs come as two transactions: Dividend (Cash) + Buy (Shares).
                // If they come as a single "DIVIDEND" txn with qty > 0, we need to handle it.
                const divVal = (0, currency_1.convertCurrency)(tValue, t.currency || types_1.Currency.USD, displayCurrency, exchangeRates);
                otherGains += divVal;
                dayDividends += divVal;
                if (tQty > 0) {
                    // Handle DRIP - Increase Qty, Increase Cost Basis?
                    // Cost Basis for DRIP is the dividend amount reinvested.
                    state.qty += tQty;
                    state.costBasis += costToAdd;
                }
            }
            else if (t.type === 'FEE') {
                const feeVal = (0, currency_1.convertCurrency)(tValue, t.currency || types_1.Currency.USD, displayCurrency, exchangeRates);
                otherGains -= feeVal;
                dayFees += feeVal;
            }
            if (state.qty > 1e-9) {
                currentHoldings.set(stateKey, state);
            }
            else {
                currentHoldings.delete(stateKey);
            }
            txnIdx++;
        }
        let totalHoldingsValue = 0;
        let totalCostBasis = 0;
        // Sum values of all current holdings at this specific date
        currentHoldings.forEach((state, stateKey) => {
            const [, exchange, ticker] = stateKey.split(':');
            const tickerKey = `${exchange}:${ticker}`;
            const history = historyMap.get(tickerKey);
            if (!history?.historical)
                return;
            const hist = history.historical;
            let ptr = historyPointers.get(tickerKey) || 0;
            while (ptr + 1 < hist.length && new Date(hist[ptr + 1].date).getTime() <= ts) {
                ptr++;
            }
            historyPointers.set(tickerKey, ptr);
            const point = hist[ptr];
            if (point && new Date(point.date).getTime() <= ts) {
                const price = point.adjClose || point.price;
                if (price > 0) {
                    const priceCurrency = history.currency || state.stockCurrency;
                    const valDisplay = (0, currency_1.convertCurrency)(state.qty * price, priceCurrency, displayCurrency, exchangeRates);
                    const costDisplay = (0, currency_1.convertCurrency)(state.costBasis, state.stockCurrency, displayCurrency, exchangeRates);
                    totalHoldingsValue += valDisplay;
                    totalCostBasis += costDisplay;
                }
            }
        });
        // TWR Calculation (End-of-Day Flow Assumption)
        // 1. Calculate return on the capital that started the day
        const denom = prevHoldingsValue;
        let dayReturn = 0;
        if (denom > 1e-6) {
            // Market Gain = (End Value - Net Flows) - Start Value
            // We remove Net Flows because they are "new money" not generated by the market
            const marketGain = (totalHoldingsValue - dayNetFlow) - prevHoldingsValue;
            // Total Return = Market Gain + Income
            const totalGain = marketGain + dayDividends - dayFees;
            dayReturn = totalGain / denom;
        }
        else if (dayNetFlow > 1e-6) {
            // Special Case: Inception Day (or Restart after empty)
            // prevHoldingsValue is 0, but we have new flow today.
            // We assume flow happened at start (or at least participated in the day's move) for this specific case,
            // otherwise we lose the first day's performance.
            // If we assume flow at start:
            // Start adjusted = dayNetFlow.
            // Gain = (End Value - dayNetFlow) - 0.
            // But wait, if we assume flow at start, then End Value includes the flow + gain.
            // Market Gain logic above: (Val - Flow) - Prev.
            // If Val = 110, Flow = 100, Prev = 0. Market Gain = 10.
            // Return = 10 / 100 = 10%.
            const marketGain = (totalHoldingsValue - dayNetFlow) - prevHoldingsValue;
            const totalGain = marketGain + dayDividends - dayFees;
            dayReturn = totalGain / dayNetFlow;
        }
        twrIndex *= (1 + dayReturn);
        prevHoldingsValue = totalHoldingsValue;
        points.push({
            date: currentDate,
            holdingsValue: totalHoldingsValue,
            costBasis: totalCostBasis,
            gainsValue: (totalHoldingsValue - totalCostBasis) + otherGains,
            twr: twrIndex
        });
    }
    return { points, historyMap };
}
/**
 * Calculates percentage returns for standard periods based on TWR points.
 * Returns 0 for periods with insufficient data.
 */
function calculatePeriodReturns(points) {
    if (points.length === 0) {
        return {
            perf1w: 0, gain1w: 0,
            perf1m: 0, gain1m: 0,
            perf3m: 0, gain3m: 0,
            perfYtd: 0, gainYtd: 0,
            perf1y: 0, gain1y: 0,
            perf5y: 0, gain5y: 0,
            perfAll: 0, gainAll: 0
        };
    }
    const latestPoint = points[points.length - 1];
    const latestDate = new Date(latestPoint.date);
    const latestTwr = latestPoint.twr;
    const latestGainsVal = latestPoint.gainsValue;
    const getPointAtDate = (targetDate) => {
        const targetTime = targetDate.getTime();
        if (targetTime < new Date(points[0].date).getTime()) {
            // Virtual start point
            return { date: new Date(0), twr: 1.0, gainsValue: 0, holdingsValue: 0, costBasis: 0 };
        }
        let found = points[0];
        for (let i = 0; i < points.length; i++) {
            if (new Date(points[i].date).getTime() > targetTime)
                break;
            found = points[i];
        }
        return found;
    };
    const subtractPeriod = (date, period) => {
        const d = new Date(date);
        switch (period) {
            case '1w':
                d.setUTCDate(d.getUTCDate() - 7);
                break;
            case '1m':
                d.setUTCMonth(d.getUTCMonth() - 1);
                break;
            case '3m':
                d.setUTCMonth(d.getUTCMonth() - 3);
                break;
            case 'ytd':
                d.setUTCMonth(0, 0);
                d.setUTCHours(0, 0, 0, 0);
                break; // Dec 31st of previous year (UTC)
            case '1y':
                d.setUTCFullYear(d.getUTCFullYear() - 1);
                break;
            case '5y':
                d.setUTCFullYear(d.getUTCFullYear() - 5);
                break;
            case 'all': return new Date(0);
        }
        return d;
    };
    const calcReturn = (period) => {
        const startDate = subtractPeriod(latestDate, period);
        if (startDate.getTime() > latestDate.getTime())
            return { perf: 0, gain: 0 };
        const startPoint = getPointAtDate(startDate);
        // TWR
        const perf = (latestTwr / startPoint.twr) - 1;
        // Absolute Gain ($)
        // Gain over period = Total Gains (End) - Total Gains (Start)
        // This works because gainsValue tracks cumulative Realized + Unrealized gains/losses
        // including dividends/fees, from the start of time.
        const gain = latestGainsVal - startPoint.gainsValue;
        return { perf, gain };
    };
    const r1w = calcReturn('1w');
    const r1m = calcReturn('1m');
    const r3m = calcReturn('3m');
    const rYtd = calcReturn('ytd');
    const r1y = calcReturn('1y');
    const r5y = calcReturn('5y');
    const rAll = calcReturn('all');
    return {
        perf1w: r1w.perf, gain1w: r1w.gain,
        perf1m: r1m.perf, gain1m: r1m.gain,
        perf3m: r3m.perf, gain3m: r3m.gain,
        perfYtd: rYtd.perf, gainYtd: rYtd.gain,
        perf1y: r1y.perf, gain1y: r1y.gain,
        perf5y: r5y.perf, gain5y: r5y.gain,
        perfAll: rAll.perf, gainAll: rAll.gain
    };
}
