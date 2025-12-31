import { fetchSheetExchangeRates } from './sheets';

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
  if (!rates) return amount;

  // Assuming rates are relative to a common base (USD).
  // rate 'ILS' = 3.7 means 1 USD = 3.7 ILS.
  
  // Convert 'from' to USD (Base)
  const fromRate = rates[from] || 1; 
  const valInBase = from === 'USD' ? amount : amount / fromRate;

  // Convert USD to 'to'
  const toRate = rates[to] || 1;
  return valInBase * toRate;
}
