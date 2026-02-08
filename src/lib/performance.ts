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
    signal?: AbortSignal,
    fetchHistoryFn: typeof fetchTickerHistory = fetchTickerHistory
): Promise<PerformancePoint[]> {
    const relevantPortIds = new Set(holdings.map(h => h.portfolioId));
    const sortedTxns = transactions
        .filter(t => relevantPortIds.has(t.portfolioId))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sortedTxns.length === 0) return [];

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
            d.setHours(0, 0, 0, 0);
            allTimestamps.add(d.getTime());
        });
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    if (sortedTimestamps.length === 0) return [];

    // Filter to only include dates from the first transaction
    const firstTxnDate = new Date(sortedTxns[0].date).getTime();
    const activeTimestamps = sortedTimestamps.filter(ts => ts >= firstTxnDate);
    if (activeTimestamps.length === 0) return [];

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

        // Apply all transactions that happened ON or BEFORE this date
        while (txnIdx < sortedTxns.length && new Date(sortedTxns[txnIdx].date).getTime() <= ts) {
            const t = sortedTxns[txnIdx];
            const tickerKey = `${t.exchange}:${t.ticker}`;
            const stateKey = `${t.portfolioId}:${tickerKey}`; 
            
            const holding = holdingsMap.get(tickerKey);
            const resolvedStockCurrency = holding?.stockCurrency || t.currency || Currency.USD;

            const state = currentHoldings.get(stateKey) || { qty: 0, costBasis: 0, stockCurrency: resolvedStockCurrency };
            
            const tQty = t.qty || 0;
            const tPrice = t.price || 0;
            const tValue = tQty * tPrice; 
            
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
                const divVal = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                otherGains += divVal;
                dayDividends += divVal;
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

    return points;
}

export interface PeriodReturns {
    perf1w: number;
    perf1m: number;
    perf3m: number;
    perfYtd: number;
    perf1y: number;
    perf5y: number;
}

/**
 * Calculates percentage returns for standard periods based on TWR points.
 * Returns 0 for periods with insufficient data.
 */
export function calculatePeriodReturns(points: PerformancePoint[]): PeriodReturns {
    if (points.length === 0) {
        return {
            perf1w: 0,
            perf1m: 0,
            perf3m: 0,
            perfYtd: 0,
            perf1y: 0,
            perf5y: 0
        };
    }

    const latestPoint = points[points.length - 1];
    const latestDate = new Date(latestPoint.date);
    const latestTwr = latestPoint.twr;

    const getTwrAtDate = (targetDate: Date): number => {
        // Find the point closest to (but not after) the target date
        // Since points are sorted by date...
        // We want the point at the START of the window.
        // E.g. for 1 week return, we want price at (Now - 1 week).

        // Binary search or simple findLast
        const targetTime = targetDate.getTime();

        // If target is before the start of history, use the first point's TWR (which is usually 1.0 or close to start)
        // Actually TWR starts at 1.0 BEFORE the first day's moves? 
        // Our calculation starts with twrIndex = 1.0.
        // points[0] has twr *after* day 1.

        if (targetTime < new Date(points[0].date).getTime()) return 1.0;

        // Find last point <= targetTime
        let found = points[0];
        for (let i = 0; i < points.length; i++) {
            if (new Date(points[i].date).getTime() > targetTime) {
                break;
            }
            found = points[i];
        }
        return found.twr;
    };

    const subtractPeriod = (date: Date, period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y'): Date => {
        const d = new Date(date);
        switch (period) {
            case '1w': d.setDate(d.getDate() - 7); break;
            case '1m': d.setMonth(d.getMonth() - 1); break;
            case '3m': d.setMonth(d.getMonth() - 3); break;
            case 'ytd': d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break; // Jan 1st of current year
            case '1y': d.setFullYear(d.getFullYear() - 1); break;
            case '5y': d.setFullYear(d.getFullYear() - 5); break;
        }
        return d;
    };

    const calcReturn = (period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y'): number => {
        const startDate = subtractPeriod(latestDate, period);
        // If start date is after latest date (shouldn't happen) return 0
        if (startDate.getTime() > latestDate.getTime()) return 0;

        // If YTD, and we are on Jan 1st?
        // If history starts AFTER the target start date?
        // Then we measure from start of history.
        // But strictly speaking, 5Y return is valid only if we have 5Y history?
        // Usually we show "Since Inception" if < 5Y.
        // Here we just use available history (TWR at start date effectively 1.0 if before start).

        const startTwr = getTwrAtDate(startDate);
        return (latestTwr / startTwr) - 1;
    };

    return {
        perf1w: calcReturn('1w'),
        perf1m: calcReturn('1m'),
        perf3m: calcReturn('3m'),
        perfYtd: calcReturn('ytd'),
        perf1y: calcReturn('1y'),
        perf5y: calcReturn('5y')
    };
}