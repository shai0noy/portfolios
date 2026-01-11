import { fetchSheetExchangeRates } from './sheets/index';
import type { ExchangeRates, DashboardHolding, Currency, PriceUnit } from './types';

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

export function convertCurrency(amount: number, from: Currency, to: Currency, rates: ExchangeRates | Record<string, number>): number {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  
  // Safe normalization
  const fromNorm = (from || 'USD').trim().toUpperCase();
  const toNorm = (to || 'USD').trim().toUpperCase();
  
  if (fromNorm === toNorm) return amount;

  // Handle rates structure: support both full ExchangeRates object and a simple Record<string, number>
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

  if (fromNorm !== 'USD' && !fromRate) return amount; // Cannot convert
  if (toNorm !== 'USD' && !toRate) return amount; // Cannot convert

  // Convert
  const amountInUSD = fromNorm === 'USD' ? amount : amount / fromRate;
  return toNorm === 'USD' ? amountInUSD : amountInUSD * toRate;
}

export const calculatePerformanceInDisplayCurrency = (
  currentPrice: number,
  stockCurrency: string,
  priceUnit: PriceUnit | undefined,
  perfPct: number,
  period: string,
  displayCurrency: string,
  exchangeRates: ExchangeRates
) => {
  if (!perfPct) return { changeVal: 0, changePct: 0 };

  let adjustedCurrentPrice = currentPrice;
  if (priceUnit === 'agorot') adjustedCurrentPrice /= 100;
  else if (priceUnit === 'cents') adjustedCurrentPrice /= 100;

  const priceDisplayNow = convertCurrency(adjustedCurrentPrice, stockCurrency, displayCurrency, exchangeRates);

  const prevPriceStock = adjustedCurrentPrice / (1 + perfPct);
  
  // Handle historical rates
  // Try to find historical rates for the period, fallback to current
  const historicalRates = (exchangeRates[period] as Record<string, number>) || exchangeRates.current;
  
  const prevPriceDisplay = convertCurrency(prevPriceStock, stockCurrency, displayCurrency, historicalRates);

  const changeVal = priceDisplayNow - prevPriceDisplay;
  const changePct = prevPriceDisplay !== 0 ? changeVal / prevPriceDisplay : 0;

  return { changeVal, changePct };
};

// Shared helper to calculate display values (Cost Basis, MV, Gains)
export const calculateHoldingDisplayValues = (h: DashboardHolding, displayCurrency: string, exchangeRates: ExchangeRates) => {
    const convert = (val: number, from: string) => convertCurrency(val, from, displayCurrency, exchangeRates);
    
    let costBasis = 0;
    let costOfSold = 0;
    let proceeds = 0;
    let dividends = 0;

    const normDisplay = (displayCurrency || '').trim().toUpperCase();
    const normStock = (h.stockCurrency || '').trim().toUpperCase();
    const normPort = (h.portfolioCurrency || '').trim().toUpperCase();

    // Strategy:
    // 1. Native View: If Display == Stock, use Stock Currency Basis (Accurate Native Return)
    // 2. Portfolio View: If Display == Portfolio, use Portfolio Currency Basis (Accurate Portfolio Return)
    // 3. Third Currency: Convert Portfolio Currency Basis (Preserves Portfolio Return %)
    
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

export function formatCurrency(n: number, currency: string, decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (currency === 'USD') return `$${val}`;
  if (currency === 'ILS' || currency === 'NIS') return `₪${val}`;
  if (currency === 'EUR') return `€${val}`;
  return `${val} ${currency}`;
}

export function formatPrice(n: number, currency: string, decimals = 2, priceUnit: PriceUnit = 'base'): string {
    if (n === undefined || n === null || isNaN(n)) return '-';
    
    // If we are displaying in Agorot, we don't convert the value, just the label usually, 
    // BUT the previous logic in DashboardTable was:
    // if (priceUnit === 'agorot') return `${val} ag.`;
    // This implies 'n' is passed in Agorot (e.g. 150) and displayed as "150 ag."
    
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const curr = (currency || 'ILS').toUpperCase();

    if (curr === 'ILS' || curr === 'NIS') {
      if (priceUnit === 'agorot') return `${val} ag.`;
      return `₪${val}`;
    }
    if (priceUnit === 'cents' && curr === 'USD') {
        return `${val}¢`;
    }
    
    return formatCurrency(n, currency, decimals);
}
