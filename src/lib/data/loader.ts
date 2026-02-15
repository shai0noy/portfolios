import { fetchTransactions, fetchPortfolios, fetchAllDividends, fetchSheetExchangeRates } from '../sheets/api';
import { FinanceEngine } from './engine';
import type { DividendEvent } from './model';
import { Exchange, type ExchangeRates } from '../types';
import { getTickerData, type TickerData } from '../fetching';
import { fetchGlobesStockQuote } from '../fetching/globes';
import { fetchYahooTickerData } from '../fetching/yahoo';

async function fetchLivePrices(tickers: { ticker: string, exchange: Exchange }[]): Promise<Map<string, TickerData>> {
    const results = new Map<string, TickerData>();
    await Promise.all(tickers.map(async ({ ticker, exchange }) => {
        try {
            // Note: getTickerData expects exchange as string (e.g. 'TASE').
            const data = await getTickerData(ticker, exchange, null);
            if (data) {
                results.set(`${exchange}:${ticker}`, data);
            }
        } catch (e) {
            console.warn(`Failed to fetch price for ${ticker}:${exchange}`, e);
        }
    }));
    return results;
}

// TODO: Implement proper CPI fetching (from CBS or Sheet)
async function fetchCPIData(_sheetId: string): Promise<TickerData | null> {
    return null;
}

const CACHE_KEY = 'finance_engine_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface FinanceCache {
    timestamp: number;
    sheetId: string;
    transactions: any[];
    portfolios: any[];
    rawDivs: any[];
    exchangeRates: ExchangeRates;
    cpiData: TickerData | null;
    livePrices: [string, TickerData][];
}

function saveToCache(sheetId: string, data: Omit<FinanceCache, 'timestamp' | 'sheetId'>) {
    try {
        const cache: FinanceCache = {
            timestamp: Date.now(),
            sheetId,
            ...data
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Failed to save to cache', e);
    }
}

function loadFromCache(sheetId: string): FinanceCache | null {
    try {
        const json = localStorage.getItem(CACHE_KEY);
        if (!json) return null;

        const cache = JSON.parse(json) as FinanceCache;
        if (cache.sheetId !== sheetId) return null;
        if (Date.now() - cache.timestamp > CACHE_TTL) return null;

        return cache;
    } catch (e) {
        console.warn('Failed to load from cache', e);
        return null;
    }
}

export const loadFinanceEngine = async (sheetId: string, forceRefresh = false) => {
    // 0. Try Load from Cache
    if (!forceRefresh) {
        const cached = loadFromCache(sheetId);
        if (cached) {
            console.log('Loader: Using cached data');
            const { transactions, portfolios, rawDivs, exchangeRates, cpiData, livePrices } = cached;

            // Reconstruct Dividends
            const dividends: DividendEvent[] = rawDivs.map((d: any) => ({
                ticker: d.ticker,
                exchange: d.exchange,
                date: new Date(d.date),
                amount: d.amount,
                source: d.source || 'SHEET'
            }));

            // Reconstruct Engine
            const engine = new FinanceEngine(portfolios, exchangeRates as unknown as ExchangeRates, cpiData);
            engine.processEvents(transactions, dividends);

            // Hydrate Prices
            const priceMap = new Map<string, TickerData>(livePrices);
            engine.hydrateLivePrices(priceMap);

            // Generate Recurring Fees
            const holdingsWithFees = Array.from(engine.holdings.values()).filter(h => {
                const p = engine.portfolios.get(h.portfolioId);
                return p && (p.mgmtType === 'percentage' || (p.feeHistory && p.feeHistory.some(f => f.mgmtType === 'percentage')));
            });

            if (holdingsWithFees.length > 0) {
                engine.generateRecurringFees((ticker, exchange, _date) => {
                    const h = engine.holdings.get(`${holdingsWithFees.find(h => h.ticker === ticker && h.exchange === exchange)?.portfolioId}_${ticker}`);
                    return h ? h.currentPrice : 0;
                });
            }

            engine.calculateSnapshot();
            return engine;
        }
    }

    console.log('Loader: Fetching fresh data');

    // 1. Fetch Base Data
    const [transactions, portfolios] = await Promise.all([
        fetchTransactions(sheetId),
        fetchPortfolios(sheetId)
    ]);

    // Load auxiliary data
    const rawDivs = await fetchAllDividends(sheetId);
    // rawDivs items have 'source' already from fetchAllDividends
    const dividends: DividendEvent[] = rawDivs.map((d: any) => ({
        ticker: d.ticker,
        exchange: d.exchange,
        date: new Date(d.date), // Ensure Date object
        amount: d.amount,
        source: d.source || 'SHEET'
    }));

    const cpiData = await fetchCPIData(sheetId);

    // 2. Fetch Live Prices
    // Collect unique tickers
    const tickers = new Set<string>();
    transactions.forEach((t: any) => {
        const ex = t.exchange || Exchange.TASE;
        tickers.add(`${ex}:${t.ticker}`);
    });

    console.log(`Loader: Fetching prices for ${tickers.size} tickers:`, Array.from(tickers));
    const livePricesMap = await fetchLivePrices(Array.from(tickers).map(t => {
        const [exchange, ticker] = t.split(':');
        return { ticker, exchange: exchange as Exchange };
    }));
    console.log(`Loader: Fetched ${livePricesMap.size} prices.`);

    // 3. Initialize Engine
    const exchangeRates = await fetchSheetExchangeRates(sheetId);

    // 3.5 Fetch Historical Rates for Missing Data (In-Memory Patch)
    const txnsNeedingRates = transactions.filter((t: any) => {
        // We want Nominal ILS Cost for all foreign assets (primarily USD)
        const isUSD = t.currency === 'USD'; // Normalize? assuming 'USD' from sheet or normalized in fetch
        const missingILA = !t.originalPriceILA;
        return isUSD && missingILA && t.originalPrice && t.date;
    });

    if (txnsNeedingRates.length > 0) {
        console.log(`Loader: Fetching historical USDILS rates for ${txnsNeedingRates.length} transactions to fix missing originalPriceILA`);
        try {
            const usdIls = await fetchYahooTickerData('USDILS=X', Exchange.FOREX, undefined, false, 'max');
            if (usdIls && usdIls.historical) {
                const rateMap = new Map<string, number>();
                usdIls.historical.forEach(h => {
                    const dateStr = h.date.toISOString().split('T')[0];
                    rateMap.set(dateStr, h.price);
                });

                let patchedCount = 0;
                txnsNeedingRates.forEach((t: any) => {
                    let d = new Date(t.date);
                    let dateStr = d.toISOString().split('T')[0];

                    // Try exact match, then +/- 1-3 days if missing (weekends)
                    let rate = rateMap.get(dateStr);
                    if (!rate) {
                        // Simple fallback for weekends: look back up to 3 days
                        for (let i = 1; i <= 3; i++) {
                            d.setDate(d.getDate() - 1);
                            dateStr = d.toISOString().split('T')[0];
                            rate = rateMap.get(dateStr);
                            if (rate) break;
                        }
                    }

                    if (rate) {
                        // ILA = ILS * 100
                        t.originalPriceILA = t.originalPrice * rate * 100;
                        patchedCount++;
                    }
                });
                console.log(`Loader: Successfully patched ${patchedCount} transactions with historical rates.`);
            }
        } catch (e) {
            console.warn('Loader: Failed to fetch historical rates for patching', e);
        }
    }

    // Fill missing critical rates (Fallback)
    const currentRates = exchangeRates.current;
    const missing = ['ILS', 'EUR', 'GBP'].filter(c => !currentRates[c]);

    if (missing.length > 0) {
        console.warn(`Loader: Filling missing rates for ${missing.join(', ')} via external APIs.`);

        const getRate = async (pair: string) => {
            let data = await fetchGlobesStockQuote(pair, undefined, Exchange.FOREX);
            if (!data?.price) {
                data = await fetchYahooTickerData(`${pair}=X`, Exchange.FOREX, undefined, false, undefined);
            }
            return data?.price;
        };

        if (!currentRates['ILS']) currentRates['ILS'] = await getRate('USDILS') || 0;

        await Promise.all(missing.filter(c => c !== 'ILS').map(async c => {
            let r = await getRate(`USD${c}`);
            if (r) { currentRates[c] = r; return; }

            r = await getRate(`${c}USD`);
            if (r) { currentRates[c] = 1 / r; return; }

            if (currentRates['ILS']) {
                r = await getRate(`${c}ILS`);
                if (r) currentRates[c] = currentRates['ILS'] / r;
            }
        }));
    }

    // Save to Cache
    saveToCache(sheetId, {
        transactions,
        portfolios,
        rawDivs,
        exchangeRates: exchangeRates as unknown as ExchangeRates,
        cpiData,
        livePrices: Array.from(livePricesMap.entries())
    });

    // Create Engine
    const engine = new FinanceEngine(portfolios, exchangeRates as unknown as ExchangeRates, cpiData);

    // 5. Process Events (Txns + Divs)
    engine.processEvents(transactions, dividends);

    // 4. Hydrate Prices (Must be AFTER processEvents so holdings exist)
    engine.hydrateLivePrices(livePricesMap);

    // 6. Generate Recurring Fees (Requires Historical Prices)
    const holdingsWithFees = Array.from(engine.holdings.values()).filter(h => {
        const p = engine.portfolios.get(h.portfolioId);
        return p && (p.mgmtType === 'percentage' || (p.feeHistory && p.feeHistory.some(f => f.mgmtType === 'percentage')));
    });

    if (holdingsWithFees.length > 0) {
        // Placeholder: Use current price for all dates (Warning: Inaccurate)
        engine.generateRecurringFees((ticker, exchange, _date) => {
            const h = engine.holdings.get(`${holdingsWithFees.find(h => h.ticker === ticker && h.exchange === exchange)?.portfolioId}_${ticker}`);
            return h ? h.currentPrice : 0;
        });
    }

    // 7. Calculate Final Snapshot
    engine.calculateSnapshot();

    return engine;
};
