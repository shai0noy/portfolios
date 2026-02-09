
import { Currency } from '../types';

/**
 * A class to hold values in multiple currencies and perform arithmetic operations.
 * This can be used as a base for Money-like structures or for aggregating values.
 */
export class MultiCurrencyValue {
  public valUSD: number;
  public valILS: number;

  constructor(
    valUSD: number = 0,
    valILS: number = 0,
  ) {
    this.valUSD = valUSD;
    this.valILS = valILS;
    // Add other core currencies if needed, or maintain a map for extensibility
    // For now, we focus on USD and ILS as primary system currencies
  }

  static from(valUSD: number, valILS: number): MultiCurrencyValue {
    return new MultiCurrencyValue(valUSD, valILS);
  }

  static zero(): MultiCurrencyValue {
    return new MultiCurrencyValue(0, 0);
  }

  add(other: MultiCurrencyValue): MultiCurrencyValue {
    return new MultiCurrencyValue(
      this.valUSD + other.valUSD,
      this.valILS + other.valILS
    );
  }

  sub(other: MultiCurrencyValue): MultiCurrencyValue {
    return new MultiCurrencyValue(
      this.valUSD - other.valUSD,
      this.valILS - other.valILS
    );
  }

  // Scale by a scalar
  scale(factor: number): MultiCurrencyValue {
    return new MultiCurrencyValue(
      this.valUSD * factor,
      this.valILS * factor
    );
  }

  get(currency: Currency | string): number {
    if (currency === Currency.USD) return this.valUSD;
    if (currency === Currency.ILS) return this.valILS;
    // Fallback or error?
    // For now, assume these are the only two "Hard" currencies we track explicitly here.
    return 0;
  }
}
