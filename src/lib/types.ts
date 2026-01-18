export type PriceUnit = 'base' | 'agorot';

export type Currency = 'USD' | 'ILS' | 'EUR' | 'GBP' | 'ILA';
export const Currency = {
  USD: 'USD' as Currency,
  ILS: 'ILS' as Currency,
  EUR: 'EUR' as Currency,
  GBP: 'GBP' as Currency,
  ILA: 'ILA' as Currency,
};

const EXCHANGES = [
  'NASDAQ', 'NYSE', 'TASE', 'LSE', 'FWB',
  'EURONEXT', 'JPX', 'HKEX', 'TSX', 'ASX', 'GEMEL'
] as const;

export type Exchange = typeof EXCHANGES[number];

export const Exchange = EXCHANGES.reduce((acc, ex) => {
  acc[ex] = ex;
  return acc;
}, {} as any) as { [K in Exchange]: K };

interface ExchangeSettings {
  aliases: string[];
  googleFinanceCode: string; // e.g., 'TLV' for TASE - This is the code written to Google sheets, even if the exchange is not supported
  yahooFinanceSuffix: string;
}

const EXCHANGE_SETTINGS: Record<Exchange, ExchangeSettings> = {
  [Exchange.NASDAQ]: { 
    aliases: ['XNAS', 'NMS', 'NGS', 'NCM'], 
    googleFinanceCode: 'NASDAQ',
    yahooFinanceSuffix: ''
  },
  [Exchange.NYSE]: { 
    aliases: ['XNYS'], 
    googleFinanceCode: 'NYSE', 
    yahooFinanceSuffix: ''
  },
  [Exchange.TASE]: { 
    aliases: ['XTAE', 'TLV', 'TA'], 
    googleFinanceCode: 'TLV', 
    yahooFinanceSuffix: '.TA' 
  },
  [Exchange.LSE]: { 
    aliases: ['XLON', 'LONDON'], 
    googleFinanceCode: 'LON', 
    yahooFinanceSuffix: '.L' 
  },
  [Exchange.FWB]: { 
    aliases: ['XFRA', 'FRANKFURT', 'XETRA'], 
    googleFinanceCode: 'FRA', 
    yahooFinanceSuffix: '.F' 
  },
  [Exchange.EURONEXT]: { 
    aliases: ['XPAR', 'XAMS', 'XBRU', 'XLIS', 'XDUB'], 
    googleFinanceCode: 'EPA', 
    yahooFinanceSuffix: '.PA' 
  },
  [Exchange.JPX]: { 
    aliases: ['XTKS'], 
    googleFinanceCode: 'TYO', 
    yahooFinanceSuffix: '.T' 
  },
  [Exchange.HKEX]: { 
    aliases: ['XHKG'], 
    googleFinanceCode: 'HKG', 
    yahooFinanceSuffix: '.HK' 
  },
  [Exchange.TSX]: { 
    aliases: ['XTSE'], 
    googleFinanceCode: 'TSE', 
    yahooFinanceSuffix: '.TO' 
  },
  [Exchange.ASX]: { 
    aliases: ['XASX'], 
    googleFinanceCode: 'ASX', 
    yahooFinanceSuffix: '.AX' 
  },
  [Exchange.GEMEL]: { 
    aliases: [], 
    googleFinanceCode: 'GEMEL',
    yahooFinanceSuffix: ''
  },
};

/**
 * Parses an exchange identifier string into a known Exchange type.
 * The matching is case-insensitive.
 * @param exchangeId The exchange identifier to parse (e.g., 'XNAS', 'NASDAQ').
 * @returns A canonical Exchange value
 */
export function parseExchange(exchangeId: string): Exchange {
  if (!exchangeId) throw new Error('parseExchange: exchangeId is empty');
  const normalized = exchangeId.trim().toUpperCase();

  // Direct match
  if (normalized in Exchange) {
    return normalized as Exchange;
  }

  // Alias lookup
  for (const [ex, config] of Object.entries(EXCHANGE_SETTINGS)) {
    if (config.aliases.includes(normalized)) {
      return ex as Exchange;
    }
  }

  throw new Error(`parseExchange: Unknown exchangeId '${exchangeId}'`);
}

/**
 * Converts a canonical Exchange type to its Google Finance exchange code.
 * @param exchange The canonical exchange.
 * @returns The Google Finance exchange code (e.g., 'TLV' for TASE) or the original if no mapping exists.
 */
export function toGoogleFinanceExchangeCode(exchange: Exchange): string {
  return EXCHANGE_SETTINGS[exchange]?.googleFinanceCode || exchange;
}

/**
 * Converts a ticker and a canonical Exchange type to a ticker string suitable for Yahoo Finance.
 * For non-US exchanges, this typically involves adding a suffix.
 * @param ticker The stock ticker.
 * @param exchange The canonical exchange.
 * @returns The ticker formatted for Yahoo Finance (e.g., 'BARC.L').
 */
export function toYahooFinanceTicker(ticker: string, exchange: Exchange): string {
  const suffix = EXCHANGE_SETTINGS[exchange]?.yahooFinanceSuffix || '';
  return `${ticker}${suffix}`;
}

export interface ExchangeRates {
  current: Record<string, number>;
  [key: string]: Record<string, number> | number; 
}

export interface DashboardHolding {
  key: string;
  portfolioId: string;
  portfolioName: string;
  portfolioCurrency: Currency;
  ticker: string;
  exchange: Exchange;
  displayName: string;
  nameHe?: string;
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  currentPrice: number; // ALWAYS in Major Unit (e.g. ILS, USD)
  stockCurrency: Currency;

  // Values in Portfolio Base Currency
  costBasisPortfolioCurrency: number;
  costOfSoldPortfolioCurrency: number;
  proceedsPortfolioCurrency: number;
  dividendsPortfolioCurrency: number;
  unrealizedGainPortfolioCurrency: number;
  realizedGainPortfolioCurrency: number;
  totalGainPortfolioCurrency: number;
  marketValuePortfolioCurrency: number;
  dayChangeValuePortfolioCurrency: number;

  // Values in Stock Currency (Major Unit)
  costBasisStockCurrency: number;
  costOfSoldStockCurrency: number;
  proceedsStockCurrency: number;
  dividendsStockCurrency: number;

  // Historical Accumulators
  costBasisUSD: number;
  costOfSoldUSD: number;
  proceedsUSD: number;
  dividendsUSD: number;
  realizedGainUSD: number;
  costBasisILS: number;
  costOfSoldILS: number;
  proceedsILS: number;
  dividendsILS: number;
  realizedGainILS: number;

  // Display fields
  avgCost: number; 
  mvVested: number; 
  mvUnvested: number; 
  totalMV: number; 
  realizedGain: number; 
  realizedGainPct: number; 
  realizedGainAfterTax: number; 
  dividends: number; 
  unrealizedGain: number; 
  unrealizedGainPct: number; 
  totalGain: number; 
  totalGainPct: number; 
  valueAfterTax: number; 
  dayChangeVal: number; 

  sector: string;
  dayChangePct: number;
  perf1w: number;
  perf1m: number;
  perf3m: number;
  perfYtd: number;
  perf1y: number;
  perf3y: number;
  perf5y: number;
}

export interface Portfolio {
  id: string;
  name: string;
  cgt: number; 
  incTax: number; 
  mgmtVal: number;
  mgmtType: 'percentage' | 'fixed';
  mgmtFreq: 'monthly' | 'quarterly' | 'yearly';
  commRate: number;
  commMin: number;
  commMax: number;
  currency: Currency;
  divPolicy: 'cash_taxed' | 'accumulate_tax_free' | 'hybrid_rsu';
  divCommRate: number;
  taxPolicy: TaxPolicy;
  holdings?: Holding[];
}

export type TaxPolicy = 'TAX_FREE' | 'REAL_GAIN' | 'NOMINAL_GAIN' | 'PENSION';

export interface Holding {
  portfolioId: string;
  ticker: string;
  exchange: Exchange;
  qty: number;
  price?: number;
  currency?: Currency;
  totalValue?: number;
  name?: string;
  nameHe?: string;
  sector?: string;
  changePct1d?: number;
  changeDate1d?: number;
  changePctRecent?: number;
  changeDateRecent?: number;
  recentChangeDays?: number;
  changePct1m?: number;
  changeDate1m?: number;
  changePct3m?: number;
  changeDate3m?: number;
  changePctYtd?: number;
  changeDateYtd?: number;
  changePct1y?: number;
  changeDate1y?: number;
  changePct3y?: number;
  changeDate3y?: number;
  changePct5y?: number;
  changeDate5y?: number;
  changePct10y?: number;
  changeDate10y?: number;
  numericId: number | null;
}

export interface Transaction {
  date: string;
  portfolioId: string;
  ticker: string;
  exchange?: Exchange;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE';
  originalQty: number;
  originalPrice: number;
  qty?: number;
  price?: number;
  grossValue?: number;
  currency?: Currency;
  vestDate?: string;
  comment?: string;
  commission?: number;
  tax?: number;
  source?: string;
  creationDate?: string;
  origOpenPriceAtCreationDate?: number;
  splitAdjOpenPrice?: number;
  splitRatio?: number;
  splitAdjustedPrice?: number;
  splitAdjustedQty?: number;
  originalPriceUSD?: number;
  originalPriceILA?: number;
  numericId?: number;
  valueAfterTax?: number;
  nominalValue?: number;
}

// Templates for quick setup
export const PORTFOLIO_TEMPLATES: Record<string, Partial<Portfolio>> = {
  'std_il': { 
    cgt: 0.25, 
    incTax: 0,
    commRate: 0.001, // 0.1%
    commMin: 5, // 5 ILS min
    commMax: 0,
    currency: Currency.ILS, 
    divPolicy: 'cash_taxed',
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'REAL_GAIN'
  },
  'std_us': { 
    cgt: 0.25, 
    incTax: 0,
    commRate: 0, // Usually 0 commission
    commMin: 0, 
    commMax: 0,
    currency: Currency.USD, 
    divPolicy: 'cash_taxed',
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'NOMINAL_GAIN'
  },
  'rsu': { 
    cgt: 0.25, 
    incTax: 0.50, // 50% marginal
    commRate: 0, 
    commMin: 0,
    currency: Currency.USD, 
    divPolicy: 'hybrid_rsu',
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'NOMINAL_GAIN'
  },
  'hishtalmut': { 
    cgt: 0, 
    incTax: 0,
    commRate: 0, 
    commMin: 0,
    currency: Currency.ILS, 
    divPolicy: 'accumulate_tax_free', 
    mgmtVal: 0.007, // 0.7% from accumulation
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'TAX_FREE'
  },
  'pension': { 
    cgt: 0.33, 
    incTax: 0.33,
    commRate: 0, 
    commMin: 0,
    currency: Currency.ILS, 
    divPolicy: 'accumulate_tax_free', 
    mgmtVal: 0.002, // 0.2% from accumulation
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'PENSION'
  }
};
