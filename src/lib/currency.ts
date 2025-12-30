// src/lib/currency.ts
const BASE_URL = `/api/exchangerate/`;

export async function getExchangeRates(baseCurrency: string) {
  try {
    const response = await fetch(`${BASE_URL}latest?base=${baseCurrency}`);
    const data = await response.json();
    if (data.success) {
      return data.rates;
    } else {
      throw new Error('Failed to fetch exchange rates');
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    // Return a mock object or handle the error as needed
    return {
      USD: 1,
      ILS: 3.7,
    };
  }
}
