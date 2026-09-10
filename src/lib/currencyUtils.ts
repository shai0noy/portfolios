import { Currency, Exchange, EXCHANGE_SETTINGS, parseExchange } from './types';
import type { ExchangeRates } from './types';
import { InstrumentClassification, InstrumentGroup, InstrumentType, INSTRUMENT_METADATA, GLOBES_TYPE_MAPPING } from './types/instrument';
import type { ExchangeMetadata } from './types/ticker';

// Unicode Left-to-Right Mark (LRM).
const LTR_MARK = '\u200E';

function cleanZero(n: number, maxDecimals: number): number {
  if (n === 0) return 0; // standardizes -0
  const factor = Math.pow(10, maxDecimals);
  if (Math.round(n * factor) === 0) return 0;
  return n;
}

export function normalizeCurrency(input: string): Currency {
  if (!input) return Currency.USD;
  const upper = input.trim().toUpperCase();

  // Hebrew & Symbols
  if (upper === 'ש"ח' || upper === 'NIS' || upper === 'ILS') return Currency.ILS;
  if (upper === 'אג' || upper === 'ILA' || upper === 'ILAG' || upper === 'AGOROT' || upper === 'AG') return Currency.ILA;
  if (upper === 'דולר' || upper === '$' || upper === 'DOLLAR' || upper === 'USD') return Currency.USD;
  if (upper === 'אירו' || upper === 'EUR' || upper === 'EURO') return Currency.EUR;
  if (upper === 'ליש"ט' || upper === 'LIRA' || upper === 'GBP') return Currency.GBP;
  if (upper === 'CAD') return Currency.CAD;
  if (upper === 'JPY') return Currency.JPY;
  if (upper === 'HKD') return Currency.HKD;
  if (upper === 'AUD') return Currency.AUD;
  if (upper === 'KRW') return Currency.KRW;
  if (upper === 'CHF') return Currency.CHF;

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
    // Return 0 silently if exchangeRates are not loaded yet to avoid console spam during initial app load or auth refresh
    return 0;
  }

  // Rate lookup (assuming base is USD)
  const fromRate = currentRates[fromNorm === Currency.ILA ? Currency.ILS : fromNorm];
  const toRate = currentRates[toNorm === Currency.ILA ? Currency.ILS : toNorm];

  if (fromNorm !== Currency.USD && !fromRate) {
    console.warn(`convertCurrency: Missing or zero rate for source currency: ${fromNorm} (rate: ${fromRate}). returning 0.`);
    return 0;
  }
  if (toNorm !== Currency.USD && !toRate) {
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

export function extractInstrumentGroup(
  type?: InstrumentClassification | InstrumentType | InstrumentGroup | string | { group?: string; type?: string }
): InstrumentGroup | undefined {
  if (!type) return undefined;

  if (typeof type === 'object') {
    if ('group' in type && type.group && Object.values(InstrumentGroup).includes(type.group as InstrumentGroup)) {
      return type.group as InstrumentGroup;
    }
    if ('type' in type && type.type) {
      const canonicalType = type.type as InstrumentType;
      if (INSTRUMENT_METADATA[canonicalType]) {
        return INSTRUMENT_METADATA[canonicalType].group;
      }
    }
  }

  if (typeof type === 'string') {
    const upper = type.toUpperCase();
    if (Object.values(InstrumentGroup).includes(upper as InstrumentGroup)) {
      return upper as InstrumentGroup;
    }
    if (Object.values(InstrumentType).includes(upper as InstrumentType)) {
      return INSTRUMENT_METADATA[upper as InstrumentType]?.group;
    }
    const lower = type.toLowerCase();
    const mapped = GLOBES_TYPE_MAPPING[lower];
    if (mapped && INSTRUMENT_METADATA[mapped]) {
      return INSTRUMENT_METADATA[mapped].group;
    }
  }

  return undefined;
}

export interface ResolveTickerPriceCurrencyParams {
  exchange?: Exchange | string;
  ticker?: string;
  reportedCurrency?: Currency | string;
  stockCurrency?: Currency | string;
  type?: InstrumentClassification | InstrumentType | InstrumentGroup | string | { group?: string; type?: string };
  meta?: ExchangeMetadata | any;
}

/**
 * Resolves the quote / price currency for an instrument using its exchange, metadata,
 * reported currency feed, and instrument classification.
 *
 * For TASE:
 * - Foreign-currency denominated assets (e.g. USD bonds, foreign ETFs) trade and quote in their foreign currency (e.g. USD, EUR).
 * - Non-Agorot instruments like FOREX, INDEX, and DERIVATIVE (options/futures) quote in Shekels (ILS) or native points.
 * - Standard securities (STOCK, ETF, MUTUAL_FUND, MONETARY_FUND, BOND) quote in Agorot (Currency.ILA), even when data providers (like Yahoo) label them as "ILS".
 *
 * For non-TASE exchanges:
 * - Uses reportedCurrency, then stockCurrency, then exchange defaultCurrency (e.g. USD for NASDAQ, GBP for LSE).
 */
export function resolveTickerPriceCurrency(params: ResolveTickerPriceCurrencyParams): Currency {
  // 1. Safely normalize reportedCurrency if present
  let normReported: Currency | undefined;
  if (params.reportedCurrency) {
    try {
      normReported = normalizeCurrency(params.reportedCurrency);
    } catch {
      // ignore unparseable currency string
    }
  }

  // 2. Safely normalize stockCurrency if present
  let normStock: Currency | undefined;
  if (params.stockCurrency) {
    try {
      normStock = normalizeCurrency(params.stockCurrency);
    } catch {
      // ignore unparseable currency string
    }
  }

  // 3. Resolve exchange
  let exchange: Exchange | undefined;
  if (params.exchange) {
    try {
      exchange = parseExchange(params.exchange);
    } catch {
      // ignore unparseable exchange
    }
  }

  if (!exchange && params.ticker?.endsWith('.TA')) {
    exchange = Exchange.TASE;
  }

  // 4. Foreign currency check:
  // If reported currency is explicitly a foreign currency (not ILS and not ILA),
  // honor it directly regardless of exchange (e.g. USD bond or foreign ETF on TASE).
  if (normReported && normReported !== Currency.ILS && normReported !== Currency.ILA) {
    return normReported;
  }

  // If no reported currency is provided, but stockCurrency is explicitly a foreign currency,
  // honor it (e.g. USD asset held on TASE).
  if (!normReported && normStock && normStock !== Currency.ILS && normStock !== Currency.ILA) {
    return normStock;
  }

  // 5. Explicit ILA:
  if (normReported === Currency.ILA) {
    return Currency.ILA;
  }

  // 6. Handle TASE specific instruments using metadata:
  if (exchange === Exchange.TASE) {
    const group = extractInstrumentGroup(params.type);

    // Non-Agorot instrument groups on TASE:
    // Indices (points/ILS), Forex (currencies/crypto), Derivatives (options/futures) quote in Shekels (ILS)
    if (
      group === InstrumentGroup.INDEX ||
      group === InstrumentGroup.FOREX ||
      group === InstrumentGroup.DERIVATIVE
    ) {
      return Currency.ILS;
    }

    // Standard securities on TASE: STOCK, ETF, MUTUAL_FUND, MONETARY_FUND, BOND
    // Standard market convention on TASE is Agorot (Currency.ILA).
    // Data sources (like Yahoo Finance) frequently report "ILS" even though prices are in Agorot.
    // Therefore, for standard securities (or unspecified group) on TASE, price currency is ILA.
    return Currency.ILA;
  }

  // 7. Non-TASE exchanges:
  if (normReported) {
    return normReported;
  }
  if (normStock) {
    return normStock;
  }
  if (exchange && EXCHANGE_SETTINGS[exchange]?.defaultCurrency) {
    return EXCHANGE_SETTINGS[exchange].defaultCurrency!;
  }

  return Currency.USD;
}

/**
 * Returns true if the ticker's price is quoted in Agorot (Currency.ILA).
 */
export function isAgorotQuote(params: ResolveTickerPriceCurrencyParams): boolean {
  return resolveTickerPriceCurrency(params) === Currency.ILA;
}

export function roundDivAmount(amount: number): number {
  const nearestTenth = Math.round(amount * 10) / 10;
  if (Math.abs(amount - nearestTenth) <= 0.010001) {
    return nearestTenth;
  }
  return amount;
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
  n = cleanZero(n, 2);
  const options: Intl.NumberFormatOptions = {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
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

  const activeDecimals = Math.abs(n) >= 100 ? 0 : decimals;
  n = cleanZero(n, activeDecimals);

  try {
    return LTR_MARK + new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: 0,
      maximumFractionDigits: activeDecimals
    }).format(n);
  } catch (e) {
    console.warn(`Could not format currency for code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: activeDecimals, useGrouping: true });
    return `${LTR_MARK}${val} ${norm}`;
  }
}

export function formatPercent(n: number, alwaysShowSign = false): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const activeDecimals = Math.abs(n) >= 1 ? 0 : 2;
  n = cleanZero(n, activeDecimals + 2); // percent shifts by 2 decimal places
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: activeDecimals,
    signDisplay: alwaysShowSign ? 'exceptZero' : 'auto',
  });
  return LTR_MARK + formatter.format(n);
}

/** @deprecated Use formatMoneyPrice instead to ensure type safety */
export function formatPrice(n: number, currency: string | Currency, decimals = 2, t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';

  const norm = normalizeCurrency(currency as string);

  if (norm === Currency.ILS) {
    // Israeli stocks are quoted in Agorot (ILA). 1 ILS = 100 ILA.
    return formatPrice(n * 100, Currency.ILA, decimals, t);
  }

  n = cleanZero(n, decimals);

  if (norm === Currency.ILA) {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
    const agorotText = t ? t('ag.', "א'") : 'ag.';
    return `${LTR_MARK}${val} ${agorotText}`;
  }

  try {
    return LTR_MARK + new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
      useGrouping: false,
    }).format(n);
  } catch (e) {
    console.warn(`Could not format price for currency code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
    return `${LTR_MARK}${val} ${norm}`;
  }
}

/**
 * Formats a value using compact notation (K, M, etc.) for large numbers.
 * Useful for chart axes and summary stats.
 */
export function formatCompactPrice(n: number, currency: string | Currency, t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';

  const norm = normalizeCurrency(currency as string);

  // Israeli prices are always Agorot (ILA). 1 ILS = 100 ILA.
  if (norm === Currency.ILS) {
    return formatCompactPrice(n * 100, Currency.ILA, t);
  }

  // Now we are dealing with ILA or another standard currency.
  // For small values, use standard pricing format
  if (Math.abs(n) < 1000) {
    return formatPrice(n, currency, 0, t);
  }

  n = cleanZero(n, 1);

  if (norm === Currency.ILA) {
    const val = n.toLocaleString('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1
    });
    const agorotText = t ? t('ag.', "א'") : 'ag.';
    return `${LTR_MARK}${val} ${agorotText}`;
  }

  try {
    return LTR_MARK + new Intl.NumberFormat(['en-US', 'en'], {
      style: 'currency',
      currency: norm,
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(n);
  } catch (e) {
    return formatPrice(n, currency, 0, t);
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

export function formatMoneyValue(m: SimpleMoney | undefined, t?: any, decimals = 2): string {
  if (!m) return '-';
  // Use formatValue default
  return formatValue(m.amount, m.currency, decimals, t);
}

export function formatMoneyPrice(m: SimpleMoney | undefined, t?: any): string {
  if (!m) return '-';
  return formatPrice(m.amount, m.currency, 2, t);
}

/**
 * Formats a value using compact notation (K, M, etc.) while ensuring 
 * it stays in the major currency unit (e.g. converting ILA to ILS).
 */
export function formatCompactValue(n: number, currency: string | Currency, t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';

  let norm = normalizeCurrency(currency as string);
  let val = n;

  if (norm === Currency.ILA) {
    norm = Currency.ILS;
    val = toILS(n, Currency.ILA);
  }

  // For small values, use standard value format
  if (Math.abs(val) < 1000) {
    return formatValue(val, norm, 0, t);
  }

  val = cleanZero(val, 1);

  try {
    return LTR_MARK + new Intl.NumberFormat(['en-US', 'en'], {
      style: 'currency',
      currency: norm,
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(val);
  } catch (e) {
    return formatValue(val, norm, 0, t);
  }
}

export function formatMoneyCompactValue(m: SimpleMoney | undefined, t?: any): string {
  if (!m) return '-';
  return formatCompactValue(m.amount, m.currency, t);
}


