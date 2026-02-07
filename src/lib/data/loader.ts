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

export const loadFinanceEngine = async (sheetId: string) => {
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
    const livePrices = await fetchLivePrices(Array.from(tickers).map(t => {
        const [exchange, ticker] = t.split(':');
        return { ticker, exchange: exchange as Exchange };
    }));
    console.log(`Loader: Fetched ${livePrices.size} prices.`);

    // 3. Initialize Engine
    const exchangeRates = await fetchSheetExchangeRates(sheetId);

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

    // Create Engine
    const engine = new FinanceEngine(portfolios, exchangeRates as unknown as ExchangeRates, cpiData);

    // 5. Process Events (Txns + Divs)
    engine.processEvents(transactions, dividends);

    // 4. Hydrate Prices (Must be AFTER processEvents so holdings exist)
    engine.hydrateLivePrices(livePrices);

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
