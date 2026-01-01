// src/lib/ticker.ts

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
const cache = new Map<string, { data: TickerData, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Using a CORS proxy to bypass browser restrictions when fetching data from external APIs.
const PROXY_URL = 'https://api.allorigins.win/get?url='; 

const YAHOO_EXCHANGE_MAP: Record<string, string> = {
  'NMS': 'NASDAQ',
  'NYQ': 'NYSE',
  'ASE': 'AMEX',
  'PCX': 'ARCA',
  'BTS': 'BATS',
  // Add other mappings as needed
};

async function fetchGlobesStock(ticker: string, exchange: string, signal?: AbortSignal): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `globes:${exchange}:${ticker}`;
  
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const targetUrl = `https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange=${exchange}&symbol=${ticker}`;
  
  let text;
  try {
     const response = await fetch(targetUrl, { signal });
     if (!response.ok) throw new Error('Network response was not ok');
     text = await response.text();
  } catch (e) {
     if (e.name === 'AbortError') {
       console.log('Globes fetch aborted');
       return null;
     }
     console.warn('Direct fetch failed, trying proxy...', e);
     try {
       const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`, { signal });
       if (!proxyResponse.ok) throw new Error('Proxy network response was not ok');
       const proxyData = await proxyResponse.json();
       text = proxyData.contents; 
     } catch (proxyError) {
       if (proxyError.name === 'AbortError') {
         console.log('Globes proxy fetch aborted');
         return null;
       }
       console.error('Failed to fetch ticker data (CORS/Proxy error):', proxyError);
       return null;
     }
  }

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check if it's a valid Instrument response
    const instrument = xmlDoc.querySelector('Instrument');
    if (!instrument) return null;

    const lastNode = instrument.querySelector('last');
    const nameEnNode = instrument.querySelector('name_en');
    const nameHeNode = instrument.querySelector('name_he');
    const currencyNode = instrument.querySelector('currency');
    const currencyRateNode = instrument.querySelector('CurrencyRate');
    const changePctNode = instrument.querySelector('percentageChange');

    if (!lastNode) return null;

    let price = parseFloat(lastNode.textContent || '');
    if (isNaN(price)) return null;
    
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
    
    cache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;
  } catch (error) {
    console.error(`Failed to parse ticker data for ${ticker}:`, error);
    return null;
  }
}

async function fetchYahooStock(ticker: string, signal?: AbortSignal): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `yahoo:${ticker}`;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  // Yahoo Finance Chart API endpoint for daily data.
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;

  let data;
  try {
    const res = await fetch(targetUrl, { signal });
    if (!res.ok) throw new Error('Network response was not ok');
    data = await res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('Yahoo fetch aborted');
      return null;
    }
    console.warn('Direct fetch failed, trying proxy...', e);
    try {
        const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`, { signal });
        if (!proxyResponse.ok) throw new Error('Proxy network response was not ok');
        const proxyJson = await proxyResponse.json();
        data = JSON.parse(proxyJson.contents);
    } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Yahoo proxy fetch aborted');
          return null;
        }
        console.error('Yahoo fetch failed', err);
        return null;
    }
  }

  try {
    const result = data?.chart?.result?.[0];
    if (!result) return null;

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

    if (!price) return null;

    const tickerData: TickerData = {
        price,
        name: longName,
        currency,
        exchange: exchangeName,
        changePct,
        priceUnit: 'base',
        timestamp: now
    };

    cache.set(cacheKey, { data: tickerData, timestamp: now });
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

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data as HistoricalDataPoint[];
    }
  }

  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

  let data;
  try {
    const res = await fetch(targetUrl, { signal });
    if (!res.ok) throw new Error('Network response was not ok');
    data = await res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('Yahoo historical fetch aborted');
      return null;
    }
    console.warn('Direct historical fetch failed, trying proxy...', e);
    try {
      const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`, { signal });
      if (!proxyResponse.ok) throw new Error('Proxy network response was not ok');
      const proxyJson = await proxyResponse.json();
      data = JSON.parse(proxyJson.contents);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Yahoo historical proxy fetch aborted');
        return null;
      }
      console.error('Yahoo historical fetch failed', err);
      return null;
    }
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

    cache.set(cacheKey, { data: historicalData, timestamp: now });
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

  if (!forceRefresh && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  // Cache clear if forceRefresh is true
  if (forceRefresh) {
    cache.delete(cacheKey);
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
    return null; // Not found on any attempted exchange
  }
}