import { fetchSheetExchangeRates } from './sheets/index';
import { Currency } from './types';
import type { ExchangeRates, DashboardHolding } from './types';

const CACHE_KEY = 'exchangeRates_v2';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Unicode Left-to-Right Mark (LRM).
// Used to ensure that numbers and their signs/currencies are displayed correctly
// in RTL (Hebrew) interfaces, preventing the sign from jumping to the wrong side.
const LTR_MARK = '\u200E';

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

// TODO: Rename
export function normalizeCurrency(input: string): Currency {
  if (!input) return Currency.USD;
  const upper = input.trim().toUpperCase();
  
  // Hebrew & Symbols
  if (upper === 'ש"ח' || upper === 'NIS' || upper === 'ILS') return Currency.ILS;
  if (upper === 'אג' || upper === 'ILA' || upper === 'ILAG' || upper === 'AGOROT' || upper === 'AG') return Currency.ILA;
  if (upper === 'דולר' || upper === '$' || upper === 'DOLLAR' || upper === 'USD') return Currency.USD;
  if (upper === 'אירו' || upper === 'EUR' || upper === 'EURO') return Currency.EUR;
  if (upper === 'ליש"ט' || upper === 'LIRA' || upper === 'GBP') return Currency.GBP;
  
  if (upper === 'USD') return Currency.USD; // Redundant but safe fallback check
  
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

  if (!currentRates) {
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
  // Use toILA logic directly to avoid circular dependency or rate check overhead for this specific unit conversion
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

  // --- REVISED LOGIC ---
  // Perform all calculations in the stock's native currency first, then convert the final result.
  // This prevents historical exchange rate fluctuations from distorting the daily change value.

  // 1. Calculate previous price and change in the stock's currency
  const prevPriceStock = currentPrice / (1 + perfPct);
  const changeValStock = currentPrice - prevPriceStock;

  // 2. Convert the final change value to the display currency using ONLY current rates for consistency
  const changeValDisplay = convertCurrency(changeValStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);

  // 3. Percentage change is independent of currency, but we recalculate for precision
  const prevPriceDisplay = convertCurrency(prevPriceStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
  const changePctDisplay = prevPriceDisplay !== 0 ? changeValDisplay / prevPriceDisplay : 0;
  
  return { changeVal: changeValDisplay, changePct1d: changePctDisplay };
};

export const calculateHoldingDisplayValues = (h: DashboardHolding, displayCurrency: string, exchangeRates: ExchangeRates) => {
    const normDisplay = normalizeCurrency(displayCurrency);
    const convert = (val: number, from: Currency) => convertCurrency(val, from, normDisplay, exchangeRates);
    
    let costBasis = 0;
    let costOfSold = 0;
    let proceeds = 0;
    let dividends = 0;

    const normStock = h.stockCurrency; 

    // Simplification: Always use convert() helper which handles equality checks and ILA
    costBasis = convert(h.costBasisPortfolioCurrency, h.portfolioCurrency);
    costOfSold = convert(h.costOfSoldPortfolioCurrency, h.portfolioCurrency);
    proceeds = convert(h.proceedsPortfolioCurrency, h.portfolioCurrency);
    dividends = convert(h.dividendsPortfolioCurrency, h.portfolioCurrency);

    // Override for native views (USD/ILS) if available (better precision/alignment AND HISTORICAL ACCURACY)
    if (normDisplay === Currency.USD) {
        if (h.portfolioCurrency === Currency.USD || h.costBasisUSD !== 0 || h.proceedsUSD !== 0 || h.dividendsUSD !== 0) {
            costBasis = h.costBasisUSD;
            costOfSold = h.costOfSoldUSD;
            proceeds = h.proceedsUSD;
            dividends = h.dividendsUSD;
        }
    } else if (normDisplay === Currency.ILS) {
        if (h.portfolioCurrency === Currency.ILS || h.costBasisILS !== 0 || h.proceedsILS !== 0 || h.dividendsILS !== 0) {
            costBasis = h.costBasisILS;
            costOfSold = h.costOfSoldILS;
            proceeds = h.proceedsILS;
            dividends = h.dividendsILS;
        }
    } else if (normDisplay === normStock && (h.costBasisStockCurrency > 0 || h.qtyVested + h.qtyUnvested > 0)) {
        costBasis = h.costBasisStockCurrency;
        costOfSold = h.costOfSoldStockCurrency;
        proceeds = h.proceedsStockCurrency;
        dividends = h.dividendsStockCurrency;
    }

    const marketValue = convert(h.marketValuePortfolioCurrency, h.portfolioCurrency);
    
    const unrealizedGain = marketValue - costBasis;
    const unrealizedGainPct = costBasis > 1e-6 ? unrealizedGain / costBasis : 0;
    
    const realizedGain = proceeds - costOfSold;
    const realizedGainPct = costOfSold > 1e-6 ? realizedGain / costOfSold : 0;
    const realizedGainAfterTax = convert(h.realizedGainAfterTax, h.portfolioCurrency);

    const totalGain = unrealizedGain + realizedGain + dividends;
    const totalGainPct = (costBasis + costOfSold) > 1e-6 ? totalGain / (costBasis + costOfSold) : 0;
    
    const valueAfterTax = convert(h.valueAfterTax, h.portfolioCurrency);

    return {
        costBasis,
        costOfSold,
        proceeds,
        marketValue,
        unrealizedGain, unrealizedGainPct,
        realizedGain, realizedGainPct, realizedGainAfterTax,
        totalGain, totalGainPct,
        valueAfterTax,
        dividends
    };
};

/**
 * Formats a generic number. Includes thousand separators and 2 decimal places for non-integers.
 * e.g., 12345.67 -> "12,345.67"
 * e.g., 12345 -> "12,345"
 */
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

/**
 * Formats a monetary value (like total market value). Includes thousand separators.
 * This is distinct from `formatPrice`, which is for individual unit prices.
 * For 'ILA' currency, it converts to ILS.
 */
export function formatValue(n: number, currency: string | Currency, decimals = 2, t?: (key: string, fallback: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  let norm = normalizeCurrency(currency as string);

  if (norm === Currency.ILA) {
    norm = Currency.ILS;
    n = toILS(n, Currency.ILA);
  }
  
  // Use Intl.NumberFormat for proper currency formatting
  try {
    return LTR_MARK + new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
      // useGrouping: true is the default for style: 'currency'
    }).format(n);
  } catch (e) {
    // Fallback for unknown currency codes
    console.warn(`Could not format currency for code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: true });
    return `${LTR_MARK}${val} ${norm}`;
  }
}

/**
 * Formats a number as a percentage.
 * e.g., 0.57 -> "57%"
 * e.g., 0.5712 -> "57.12%"
 * e.g., 0.005 -> "0.5%"
 */
export function formatPercent(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return LTR_MARK + formatter.format(n);
}

/**
 * Formats a price for a single share/unit. Does NOT use thousand separators for clarity.
 * Enforces the rule that ILS-based prices are always shown in Agorot.
 * e.g., (12345.67, 'ILA') -> "12345.67 ag."
 * e.g., (123.45, 'USD') -> "$123.45"
 */
export function formatPrice(n: number, currency: string | Currency, decimals = 2, t?: (key: string, fallback: string) => string): string {
    if (n === undefined || n === null || isNaN(n)) return '-';
    
    const norm = normalizeCurrency(currency as string);

    // If strictly ILA, show in Agorot
    if (norm === Currency.ILA) {
        const val = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals, useGrouping: false });
        const agorotText = t ? t('ag.', "א'") : 'ag.';
        return `${LTR_MARK}${val} ${agorotText}`;
    }
    
    // For ILS and others, use standard currency formatting
    try {
        return LTR_MARK + new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: norm,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: false,
        }).format(n);
    } catch (e) {
        // Fallback for unknown currency codes
        console.warn(`Could not format price for currency code: ${norm}. Using default format.`);
        const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
        return `${LTR_MARK}${val} ${norm}`;
    }
}
