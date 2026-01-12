import { fetchSheetExchangeRates } from './sheets/index';
import { Currency } from './types';
import type { ExchangeRates, DashboardHolding, PriceUnit } from './types';

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

export function normalizeCurrency(input: string): Currency {
  if (!input) return Currency.USD;
  const upper = input.trim().toUpperCase();
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
  const fromRate = currentRates[fromNorm]; 
  const toRate = currentRates[toNorm]; 

  if (fromNorm !== Currency.USD && !fromRate) return amount; 
  if (toNorm !== Currency.USD && !toRate) return amount; 

  const amountInUSD = fromNorm === Currency.USD ? amount : amount / fromRate;
  return toNorm === Currency.USD ? amountInUSD : amountInUSD * toRate;
}

export const calculatePerformanceInDisplayCurrency = (
  currentPrice: number,
  stockCurrency: Currency | string,
  priceUnit: PriceUnit | undefined,
  perfPct: number,
  period: string,
  displayCurrency: string,
  exchangeRates: ExchangeRates
) => {
  if (!perfPct) return { changeVal: 0, changePct: 0 };
  
  // NOTE: currentPrice is expected to be in MAJOR units (ILS, USD) as per new rule.
  // priceUnit is kept for compatibility if needed, but currentPrice logic should assume Major Units.
  
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

    const normStock = h.stockCurrency; // Already normalized in DashboardHolding
    const normPort = h.portfolioCurrency; // Already normalized in DashboardHolding

    if (normDisplay === normStock && (h.costBasisStockCurrency > 0 || h.qtyVested + h.qtyUnvested > 0)) {
        costBasis = h.costBasisStockCurrency;
        costOfSold = h.costOfSoldStockCurrency;
        proceeds = h.proceedsStockCurrency;
        dividends = h.dividendsStockCurrency;
    } else if (normDisplay === normPort) {
        costBasis = h.costBasisPortfolioCurrency;
        costOfSold = h.costOfSoldPortfolioCurrency;
        proceeds = h.proceedsPortfolioCurrency;
        dividends = h.dividendsPortfolioCurrency;
    } else {
        costBasis = convert(h.costBasisPortfolioCurrency, h.portfolioCurrency);
        costOfSold = convert(h.costOfSoldPortfolioCurrency, h.portfolioCurrency);
        proceeds = convert(h.proceedsPortfolioCurrency, h.portfolioCurrency);
        dividends = convert(h.dividendsPortfolioCurrency, h.portfolioCurrency);
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
  const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (norm === Currency.USD) return `$${val}`;
  if (norm === Currency.ILS) return `₪${val}`;
  if (norm === Currency.EUR) return `€${val}`;
  if (norm === Currency.GBP) return `£${val}`;
  return `${val} ${norm}`;
}

// Strictly used for displaying Ticker Costs/Prices. 
// Enforces rule: ILS prices always shown in Agorot.
export function formatPrice(n: number, currency: string | Currency, decimals = 2, priceUnit?: PriceUnit): string {
    if (n === undefined || n === null || isNaN(n)) return '-';
    
    const norm = normalizeCurrency(currency as string);

    // Rule: Ticker costs in ILS are ALWAYS displayed in Agorot
    if (norm === Currency.ILS) {
        const agorotVal = toAgorot(n);
        // Display as integer usually for agorot, or 2 decimals? "150 ag." vs "150.00 ag."
        // Usually prices like 1234.5 ag exists. Let's keep decimals.
        const val = agorotVal.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        return `${val} ag.`;
    }
    
    // Fallback for others
    return formatCurrency(n, currency, decimals);
}