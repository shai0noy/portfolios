// src/lib/performance.ts
import { fetchTickerHistory } from './fetching';
import { convertCurrency } from './currency';
import { Currency, Exchange, type DashboardHolding, type Transaction, type ExchangeRates } from './types';

export interface PerformancePoint {
    date: Date;
    holdingsValue: number;
    gainsValue: number;
    costBasis: number;
    twr: number;
}

/**
 * Computes historical portfolio performance (Market Value and Gains) over time.
 */
export async function calculatePortfolioPerformance(
    holdings: DashboardHolding[],
    transactions: Transaction[],
    displayCurrency: string,
    exchangeRates: ExchangeRates,
    portfolioPolicies?: Map<string, { divPolicy: 'cash_taxed' | 'accumulate_tax_free' | 'hybrid_rsu' }>,
    signal?: AbortSignal,
    fetchHistoryFn: typeof fetchTickerHistory = fetchTickerHistory
): Promise<{ points: PerformancePoint[], historyMap: Map<string, any> }> {
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

    if (sortedTxns.length === 0) return { points: [], historyMap: new Map() };

    // 1. Identify all tickers ever held and fetch their history
    const allTickersEver = new Map<string, { ticker: string, exchange: Exchange }>();
    sortedTxns.forEach(t => {
        if (t.exchange) {
            allTickersEver.set(`${t.exchange}:${t.ticker}`, { ticker: t.ticker, exchange: t.exchange });
        }
    });

    const histories = await Promise.all(Array.from(allTickersEver.values()).map(info =>
        fetchHistoryFn(info.ticker, info.exchange, signal)
            .then(data => ({ key: `${info.exchange}:${info.ticker}`, data }))
            .catch(() => ({ key: `${info.exchange}:${info.ticker}`, data: null }))
    ));

    const historyMap = new Map<string, any>();
    histories.forEach(h => historyMap.set(h.key, h.data));

    // 2. Build a unique set of all dates across all histories
    const allTimestamps = new Set<number>();
    histories.forEach(h => {
        h.data?.historical?.forEach((p: any) => {
            const d = new Date(p.date);
            d.setUTCHours(0, 0, 0, 0);
            allTimestamps.add(d.getTime());
        });
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    if (sortedTimestamps.length === 0) return { points: [], historyMap: new Map() };

    // Filter to only include dates from the first transaction
    const fDate = new Date(sortedTxns[0].date);
    fDate.setUTCHours(0, 0, 0, 0);
    const firstTxnDate = fDate.getTime();
    const activeTimestamps = sortedTimestamps.filter(ts => ts >= firstTxnDate);

    if (activeTimestamps.length === 0) return { points: [], historyMap: new Map() };

    // 4. Time-series aggregation
    const points: PerformancePoint[] = [];
    const currentHoldings = new Map<string, { qty: number, costBasis: number, stockCurrency: Currency }>();
    let otherGains = 0; // Cumulative dividends, fees, realized gains
    let txnIdx = 0;

    // TWR State
    let prevHoldingsValue = 0;
    let twrIndex = 1.0;

    // Pre-calculate indices for historical prices and map current holdings metadata
    const historyPointers = new Map<string, number>();
    histories.forEach(h => historyPointers.set(h.key, 0));

    const holdingsMap = new Map<string, DashboardHolding>();
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



            if (tDate.getTime() > ts) break;

            const t = sortedTxns[txnIdx];

            const tickerKey = `${t.exchange}:${t.ticker}`;
            const stateKey = `${t.portfolioId}:${tickerKey}`;

            const holding = holdingsMap.get(tickerKey);
            const resolvedStockCurrency = holding?.stockCurrency || t.currency || Currency.USD;

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
                } else {
                    tValue = tQty * tPrice;
                }
            }

            const stockCurrency = state.stockCurrency;
            const costToAdd = convertCurrency(tValue, t.currency || Currency.USD, stockCurrency, exchangeRates);

            if (t.type === 'BUY') {
                state.qty += tQty;
                state.costBasis += costToAdd;
                const flowValDisplay = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                dayNetFlow += flowValDisplay;
            } else if (t.type === 'SELL') {
                const avgCost = state.qty > 0 ? state.costBasis / state.qty : 0;
                state.qty -= tQty;
                state.costBasis -= tQty * avgCost;

                const proceedsDisplay = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                const costOfSoldDisplay = convertCurrency(tQty * avgCost, stockCurrency, displayCurrency, exchangeRates);

                otherGains += (proceedsDisplay - costOfSoldDisplay);
                dayNetFlow -= proceedsDisplay;
            } else if (t.type === 'DIVIDEND') {
                // DRIP Logic:
                // If tQty > 0, we treat it as:
                // 1. Income: Dividend value added to `otherGains` (Total Return).
                // 2. Acquisition: Reinvested quantity added to `state.qty` and `state.costBasis`.
                // This ensures TWR captures the income, and future price moves capture compounding.

                const divVal = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                otherGains += divVal;
                dayDividends += divVal;

                if (tQty > 0) {
                    state.qty += tQty;
                    state.costBasis += costToAdd;
                }
            } else if (t.type === 'FEE') {
                const feeVal = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                otherGains -= feeVal;
                dayFees += feeVal;
            }

            if (state.qty > 1e-9) {
                currentHoldings.set(stateKey, state);
            } else {
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
            if (!history?.historical) return;

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

                    const valDisplay = convertCurrency(state.qty * price, priceCurrency, displayCurrency, exchangeRates);
                    const costDisplay = convertCurrency(state.costBasis, state.stockCurrency, displayCurrency, exchangeRates);

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
        } else if (dayNetFlow > 1e-6) {
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

export interface PeriodReturns {
    perf1w: number;
    gain1w: number;
    perf1m: number;
    gain1m: number;
    perf3m: number;
    gain3m: number;
    perfYtd: number;
    gainYtd: number;
    perf1y: number;
    gain1y: number;
    perf5y: number;
    gain5y: number;
    perfAll: number;
    gainAll: number;
}

/**
 * Calculates percentage returns for standard periods based on TWR points.
 * Returns 0 for periods with insufficient data.
 */
export function calculatePeriodReturns(points: PerformancePoint[]): PeriodReturns {
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

    const getPointAtDate = (targetDate: Date): PerformancePoint => {
        const targetTime = targetDate.getTime();
        if (targetTime < new Date(points[0].date).getTime()) {
            // Virtual start point
            return { date: new Date(0), twr: 1.0, gainsValue: 0, holdingsValue: 0, costBasis: 0 };
        }
        let found = points[0];
        for (let i = 0; i < points.length; i++) {
            if (new Date(points[i].date).getTime() > targetTime) break;
            found = points[i];
        }
        return found;
    };

    const subtractPeriod = (date: Date, period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y' | 'all'): Date => {
        const d = new Date(date);
        switch (period) {
            case '1w': d.setUTCDate(d.getUTCDate() - 7); break;
            case '1m': d.setUTCMonth(d.getUTCMonth() - 1); break;
            case '3m': d.setUTCMonth(d.getUTCMonth() - 3); break;
            case 'ytd': d.setUTCMonth(0, 0); d.setUTCHours(0, 0, 0, 0); break; // Dec 31st of previous year (UTC)
            case '1y': d.setUTCFullYear(d.getUTCFullYear() - 1); break;
            case '5y': d.setUTCFullYear(d.getUTCFullYear() - 5); break;
            case 'all': return new Date(0);
        }
        return d;
    };

    const calcReturn = (period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y' | 'all'): { perf: number, gain: number } => {
        const startDate = subtractPeriod(latestDate, period);
        if (startDate.getTime() > latestDate.getTime()) return { perf: 0, gain: 0 };

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