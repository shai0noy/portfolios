import { describe, it, expect } from 'vitest';
import { convertCurrency } from './currencyUtils';
import { Currency, EXCHANGE_SETTINGS, Exchange } from './types';

describe('convertCurrency', () => {
  const mockRates = {
    current: {
      [Currency.ILS]: 3.7,
      [Currency.USD]: 1.0,
      [Currency.EUR]: 0.9,
    }
  };

  it('should handle ILS to ILA conversion without rates', () => {
    const amount = 10; // 10 ILS
    const result = convertCurrency(amount, Currency.ILS, Currency.ILA);
    expect(result).toBe(1000); // 1000 Agorot
  });

  it('should handle ILA to ILS conversion without rates', () => {
    const amount = 1000; // 1000 Agorot
    const result = convertCurrency(amount, Currency.ILA, Currency.ILS);
    expect(result).toBe(10); // 10 ILS
  });

  it('should handle cross currency with rates', () => {
    const amount = 100; // 100 USD
    const result = convertCurrency(amount, Currency.USD, Currency.ILS, mockRates);
    expect(result).toBe(370); // 370 ILS
  });

  it('should handle yield calculation logic (mimicking code)', () => {
    const eps = 10; // 10 ILS
    const price = 1000; // 1000 Agorot (ILA)
    const exchange = Exchange.TASE;
    
    const targetCurrency = EXCHANGE_SETTINGS[exchange]?.defaultCurrency || Currency.USD;
    const convertedEps = convertCurrency(eps, Currency.ILS, targetCurrency, mockRates);
    const yieldVal = convertedEps / price;
    expect(yieldVal).toBe(1.0);
  });
});
