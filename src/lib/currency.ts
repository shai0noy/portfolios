// src/lib/currency.ts
const BASE_URL = `/api/exchangerate/`;

export async function getExchangeRates(baseCurrency: string) {
  try {
    const response = await fetch(`${BASE_URL}${baseCurrency}`);
    const data = await response.json();
    if (data.result === 'success') {
      return data.conversion_rates;
    } else {
      throw new Error('Failed to fetch exchange rates');
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    throw new Error('Failed to fetch exchange rates');
  }
}
