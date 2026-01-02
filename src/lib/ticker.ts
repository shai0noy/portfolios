// src/lib/ticker.ts

import { fetchAllTaseTickers, type TaseTicker } from './taseApi';

interface TickerData {
  price: number;
  name?: string;
  name_he?: string; // Hebrew name
  currency?: string;
  exchange?: string;
  changePct?: number; // Daily change percentage
  priceUnit?: 'base' | 'agorot' | 'cents';
  timestamp?: number; // Last update time
}

// Simple in-memory cache with a Time-To-Live (TTL)
const tickerDataCache = new Map<string, { data: TickerData, timestamp: number }>();
const historicalDataCache = new Map<string, { data: HistoricalDataPoint[], timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const YAHOO_EXCHANGE_MAP: Record<string, string> = {
  'NMS': 'NASDAQ',
  'NYQ': 'NYSE',
  'ASE': 'AMEX',
  'PCX': 'ARCA',
  'BTS': 'BATS',
  // Add other mappings as needed
};

let taseTickersDataset: TaseTicker[] | null = null;
let taseTickersDatasetLoading: Promise<TaseTicker[]> | null = null;

export async function getTaseTickersDataset(signal?: AbortSignal, forceRefresh = false): Promise<TaseTicker[]> {
  if (taseTickersDataset && !forceRefresh) {
    return taseTickersDataset;
  }
  if (taseTickersDatasetLoading) {
    return taseTickersDatasetLoading;
  }

  taseTickersDatasetLoading = (async () => {
    try {
      const tickers = await fetchAllTaseTickers(signal);
      taseTickersDataset = tickers;
      return tickers;
    } catch (e) {
      console.error('Failed to load TASE tickers dataset:', e);
      return [];
    } finally {
      taseTickersDatasetLoading = null;
    }
  })();
  return taseTickersDatasetLoading;
}

async function fetchGlobesStock(ticker: string, exchange: string, signal?: AbortSignal): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `globes:${exchange}:${ticker}`;
  
  if (tickerDataCache.has(cacheKey)) {
    const cached = tickerDataCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const globesApiUrl = `https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange=${exchange}&symbol=${ticker}`;
  const url = import.meta.env.DEV
    ? `/api/globes/data/webservices/financial.asmx/getInstrument?exchange=${exchange}&symbol=${ticker}`
    : `https://api.allorigins.win/raw?url=${encodeURIComponent(globesApiUrl)}`;
  
  
  let text;
  try {
     const response = await fetch(url, { signal });
     if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Globes fetch failed with status ${response.status}:`, errorBody);
        throw new Error(`Network response was not ok: ${response.statusText}`);
     }
     text = await response.text();
  } catch (e: unknown) {
     if (e instanceof Error && e.name === 'AbortError') {
       console.log('Globes fetch aborted');
     } else {
        console.error('Globes fetch failed', e);
     }
     return null;
  }

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check if it's a valid Instrument response
    const instrument = xmlDoc.querySelector('Instrument');
    if (!instrument) {
      console.log(`Globes: No instrument found for ${ticker}`);
      return null;
    }

    const lastNode = instrument.querySelector('last');
    const nameEnNode = instrument.querySelector('name_en');
    const nameHeNode = instrument.querySelector('name_he');
    const currencyNode = instrument.querySelector('currency');
    const currencyRateNode = instrument.querySelector('CurrencyRate');
    const changePctNode = instrument.querySelector('percentageChange');

    if (!lastNode) {
      console.log(`Globes: No last price found for ${ticker}`);
      return null;
    }

    let price = parseFloat(lastNode.textContent || '');
    if (isNaN(price)) {
      console.log(`Globes: Invalid price for ${ticker}`);
      return null;
    }
    
    let currency = currencyNode?.textContent || '';
    if (currency === 'NIS') currency = 'ILS';
    
    let priceUnit: 'base' | 'agorot' = 'base';
    const rate = parseFloat(currencyRateNode?.textContent || '1');
    if (!isNaN(rate) && rate === 0.01) {
      priceUnit = 'agorot';
    }

    const changePct = parseFloat(changePctNode?.textContent || '0') / 100; // Convert percentage value to decimal

    const tickerData: TickerData = { 
      price, 
      name: nameEnNode?.textContent || undefined,
      name_he: nameHeNode?.textContent || undefined,
      currency: currency || undefined,
      exchange: exchange.toUpperCase(),
      changePct,
      priceUnit,
      timestamp: now
    };
    
    console.log(`Globes: Fetched data for ${ticker}:`, tickerData);
    tickerDataCache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;
  } catch (error) {
    console.error(`Failed to parse ticker data for ${ticker}:`, error);
    return null;
  }
}

async function fetchYahooStock(ticker: string, signal?: AbortSignal): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `yahoo:${ticker}`;

  if (tickerDataCache.has(cacheKey)) {
    const cached = tickerDataCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  const url = import.meta.env.DEV
    ? `/api/yahoo/v8/finance/chart/${ticker}?interval=1d&range=1d`
    : `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooApiUrl)}`;

  let data;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      // Log the response body for more context on the error
      const errorBody = await res.text();
      console.error(`Yahoo fetch failed with status ${res.status}:`, errorBody);
      throw new Error(`Network response was not ok: ${res.statusText}`);
    }
    data = await res.json();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.log('Yahoo fetch aborted');
    } else {
      console.error('Yahoo fetch failed', e);
    }
    return null;
  }

  try {
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.log(`Yahoo: No result found for ${ticker}`);
      return null;
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const currency = meta.currency;
    const exchangeCode = meta.exchangeName;
    const exchangeName = YAHOO_EXCHANGE_MAP[exchangeCode] || exchangeCode;
    const longName = meta.longName || meta.shortName;

    // Calculate daily change percentage from the previous close price.
    const prevClose = meta.chartPreviousClose;
    let changePct = 0;
    if (price && prevClose) {
      changePct = (price - prevClose) / prevClose;
    }

    if (!price) {
      console.log(`Yahoo: No price found for ${ticker}`);
      return null;
    }

    const tickerData: TickerData = {
        price,
        name: longName,
        currency,
        exchange: exchangeName,
        changePct,
        priceUnit: 'base',
        timestamp: now
    };

    console.log(`Yahoo: Fetched data for ${ticker}:`, tickerData);
    tickerDataCache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;

  } catch (error) {
    console.error('Error parsing Yahoo data', error);
    return null;
  }
}

interface HistoricalDataPoint {
  date: number; // Unix timestamp
  close: number;
}

async function fetchYahooHistorical(ticker: string, range: string = '5y', interval: string = '1d', signal?: AbortSignal): Promise<HistoricalDataPoint[] | null> {
  const now = Date.now();
  const cacheKey = `yahoo-hist:${ticker}:${range}:${interval}`;

  if (historicalDataCache.has(cacheKey)) {
    const cached = historicalDataCache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
  const url = import.meta.env.DEV
    ? `/api/yahoo/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`
    : `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooApiUrl)}`;

  let data;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`Yahoo historical fetch failed with status ${res.status}:`, errorBody);
      throw new Error(`Network response was not ok: ${res.statusText}`);
    }
    data = await res.json();
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.log('Yahoo historical fetch aborted');
    } else {
      console.error('Yahoo historical fetch failed', e);
    }
    return null;
  }

  try {
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      console.error('Invalid historical data format', result);
      return null;
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const historicalData: HistoricalDataPoint[] = timestamps.map((ts: number, index: number) => ({
      date: ts * 1000, // Convert to milliseconds
      close: closes[index],
    })).filter((d: HistoricalDataPoint) => d.close !== null && d.close !== undefined);

    historicalDataCache.set(cacheKey, { data: historicalData, timestamp: now });
    return historicalData;
  } catch (error) {
    console.error('Error parsing Yahoo historical data', error);
    return null;
  }
}

export { fetchYahooHistorical }; // Export for use in TickerDetails

export async function getTickerData(ticker: string, exchange?: string, signal?: AbortSignal, forceRefresh = false): Promise<TickerData | null> {
  const exchangeL = exchange?.toLowerCase();
  const cacheKey = exchangeL === 'tase' ? `globes:${exchangeL}:${ticker}` : `yahoo:${ticker}`;

  if (!forceRefresh && tickerDataCache.has(cacheKey)) {
    const cached = tickerDataCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  // Cache clear if forceRefresh is true
  if (forceRefresh) {
    tickerDataCache.delete(cacheKey);
  }

  if (exchangeL) {
    // If exchange is specified, use the dedicated fetch function
    if (exchangeL === 'tase') {
      return fetchGlobesStock(ticker, 'tase', signal);
    }
    // Default to Yahoo for other specified exchanges
    return fetchYahooStock(ticker, signal);
  } else {
    // AUTO MODE: Try to deduce and fetch
    const isNumeric = /\d/.test(ticker);
    let data: TickerData | null = null;

    if (isNumeric) {
      // Prioritize TASE for numeric tickers
      data = await fetchGlobesStock(ticker, 'tase', signal);
      if (data) return { ...data, exchange: 'TASE' };
      // Fallback to Yahoo
      data = await fetchYahooStock(ticker, signal);
      if (data) return data;
    } else {
      // Prioritize Yahoo for non-numeric tickers
      data = await fetchYahooStock(ticker, signal);
      if (data) return data;
      // Fallback to TASE
      data = await fetchGlobesStock(ticker, 'tase', signal);
      if (data) return { ...data, exchange: 'TASE' };
    }
    console.log(`getTickerData: Ticker ${ticker} not found on any attempted exchange.`);
    return null; // Not found on any attempted exchange
  }
}