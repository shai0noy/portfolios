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

  it('should safely return 0 when source is ILA and ILS rate is missing', () => {
    const incompleteRates = {
      current: {
        [Currency.USD]: 1.0,
      }
    };
    const result = convertCurrency(1000, Currency.ILA, Currency.USD, incompleteRates);
    expect(result).toBe(0);
  });

  it('should safely return 0 and not spam errors when rates is empty or undefined', () => {
    const result1 = convertCurrency(10, Currency.USD, Currency.ILS, undefined);
    expect(result1).toBe(0);

    const result2 = convertCurrency(10, Currency.USD, Currency.ILS, { current: {} });
    expect(result2).toBe(0);
  });
});
