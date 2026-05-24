import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFinanceEngine } from './loader';
import * as sheetsApi from '../sheets/api';
import * as fetching from '../fetching';
import * as globesFetching from '../fetching/globes';
import * as yahooFetching from '../fetching/yahoo';
import * as idbHelper from './idb-helper';
import { Exchange, Currency } from '../types';

vi.mock('../sheets/api', () => ({
    fetchTransactions: vi.fn(),
    fetchPortfolios: vi.fn(),
    fetchAllDividends: vi.fn(),
    fetchSheetExchangeRates: vi.fn(),
    fetchTickerLists: vi.fn(),
}));

vi.mock('../fetching', () => ({
    getTickerData: vi.fn(),
}));

vi.mock('../fetching/globes', () => ({
    fetchGlobesStockQuote: vi.fn(),
}));

vi.mock('../fetching/yahoo', () => ({
    fetchYahooTickerData: vi.fn(),
}));

// Mock in-memory store for IndexedDB
let mockDbStore = new Map<string, any>();

vi.mock('./idb-helper', () => ({
    CACHE_KEY: 'finance_engine_cache',
    getCacheItem: vi.fn(async (key) => mockDbStore.get(key) || null),
    setCacheItem: vi.fn(async (key, val) => { mockDbStore.set(key, val); }),
    removeCacheItem: vi.fn(async (key) => { mockDbStore.delete(key); }),
}));

describe('loadFinanceEngine refresh and caching', () => {
    const sheetId = 'test-sheet-id';

    beforeEach(() => {
        mockDbStore.clear();
        vi.clearAllMocks();

        // Setup default mock responses
        vi.mocked(sheetsApi.fetchTransactions).mockResolvedValue([
            {
                date: '2026-01-01',
                portfolioId: 'p1',
                ticker: 'AAPL',
                exchange: Exchange.NASDAQ,
                type: 'BUY',
                qty: 10,
                price: 150,
                currency: Currency.USD,
                commission: 0,
                source: 'SHEET'
            } as any
        ]);

        vi.mocked(sheetsApi.fetchPortfolios).mockResolvedValue([
            {
                id: 'p1',
                name: 'Test Portfolio',
                currency: Currency.USD,
                holdings: [
                    {
                        ticker: 'AAPL',
                        exchange: Exchange.NASDAQ,
                        qty: 10,
                        price: 150,
                        currency: Currency.USD,
                        totalValue: 1500
                    } as any
                ]
            } as any
        ]);

        vi.mocked(sheetsApi.fetchAllDividends).mockResolvedValue([]);
        
        // Make sure USD, ILS, EUR, GBP are all provided so we don't call globes / forex fetchers by default
        vi.mocked(sheetsApi.fetchSheetExchangeRates).mockResolvedValue({
            current: { USD: 1, ILS: 3.7, EUR: 0.92, GBP: 0.78 }
        } as any);
        
        vi.mocked(sheetsApi.fetchTickerLists).mockResolvedValue([]);
        vi.mocked(globesFetching.fetchGlobesStockQuote).mockResolvedValue(null);
        vi.mocked(yahooFetching.fetchYahooTickerData).mockResolvedValue(null);
    });

    it('bypasses cache and fetches fresh data when forceRefresh is true', async () => {
        // 1. First fetch - returns AAPL price of 150
        vi.mocked(fetching.getTickerData).mockResolvedValue({
            ticker: 'AAPL',
            exchange: Exchange.NASDAQ,
            price: 150,
            source: 'Yahoo'
        } as any);

        // Call loader (first time, no cache)
        const result1 = await loadFinanceEngine(sheetId, false);
        expect(result1.engine.holdings.get('p1_AAPL')?.currentPrice).toBe(150);
        expect(mockDbStore.has(idbHelper.CACHE_KEY)).toBe(true);

        // Verify sheetsApi was called once
        expect(sheetsApi.fetchTransactions).toHaveBeenCalledTimes(1);

        // Reset call count trackers
        vi.mocked(sheetsApi.fetchTransactions).mockClear();
        vi.mocked(fetching.getTickerData).mockClear();

        // 2. Now change the price to 160 in the API mock
        vi.mocked(fetching.getTickerData).mockResolvedValue({
            ticker: 'AAPL',
            exchange: Exchange.NASDAQ,
            price: 160,
            source: 'Yahoo'
        } as any);

        // Call loader with forceRefresh = false. Should hit cache and keep old price of 150
        const result2 = await loadFinanceEngine(sheetId, false);
        expect(result2.engine.holdings.get('p1_AAPL')?.currentPrice).toBe(150);
        expect(sheetsApi.fetchTransactions).not.toHaveBeenCalled();
        expect(fetching.getTickerData).not.toHaveBeenCalled();

        // 3. Call loader with forceRefresh = true. Should bypass cache and fetch fresh price of 160!
        const result3 = await loadFinanceEngine(sheetId, true);
        expect(result3.engine.holdings.get('p1_AAPL')?.currentPrice).toBe(160);
        expect(sheetsApi.fetchTransactions).toHaveBeenCalledTimes(1);
        expect(fetching.getTickerData).toHaveBeenCalledTimes(1);
    });

    it('does not fail whole load when a missing currency rate fetch throws an error', async () => {
        // First save a cache with AAPL = 150
        vi.mocked(fetching.getTickerData).mockResolvedValue({
            ticker: 'AAPL',
            exchange: Exchange.NASDAQ,
            price: 150,
            source: 'Yahoo'
        } as any);
        await loadFinanceEngine(sheetId, false);

        // Now make EUR and GBP missing from exchange rates
        vi.mocked(sheetsApi.fetchSheetExchangeRates).mockResolvedValue({
            current: { USD: 1, ILS: 3.7 } // EUR and GBP missing
        } as any);

        // Make fetchGlobesStockQuote throw a network error when fetching exchange rates
        vi.mocked(globesFetching.fetchGlobesStockQuote).mockRejectedValue(new Error('Network Timeout / Rate Limit'));

        // Call loader with forceRefresh = true and AAPL price updated to 170
        vi.mocked(fetching.getTickerData).mockResolvedValue({
            ticker: 'AAPL',
            exchange: Exchange.NASDAQ,
            price: 170,
            source: 'Yahoo'
        } as any);

        // If the catch block is missing, this load will throw/fail and silently fall back to the stale cache (AAPL = 150).
        // We want the loader to succeed and return the fresh AAPL price of 170!
        const result = await loadFinanceEngine(sheetId, true);
        expect(result.engine.holdings.get('p1_AAPL')?.currentPrice).toBe(170);
    });
});
