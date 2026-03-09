import { interpolateSparseHistory } from './fetching/utils/interpolate';
// src/lib/performance.ts
import { fetchTickerHistory } from './fetching';
import { convertCurrency } from './currency';
import { Currency, Exchange, type DashboardHolding, type Transaction, type ExchangeRates, isBuy, isSell } from './types';

export interface PerformancePoint {
    date: Date;
    holdingsValue: number;
    gainsValue: number;
    costBasis: number;
    twr: number;
}



export function synthesizeHistory(holding: DashboardHolding | undefined, tickerData: any, txns: Transaction[]): { date: Date, adjClose: number, price: number }[] {
    const points: { date: Date, adjClose: number, price: number }[] = [];

    // Add transaction prices mapping to date
    txns.forEach(t => {
        const d = new Date(t.date);
        d.setUTCHours(0, 0, 0, 0);
        points.push({ date: d, adjClose: t.price || 0, price: t.price || 0 });
    });

    const cp = tickerData?.price || holding?.currentPrice;

    if (cp > 0) {
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        points.push({ date: now, adjClose: cp, price: cp });

        const addPast = (pct: number | undefined, targetDate: Date) => {
            if (pct !== undefined && pct !== null) {
                const priceTarget = cp / (1 + pct);
                points.push({ date: targetDate, adjClose: priceTarget, price: priceTarget });
            }
        };

        const d1w = new Date(now); d1w.setUTCDate(d1w.getUTCDate() - 7);
        const d1m = new Date(now); d1m.setUTCMonth(d1m.getUTCMonth() - 1);
        const d3m = new Date(now); d3m.setUTCMonth(d3m.getUTCMonth() - 3);
        const dytd = new Date(now); dytd.setUTCMonth(0, 1); dytd.setUTCHours(0, 0, 0, 0);
        const d1y = new Date(now); d1y.setUTCFullYear(d1y.getUTCFullYear() - 1);
        const d3y = new Date(now); d3y.setUTCFullYear(d3y.getUTCFullYear() - 3);
        const d5y = new Date(now); d5y.setUTCFullYear(d5y.getUTCFullYear() - 5);

        addPast(tickerData?.changePctRecent || holding?.tickerChangePct1w, d1w);
        addPast(tickerData?.changePct1m || holding?.tickerChangePct1m, d1m);
        addPast(tickerData?.changePct3m || holding?.tickerChangePct3m, d3m);
        addPast(tickerData?.changePctYtd || holding?.tickerChangePctYtd, dytd);
        addPast(tickerData?.changePct1y || holding?.tickerChangePct1y, d1y);
        addPast(tickerData?.changePct3y || holding?.tickerChangePct3y, d3y);
        addPast(tickerData?.changePct5y || holding?.tickerChangePct5y, d5y);
    }

    if (points.length === 0) return [];

    points.sort((a, b) => a.date.getTime() - b.date.getTime());

    const deduped: { date: Date, adjClose: number, price: number }[] = [];
    points.forEach(p => {
        if (deduped.length === 0) {
            deduped.push(p);
        } else {
            const last = deduped[deduped.length - 1];
            if (last.date.getTime() === p.date.getTime()) {
                last.adjClose = p.adjClose;
                last.price = p.price;
            } else {
                deduped.push(p);
            }
        }
    });

    return interpolateSparseHistory(deduped) as { date: Date, adjClose: number, price: number }[];
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
        .filter(t => t.date && !isNaN(new Date(t.date).getTime())) // Skip invalid dates
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
    histories.forEach(h => {
        let historical = h.data?.historical;
        if (!historical || historical.length === 0) {
            const [ex, tic] = h.key.split(':');
            const holding = holdings.find(hd => hd.ticker === tic && hd.exchange === ex);
            // Use the original transactions array with the ORIGINAL date, not the vestDate proxy.
            const myTxns = transactions.filter(t =>
                t.ticker === tic &&
                t.exchange === ex &&
                t.type !== 'DIVIDEND' &&
                t.type !== 'FEE' &&
                (t.price || 0) > 0 &&
                t.date && !isNaN(new Date(t.date).getTime())
            );
            const synth = synthesizeHistory(holding, h.data, myTxns);
            if (synth.length > 0) {
                if (!h.data) h.data = {} as any;
                h.data!.historical = synth;
            }
        }
        historyMap.set(h.key, h.data);
    });


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

    // If activeTimestamps is empty (e.g., only bought today and no history yet),
    // or if the latest timestamp doesn't cover today, ensure today is in the timeline
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    if (activeTimestamps.length === 0 || activeTimestamps[activeTimestamps.length - 1] < todayTs) {
        if (todayTs >= firstTxnDate) {
            activeTimestamps.push(todayTs);
        }
    }

    if (activeTimestamps.length === 0) {
        // Fallback: at least show the purchase date
        activeTimestamps.push(firstTxnDate);
    }

    // 4. Time-series aggregation
    const points: PerformancePoint[] = [];
    const currentHoldings = new Map<string, { qty: number, costBasis: number, stockCurrency: Currency, lots: { date: number, qty: number, cost: number }[] }>();
    let otherGains = 0; // Cumulative dividends, fees, realized gains (in displayCurrency)
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

            // costBasis is now tracked in displayCurrency
            const state = currentHoldings.get(stateKey) || { qty: 0, costBasis: 0, stockCurrency: resolvedStockCurrency, lots: [] };

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

            // Calculate Value: fallback to price if div/fee with 0 qty
            let tValue = 0;
            if ((t.type === 'DIVIDEND' || t.type === 'FEE') && Math.abs(tQty) < 1e-9) {
                tValue = tPrice;
            } else {
                tValue = tQty * tPrice;
            }

            // Helper to get transaction value in Display Currency using Historical Data if available
            const getTxnValueInDisplay = () => {
                if (displayCurrency === Currency.ILS && (t.originalPriceILA || t.currency === Currency.ILS)) {
                    // Prefer originalPriceILA (Agorot) -> ILS
                    if (t.originalPriceILA) {
                        const priceILS = t.originalPriceILA / 100;
                        // If it's a BUY/SELL, value = qty * price
                        // If it's DIV/FEE with 0 qty, value... wait, originalPrice is per share.
                        // For DIV/FEE, originalPrice might be undefined or 0.
                        // If tQty > 0, we can use quantity * price.
                        if (Math.abs(tQty) > 1e-9) {
                            return tQty * priceILS;
                        }
                    }
                    // Fallback for ILS native transactions (assuming tValue is in ILS)
                    if (t.currency === Currency.ILS) return tValue;
                } else if (displayCurrency === Currency.USD && (t.originalPriceUSD || t.currency === Currency.USD)) {
                    if (t.originalPriceUSD) {
                        if (Math.abs(tQty) > 1e-9) {
                            return tQty * t.originalPriceUSD;
                        }
                    }
                    if (t.currency === Currency.USD) return tValue;
                }

                // Fallback: Use Current Exchange Rate
                return convertCurrency(tValue, t.currency || Currency.USD, displayCurrency, exchangeRates);
            };

            const valInDisplay = getTxnValueInDisplay();

            if (isBuy(t.type)) {
                state.qty += tQty;
                state.costBasis += valInDisplay;
                if (!state.lots) state.lots = [];
                state.lots.push({ date: tDate.getTime(), qty: tQty, cost: valInDisplay });
                dayNetFlow += valInDisplay;
            } else if (isSell(t.type)) {
                // FIFO Logic: Consume from lots
                let remainingToSell = tQty;
                let costOfSoldPC = 0;

                // Ensure we have a valid queue
                if (!state.lots) state.lots = [];

                // Sort by date? Usually they are added in order provided they are processed chronologically.
                // Assuming sortedTxns are creating lots in order.

                while (remainingToSell > 1e-9 && state.lots.length > 0) {
                    const lot = state.lots[0]; // Peek oldest
                    const sellQty = Math.min(lot.qty, remainingToSell);

                    const lotCost = (lot.cost / lot.qty) * sellQty;
                    costOfSoldPC += lotCost;

                    lot.qty -= sellQty;
                    lot.cost -= lotCost;
                    remainingToSell -= sellQty;

                    if (lot.qty < 1e-9) {
                        state.lots.shift(); // Remove empty lot
                    }
                }

                // If we oversold (negative qty), we might have negative cost basis or just 0?
                // For now, assume long-only or allow negative qty with 0 cost?
                // Standard behavior: if shorting, cost basis might be different.
                // Let's just accumulate whatever we found.

                state.qty -= tQty;
                state.costBasis -= costOfSoldPC;

                const proceedsDisplay = valInDisplay;
                const costOfSoldDisplay = costOfSoldPC;

                otherGains += (proceedsDisplay - costOfSoldDisplay);
                dayNetFlow -= proceedsDisplay; // Outflow (Proceeds leaving the tracking, effectively) - Wait.
                // Net Flow Calculation for TWR:
                // If I Sell, I get Cash.
                // If the Portfolio tracks Cash, then Flow is 0 (Asset -> Cash).
                // But this function tracks "Holdings Performance" (excluding cash?).
                // Usually `calculatePortfolioPerformance` tracks the *invested* assets.
                // If I sell, money leaves the "Invested" bucket.
                // So it is a Negative Flow (Withdrawal) from the Investment perspective?
                // Yes: `dayNetFlow -= proceedsDisplay`.
            } else if (t.type === 'DIVIDEND') {
                // DRIP Logic:
                // If tQty > 0, we treat it as:
                // 1. Income: Dividend value added to `otherGains` (Total Return).
                // 2. Acquisition: Reinvested quantity added to `state.qty` and `state.costBasis`.
                // This ensures TWR captures the income, and future price moves capture compounding.

                const policy = portfolioPolicies?.get(t.portfolioId)?.divPolicy;
                const isAccumulating = (policy === 'accumulate_tax_free' || policy === 'hybrid_rsu');

                const divVal = valInDisplay;
                if (!isAccumulating) {
                    otherGains += divVal;
                    dayDividends += divVal;
                }

                if (tQty > 0) {
                    state.qty += tQty;
                    // For accumulating policies, we don't treat this as new cost basis or external flow
                    if (!isAccumulating) {
                        state.costBasis += divVal;
                        dayNetFlow += divVal;
                    }
                    if (!state.lots) state.lots = [];
                    // Keep a 0-cost or original cost lot? Usually the lot takes the divVal for tax tracking, 
                    // but since tax basis is 0 for accumulating policies we could use 0, but divVal is 
                    // fine as it's tracked separately from total cost basis here.
                    state.lots.push({ date: tDate.getTime(), qty: tQty, cost: isAccumulating ? 0 : divVal });
                }
            } else if (t.type === 'FEE') {
                const feeVal = valInDisplay;
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
            if (!history?.historical) {
                // If no history, assume value is the cost basis so we don't realize an artificial 100% loss
                totalHoldingsValue += state.costBasis;
                totalCostBasis += state.costBasis;
                return;
            }

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
                    // state.costBasis is ALREADY in displayCurrency (Accumulated Historical)
                    const costDisplay = state.costBasis;

                    totalHoldingsValue += valDisplay;
                    totalCostBasis += costDisplay;
                } else {
                    totalHoldingsValue += state.costBasis;
                    totalCostBasis += state.costBasis;
                }
            } else {
                totalHoldingsValue += state.costBasis;
                totalCostBasis += state.costBasis;
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
            // Virtual start point if checking before inception, BUT for chart alignment
            // we usually want the first actual point if we are looking for "1M" return
            // and inception was 2 weeks ago.
            // However, calculatePeriodReturns (ALL) special case handles inception.
            // For fixed periods (1M) where inception > 1M ago, we want strict match.
            // If inception < 1M ago, returns are usually calculated from Inception.
            return points[0];
        }

        // Find FIRST point >= targetTime (Matching Chart Logic)
        for (let i = 0; i < points.length; i++) {
            if (new Date(points[i].date).getTime() >= targetTime) {
                return points[i];
            }
        }
        return points[points.length - 1];
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
            case 'all': return new Date(points[0].date);
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