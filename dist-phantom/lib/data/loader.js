"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFinanceEngine = void 0;
const api_1 = require("../sheets/api");
const engine_1 = require("./engine");
const types_1 = require("../types");
const fetching_1 = require("../fetching");
const globes_1 = require("../fetching/globes");
const yahoo_1 = require("../fetching/yahoo");
async function fetchLivePrices(tickers) {
    const results = new Map();
    await Promise.all(tickers.map(async ({ ticker, exchange }) => {
        try {
            // Note: getTickerData expects exchange as string (e.g. 'TASE').
            const data = await (0, fetching_1.getTickerData)(ticker, exchange, null);
            if (data) {
                results.set(`${exchange}:${ticker}`, data);
            }
        }
        catch (e) {
            console.warn(`Failed to fetch price for ${ticker}:${exchange}`, e);
        }
    }));
    return results;
}
// TODO: Implement proper CPI fetching (from CBS or Sheet)
async function fetchCPIData(_sheetId) {
    return null;
}
const CACHE_KEY = 'finance_engine_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
function saveToCache(sheetId, data) {
    try {
        const cache = {
            timestamp: Date.now(),
            sheetId,
            ...data
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
    catch (e) {
        console.warn('Failed to save to cache', e);
    }
}
function loadFromCache(sheetId) {
    try {
        const json = localStorage.getItem(CACHE_KEY);
        if (!json)
            return null;
        const cache = JSON.parse(json);
        if (cache.sheetId !== sheetId)
            return null;
        if (Date.now() - cache.timestamp > CACHE_TTL)
            return null;
        return cache;
    }
    catch (e) {
        console.warn('Failed to load from cache', e);
        return null;
    }
}
const loadFinanceEngine = async (sheetId, forceRefresh = false) => {
    // 0. Try Load from Cache
    if (!forceRefresh) {
        const cached = loadFromCache(sheetId);
        if (cached) {
            console.log('Loader: Using cached data');
            const { transactions, portfolios, rawDivs, exchangeRates, cpiData, livePrices } = cached;
            // Reconstruct Dividends
            const dividends = rawDivs.map((d) => ({
                ticker: d.ticker,
                exchange: d.exchange,
                date: new Date(d.date),
                amount: d.amount,
                source: d.source || 'SHEET'
            }));
            // Reconstruct Engine
            const engine = new engine_1.FinanceEngine(portfolios, exchangeRates, cpiData);
            engine.processEvents(transactions, dividends);
            // Hydrate Prices
            const priceMap = new Map(livePrices);
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
        (0, api_1.fetchTransactions)(sheetId),
        (0, api_1.fetchPortfolios)(sheetId)
    ]);
    // Load auxiliary data
    const rawDivs = await (0, api_1.fetchAllDividends)(sheetId);
    // rawDivs items have 'source' already from fetchAllDividends
    const dividends = rawDivs.map((d) => ({
        ticker: d.ticker,
        exchange: d.exchange,
        date: new Date(d.date), // Ensure Date object
        amount: d.amount,
        source: d.source || 'SHEET'
    }));
    const cpiData = await fetchCPIData(sheetId);
    // 2. Fetch Live Prices
    // Collect unique tickers
    const tickers = new Set();
    transactions.forEach((t) => {
        const ex = t.exchange || types_1.Exchange.TASE;
        tickers.add(`${ex}:${t.ticker}`);
    });
    console.log(`Loader: Fetching prices for ${tickers.size} tickers:`, Array.from(tickers));
    const livePricesMap = await fetchLivePrices(Array.from(tickers).map(t => {
        const [exchange, ticker] = t.split(':');
        return { ticker, exchange: exchange };
    }));
    console.log(`Loader: Fetched ${livePricesMap.size} prices.`);
    // 3. Initialize Engine
    const exchangeRates = await (0, api_1.fetchSheetExchangeRates)(sheetId);
    // Fill missing critical rates (Fallback)
    const currentRates = exchangeRates.current;
    const missing = ['ILS', 'EUR', 'GBP'].filter(c => !currentRates[c]);
    if (missing.length > 0) {
        console.warn(`Loader: Filling missing rates for ${missing.join(', ')} via external APIs.`);
        const getRate = async (pair) => {
            let data = await (0, globes_1.fetchGlobesStockQuote)(pair, undefined, types_1.Exchange.FOREX);
            if (!data?.price) {
                data = await (0, yahoo_1.fetchYahooTickerData)(`${pair}=X`, types_1.Exchange.FOREX, undefined, false, undefined);
            }
            return data?.price;
        };
        if (!currentRates['ILS'])
            currentRates['ILS'] = await getRate('USDILS') || 0;
        await Promise.all(missing.filter(c => c !== 'ILS').map(async (c) => {
            let r = await getRate(`USD${c}`);
            if (r) {
                currentRates[c] = r;
                return;
            }
            r = await getRate(`${c}USD`);
            if (r) {
                currentRates[c] = 1 / r;
                return;
            }
            if (currentRates['ILS']) {
                r = await getRate(`${c}ILS`);
                if (r)
                    currentRates[c] = currentRates['ILS'] / r;
            }
        }));
    }
    // Save to Cache
    saveToCache(sheetId, {
        transactions,
        portfolios,
        rawDivs,
        exchangeRates: exchangeRates,
        cpiData,
        livePrices: Array.from(livePricesMap.entries())
    });
    // Create Engine
    const engine = new engine_1.FinanceEngine(portfolios, exchangeRates, cpiData);
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
exports.loadFinanceEngine = loadFinanceEngine;
