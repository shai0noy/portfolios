import { fetchSheetExchangeRates } from './sheets/index';
import { Currency } from './types';
import type { ExchangeRates, DashboardHolding } from './types';

const CACHE_KEY = 'exchangeRates';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

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
  if (upper === 'ILA') return Currency.ILA;
  if (upper === 'NIS' || upper === 'ILS') return Currency.ILS;
  if (upper === 'EUR') return Currency.EUR;
  if (upper === 'GBP') return Currency.GBP;
  if (upper === 'USD') return Currency.USD;
  return Currency.USD; // Default fallback
}

export function toAgorot(amount: number): number {
    return amount * 100;
}

export function fromAgorot(amount: number): number {
    return amount / 100;
}

export function convertCurrency(amount: number, from: Currency | string, to: Currency | string, rates: ExchangeRates | Record<string, number>): number {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  
  const fromNorm = normalizeCurrency(from as string);
  const toNorm = normalizeCurrency(to as string);
  
  if (fromNorm === toNorm) return amount;

  let currentRates: Record<string, number>;
  if ('current' in rates) {
      currentRates = (rates as ExchangeRates).current;
  } else {
      currentRates = rates as Record<string, number>;
  }

  if (!currentRates) {
    return amount;
  }

  // Rate lookup (assuming base is USD)
  const fromRate = currentRates[fromNorm === Currency.ILA ? Currency.ILS : fromNorm]; 
  const toRate = currentRates[toNorm === Currency.ILA ? Currency.ILS : toNorm]; 

  // Special handling for ILA (Agorot) which is 1/100 of ILS
  let adjustedAmount = amount;
  if (fromNorm === Currency.ILA) adjustedAmount = fromAgorot(amount);
  
  if ((fromNorm !== Currency.USD && fromNorm !== Currency.ILA) && !fromRate) return amount; 
  if ((toNorm !== Currency.USD && toNorm !== Currency.ILA) && !toRate) return amount; 

  const amountInUSD = (fromNorm === Currency.USD) ? adjustedAmount : adjustedAmount / fromRate;
  const result = (toNorm === Currency.USD) ? amountInUSD : amountInUSD * toRate;
  
  if (toNorm === Currency.ILA) return toAgorot(result);
  return result;
}

export const calculatePerformanceInDisplayCurrency = (
  currentPrice: number,
  stockCurrency: Currency | string,
  perfPct: number,
  period: string,
  displayCurrency: string,
  exchangeRates: ExchangeRates
) => {
  if (!perfPct) return { changeVal: 0, changePct: 0 };
  
  // NOTE: currentPrice is expected to be in MAJOR units (ILS, USD) as per new rule.
  
  const normStockCurrency = normalizeCurrency(stockCurrency as string);
  const normDisplayCurrency = normalizeCurrency(displayCurrency);

  // Convert current price to Display Currency
  const priceDisplayNow = convertCurrency(currentPrice, normStockCurrency, normDisplayCurrency, exchangeRates);

  // Infer previous price in Stock Currency
  const prevPriceStock = currentPrice / (1 + perfPct);
  
  // Handle historical rates
  const historicalRates = (exchangeRates[period] as Record<string, number>) || exchangeRates.current;
  
  const prevPriceDisplay = convertCurrency(prevPriceStock, normStockCurrency, normDisplayCurrency, historicalRates);

  const changeVal = priceDisplayNow - prevPriceDisplay;
  const changePct = prevPriceDisplay !== 0 ? changeVal / prevPriceDisplay : 0;

  return { changeVal, changePct };
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
    const realizedGainAfterTax = realizedGain * 0.75; // Approx

    const totalGain = unrealizedGain + realizedGain + dividends;
    const totalGainPct = (costBasis + costOfSold) > 1e-6 ? totalGain / (costBasis + costOfSold) : 0;
    
    const valueAfterTax = marketValue - (unrealizedGain > 0 ? unrealizedGain * 0.25 : 0);

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

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const options: Intl.NumberFormatOptions = Number.isInteger(n)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString(undefined, options);
}

export function formatCurrency(n: number, currency: string | Currency, decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const norm = normalizeCurrency(currency as string);

  if (norm === Currency.ILA) {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${val} ag.`;
  }
  
  // Use Intl.NumberFormat for proper currency formatting
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: norm,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(n);
  } catch (e) {
    // Fallback for unknown currency codes
    console.warn(`Could not format currency for code: ${norm}. Using default format.`);
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${val} ${norm}`;
  }
}

export function formatPercent(n: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return `${(n * 100).toFixed(2)}%`;
}

// Strictly used for displaying Ticker Costs/Prices. 
// Enforces rule: ILS prices always shown in Agorot.
export function formatPrice(n: number, currency: string | Currency, decimals = 2): string {
    if (n === undefined || n === null || isNaN(n)) return '-';
    
    const norm = normalizeCurrency(currency as string);

    // Rule: Ticker costs in ILS or ILA are ALWAYS displayed in Agorot
    if (norm === Currency.ILS || norm === Currency.ILA) {
        // If it's already ILA (Agorot units), don't multiply.
        // But Dashboard stores everything in Major Units (ILS).
        // So we likely need to multiply by 100 to display Agorot.
        const agorotVal = toAgorot(n);
        const val = agorotVal.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return `${val} ag.`;
    }
    
    // Fallback for others
    return formatCurrency(n, currency, decimals);
}
