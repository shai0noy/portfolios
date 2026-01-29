// src/lib/performance.ts
import { fetchTickerHistory } from './fetching';
import { convertCurrency } from './currency';
import { Currency, Exchange, type DashboardHolding, type Transaction, type ExchangeRates } from './types';

export interface PerformancePoint {
    date: Date;
    holdingsValue: number;
    gainsValue: number;
    costBasis: number;
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

    // Pre-calculate indices for historical prices and map current holdings metadata
    const historyPointers = new Map<string, number>();
    histories.forEach(h => historyPointers.set(h.key, 0));
    
    const holdingsMap = new Map<string, DashboardHolding>();
    holdings.forEach(h => holdingsMap.set(`${h.exchange}:${h.ticker}`, h));

    for (const ts of activeTimestamps) {
        const currentDate = new Date(ts);

        // Apply all transactions that happened ON or BEFORE this date
        while (txnIdx < sortedTxns.length && new Date(sortedTxns[txnIdx].date).getTime() <= ts) {
            const t = sortedTxns[txnIdx];
            const tickerKey = `${t.exchange}:${t.ticker}`;
            const stateKey = `${t.portfolioId}:${tickerKey}`; 
            const state = currentHoldings.get(stateKey) || { qty: 0, costBasis: 0, stockCurrency: t.currency || Currency.USD };
            
            const tQty = t.qty || 0;
            const tPrice = t.price || 0;
            const tValue = tQty * tPrice; // Value in transaction currency
            
            // Normalize cost basis to the stock's canonical currency
            const stockCurrency = state.stockCurrency;
            const costToAdd = convertCurrency(tValue, t.currency || Currency.USD, stockCurrency, exchangeRates);

            if (t.type === 'BUY') {
                state.qty += tQty;
                state.costBasis += costToAdd;
            } else if (t.type === 'SELL') {
                const avgCost = state.qty > 0 ? state.costBasis / state.qty : 0;
                state.qty -= tQty;
                state.costBasis -= tQty * avgCost;
                
                const proceedsDisplay = convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
                const costOfSoldDisplay = convertCurrency(tQty * avgCost, stockCurrency, displayCurrency, exchangeRates);
                
                otherGains += (proceedsDisplay - costOfSoldDisplay);
            } else if (t.type === 'DIVIDEND') {
                otherGains += convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
            } else if (t.type === 'FEE') {
                otherGains -= convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
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
                    const valDisplay = convertCurrency(state.qty * price, state.stockCurrency, displayCurrency, exchangeRates);
                    const costDisplay = convertCurrency(state.costBasis, state.stockCurrency, displayCurrency, exchangeRates);
                    
                    totalHoldingsValue += valDisplay;
                    totalCostBasis += costDisplay;
                }
            }
        });

        points.push({
            date: currentDate,
            holdingsValue: totalHoldingsValue,
            costBasis: totalCostBasis,
            gainsValue: (totalHoldingsValue - totalCostBasis) + otherGains
        });
    }

    return points;
}