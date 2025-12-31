// src/lib/ticker.ts

interface TickerData {
  price: number;
  name?: string;
  name_he?: string; // Hebrew name
  currency?: string;
  exchange?: string;
  changePct?: number; // Daily change percentage
}

// Simple in-memory cache with a Time-To-Live (TTL)
const cache = new Map<string, { data: TickerData, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROXY_URL = 'https://api.allorigins.win/get?url='; 

async function fetchGlobesStock(ticker: string, exchange: string): Promise<TickerData | null> {
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
     const response = await fetch(targetUrl);
     if (!response.ok) throw new Error('Network response was not ok');
     text = await response.text();
  } catch (e) {
     try {
       const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
       const proxyData = await proxyResponse.json();
       text = proxyData.contents; 
     } catch (proxyError) {
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
    
    // Check CurrencyRate (e.g. 0.01 for Agorot -> ILS)
    const rate = parseFloat(currencyRateNode?.textContent || '1');
    if (!isNaN(rate) && rate !== 1) {
      price = price * rate;
    }

    const changePct = parseFloat(changePctNode?.textContent || '0') / 100; // Convert 0.29 to 0.0029

    const tickerData: TickerData = { 
      price, 
      name: nameEnNode?.textContent || undefined,
      name_he: nameHeNode?.textContent || undefined,
      currency: currency || undefined,
      exchange: exchange.toUpperCase(),
      changePct
    };
    
    cache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;
  } catch (error) {
    console.error(`Failed to parse ticker data for ${ticker}:`, error);
    return null;
  }
}

async function fetchYahooStock(ticker: string): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `yahoo:${ticker}`;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;

  let data;
  try {
    const res = await fetch(targetUrl);
    data = await res.json();
  } catch (e) {
    try {
        const proxyResponse = await fetch(`${PROXY_URL}${encodeURIComponent(targetUrl)}`);
        const proxyJson = await proxyResponse.json();
        data = JSON.parse(proxyJson.contents);
    } catch (err) {
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
    const exchangeName = meta.exchangeName;
    const longName = meta.longName || meta.shortName;

    // Yahoo typically returns change as value, not pct in this meta. 
    // chart.result[0].indicators.quote[0].close has history.
    // Calculate change from prev close?
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
        changePct
    };

    cache.set(cacheKey, { data: tickerData, timestamp: now });
    return tickerData;

  } catch (error) {
    console.error('Error parsing Yahoo data', error);
    return null;
  }
}

export async function getTickerData(ticker: string, exchange?: string): Promise<TickerData | null> {
  const exchangeL = exchange?.toLowerCase();

  if (exchangeL === 'tase') {
    return fetchGlobesStock(ticker, 'tase');
  }
  
  if (exchangeL === 'nasdaq' || exchangeL === 'nyse' || exchangeL === 'bats' || exchangeL === 'arca') {
      return fetchYahooStock(ticker);
  }
  
  return fetchYahooStock(ticker);
}