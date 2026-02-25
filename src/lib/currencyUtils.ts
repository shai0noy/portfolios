
import { Currency } from './types';
import type { ExchangeRates } from './types';

// Unicode Left-to-Right Mark (LRM).
const LTR_MARK = '\u200E';

export function normalizeCurrency(input: string): Currency {
  if (!input) return Currency.USD;
  const upper = input.trim().toUpperCase();

  // Hebrew & Symbols
  if (upper === 'ש"ח' || upper === 'NIS' || upper === 'ILS') return Currency.ILS;
  if (upper === 'אג' || upper === 'ILA' || upper === 'ILAG' || upper === 'AGOROT' || upper === 'AG') return Currency.ILA;
  if (upper === 'דולר' || upper === '$' || upper === 'DOLLAR' || upper === 'USD') return Currency.USD;
  if (upper === 'אירו' || upper === 'EUR' || upper === 'EURO') return Currency.EUR;
  if (upper === 'ליש"ט' || upper === 'LIRA' || upper === 'GBP') return Currency.GBP;

  if (upper === 'USD') return Currency.USD;

  console.warn(`normalizeCurrency: Unknown currency '${input}', defaulting to USD`);
  throw new Error(`Unknown currency: ${input}`);
}

// Convert to ILA (Agorot)
export function toILA(amount: number, srcCurrency: string | Currency, rates?: ExchangeRates): number {
  return convertCurrency(amount, srcCurrency, Currency.ILA, rates);
}

// Convert to ILS (Major Unit)
export function toILS(amount: number, srcCurrency: string | Currency, rates?: ExchangeRates): number {
  return convertCurrency(amount, srcCurrency, Currency.ILS, rates);
}

// Convert to USD
export function toUSD(amount: number, srcCurrency: string | Currency, rates?: ExchangeRates): number {
  return convertCurrency(amount, srcCurrency, Currency.USD, rates);
}

export function convertCurrency(amount: number, from: Currency | string, to: Currency | string, rates?: ExchangeRates | Record<string, number>): number {
  if (typeof amount !== 'number' || isNaN(amount)) {
    console.error(`convertCurrency: Invalid amount: ${amount}`);
    return 0;
  }

  const fromNorm = normalizeCurrency(from as string);
  const toNorm = normalizeCurrency(to as string);

  if (fromNorm === toNorm) return amount;

  // Handle direct ILS <-> ILA conversion, which doesn't need rates
  if (fromNorm === Currency.ILA && toNorm === Currency.ILS) return amount / 100;
  if (fromNorm === Currency.ILS && toNorm === Currency.ILA) return amount * 100;

  let currentRates: Record<string, number> | undefined;
  if (rates && 'current' in rates) {
    currentRates = (rates as ExchangeRates).current;
  } else if (rates) {
    currentRates = rates as Record<string, number>;
  }

  if (!currentRates || Object.keys(currentRates).length === 0) {
    console.error(`convertCurrency: Missing exchange rates for conversion from ${fromNorm} to ${toNorm}.`);
    return 0;
  }

  // Rate lookup (assuming base is USD)
  const fromRate = currentRates[fromNorm === Currency.ILA ? Currency.ILS : fromNorm];
  const toRate = currentRates[toNorm === Currency.ILA ? Currency.ILS : toNorm];

  if ((fromNorm !== Currency.USD && fromNorm !== Currency.ILA) && !fromRate) {
    console.warn(`convertCurrency: Missing or zero rate for source currency: ${fromNorm} (rate: ${fromRate}). returning 0.`);
    return 0;
  }
  if ((toNorm !== Currency.USD && toNorm !== Currency.ILA) && !toRate) {
    console.warn(`convertCurrency: Missing or zero rate for target currency: ${toNorm} (rate: ${toRate}). returning 0.`);
    return 0;
  }

  // Normalize input to Major Unit (ILS if ILA) for calculation
  const adjustedAmount = (fromNorm === Currency.ILA) ? amount / 100 : amount;

  const amountInUSD = (fromNorm === Currency.USD) ? adjustedAmount : adjustedAmount / fromRate;
  const result = (toNorm === Currency.USD) ? amountInUSD : amountInUSD * toRate;

  // If target is ILA, result (which is in ILS because we used ILS rate) needs to be converted to ILA
  if (toNorm === Currency.ILA) return result * 100;

  return result;
}

export const calculatePerformanceInDisplayCurrency = (
  currentPrice: number,
  stockCurrency: Currency | string,
  perfPct: number | undefined | null,
  displayCurrency: string,
  exchangeRates: ExchangeRates
) => {
  if (perfPct === undefined || perfPct === null || isNaN(perfPct)) return { changeVal: NaN, changePct1d: NaN };

  const normStockCurrency = normalizeCurrency(stockCurrency as string);
  const normDisplayCurrency = normalizeCurrency(displayCurrency);

  // Handle -100% change edge case to prevent division by zero
  if (Math.abs(1 + perfPct) < 1e-9) {
    const priceDisplayNow = convertCurrency(currentPrice, normStockCurrency, normDisplayCurrency, exchangeRates);
    return { changeVal: -priceDisplayNow, changePct1d: -1 };
  }

  const prevPriceStock = currentPrice / (1 + perfPct);
  const changeValStock = currentPrice - prevPriceStock;

  const changeValDisplay = convertCurrency(changeValStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);

  const prevPriceDisplay = convertCurrency(prevPriceStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
  const changePctDisplay = prevPriceDisplay !== 0 ? changeValDisplay / prevPriceDisplay : 0;

  return { changeVal: changeValDisplay, changePct1d: changePctDisplay };
};



export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const options: Intl.NumberFormatOptions = {
    useGrouping: true,
    ...(Number.isInteger(n)
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
  return LTR_MARK + n.toLocaleString(undefined, options);
}

/** @deprecated Use formatMoneyValue instead to ensure type safety */
export function formatValue(n: number, currency: string | Currency, decimals = 2, _t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  let norm = normalizeCurrency(currency as string);

  if (norm === Currency.ILA) {
    norm = Currency.ILS;
    n = toILS(n, Currency.ILA);
  }

  try {
    return LTR_MARK + new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    }).format(n);
  } catch (e) {
    console.warn(`Could not format currency for code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: true });
    return `${LTR_MARK}${val} ${norm}`;
  }
}

export function formatPercent(n: number, alwaysShowSign = false): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: alwaysShowSign ? 'exceptZero' : 'auto',
  });
  return LTR_MARK + formatter.format(n);
}

/** @deprecated Use formatMoneyPrice instead to ensure type safety */
export function formatPrice(n: number, currency: string | Currency, decimals = 2, t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';

  const norm = normalizeCurrency(currency as string);

  if (norm === Currency.ILA) {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
    const agorotText = t ? t('ag.', "א'") : 'ag.';
    return `${LTR_MARK}${val} ${agorotText}`;
  }

  try {
    return LTR_MARK + new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: false,
    }).format(n);
  } catch (e) {
    console.warn(`Could not format price for currency code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
    return `${LTR_MARK}${val} ${norm}`;
  }
}

// Helpers for SimpleMoney
import type { SimpleMoney } from './types';

export function convertMoney(money: SimpleMoney | undefined, targetCurrency: string | Currency, rates: ExchangeRates | undefined): SimpleMoney {
  const target = normalizeCurrency(targetCurrency as string);
  if (!money) return { amount: 0, currency: target };
  const amount = convertCurrency(money.amount, money.currency, target, rates);
  return { amount, currency: target };
}

export function formatMoneyValue(m: SimpleMoney | undefined, t?: any): string {
  if (!m) return '-';
  // Use formatValue default
  return formatValue(m.amount, m.currency, 2, t);
}

export function formatMoneyPrice(m: SimpleMoney | undefined, t?: any): string {
  if (!m) return '-';
  return formatPrice(m.amount, m.currency, 2, t);
}


