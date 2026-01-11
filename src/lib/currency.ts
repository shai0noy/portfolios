import { fetchSheetExchangeRates } from './sheets/index';
import { logIfFalsy } from './utils';

const CACHE_KEY = 'exchangeRates';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour


export async function getExchangeRates(sheetId: string) {
  try {
    return await fetchSheetExchangeRates(sheetId);
  } catch (error) {
    console.error('Error fetching exchange rates from sheet:', error);
    // Fallback defaults
    return { USD: 1, ILS: 3.65, EUR: 0.92 }; 
  }
}

export function convertCurrency(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  logIfFalsy(rates, "convertCurrency: rates object missing");
  if (!rates) return amount;

  // Assuming rates are relative to a common base (USD).
  // rate 'ILS' = 3.7 means 1 USD = 3.7 ILS.
  
  // Convert 'from' to USD (Base)
  const fromRate = logIfFalsy(rates[from], `Exchange rate missing for ${from}`, { from, to, rates }) || 1; 
  const valInBase = from === 'USD' ? amount : amount / fromRate;

  // Convert USD to 'to'
  const toRate = logIfFalsy(rates[to], `Exchange rate missing for ${to}`, { from, to, rates }) || 1;
  return valInBase * toRate;
}

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const options: Intl.NumberFormatOptions = Number.isInteger(n)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString(undefined, options);
}

export function formatCurrency(n: number, currency: string, decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (currency === 'USD') return `$${val}`;
  if (currency === 'ILS') return `₪${val}`;
  if (currency === 'EUR') return `€${val}`;
  return `${val} ${currency}`;
}
