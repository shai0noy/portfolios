
import { fetchSheetExchangeRates } from './sheets/index';
export * from './currencyUtils';
import type { ExchangeRates } from './types';

const CACHE_KEY = 'exchangeRates_v2';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface RateCache {
  timestamp: number;
  data: ExchangeRates;
}

export async function getExchangeRates(sheetId: string): Promise<ExchangeRates> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: RateCache = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_DURATION) {
        console.log('Using cached exchange rates');
        return parsed.data;
      }
    }

    const rates = await fetchSheetExchangeRates(sheetId);
    
    // Save to cache
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: rates
    }));
    
    return rates as ExchangeRates;
  } catch (error) {
    console.error('Error fetching exchange rates from sheet:', error);
    // Fallback to cache if available even if expired
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        console.warn('Network failed, using expired cache');
        return JSON.parse(cached).data;
    }
    // Fallback defaults
    return { current: { USD: 1, ILS: 3.65, EUR: 0.92 } }; 
  }
}
