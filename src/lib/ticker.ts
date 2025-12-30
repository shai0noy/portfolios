// src/lib/ticker.ts

interface TickerData {
  price: number;
  name?: string;
  currency?: string;
  exchange?: string;
}

// Simple in-memory cache with a Time-To-Live (TTL)
const cache = new Map<string, { data: TickerData, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchGlobesStock(ticker: string, exchange: string): Promise<TickerData | null> {
  const now = Date.now();
  const cacheKey = `${exchange}:${ticker}`;
  
  // 1. Check cache first
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    if (now - cached.timestamp < CACHE_TTL) {
      console.log(`[CACHE HIT] Ticker: ${ticker}`);
      return cached.data;
    }
  }

  const url = `/api/globes/data/webservices/financial.asmx/getInstrument?exchange=${exchange}&symbol=${ticker}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    const lastNode = xmlDoc.querySelector('last');
    const nameNode = xmlDoc.querySelector('name_en');
    const currencyNode = xmlDoc.querySelector('currency');
    const exchangeNode = xmlDoc.querySelector('exchange');

    if (!lastNode) {
      console.warn(`No price data found for ticker: ${ticker}`);
      return null;
    }

    const price = parseFloat(lastNode.textContent || '');
    if (isNaN(price)) {
      console.error(`Invalid price for ${ticker}:`, lastNode.textContent);
      return null;
    }
    
    const tickerData: TickerData = { 
      price, 
      name: nameNode?.textContent || undefined,
      currency: currencyNode?.textContent || undefined,
      exchange: exchangeNode?.textContent || undefined,
    };
    
    // 2. Store in cache
    cache.set(cacheKey, { data: tickerData, timestamp: now });

    return tickerData;
  } catch (error) {
    console.error(`Failed to fetch ticker data for ${ticker}:`, error);
    return null;
  }
}

// Main exported function
export async function getTickerData(ticker: string, exchange?: string): Promise<TickerData | null> {
  const exchangeL = exchange?.toLowerCase();

  if (exchangeL === 'tase' || exchangeL === 'nasdaq' || exchangeL === 'nyse' || exchangeL === 'bats' || exchangeL === 'arca') {
    return fetchGlobesStock(ticker, exchangeL);
  }
  
  console.warn(`Unsupported exchange: ${exchange}.`);
  return null;
}
