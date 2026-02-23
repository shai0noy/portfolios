import type { ExchangeMetadata } from './types/ticker';
import type { InstrumentClassification } from './types/instrument';
import { InstrumentType } from './types/instrument';
import type { ProvidentInfo } from './fetching/types';
import type { MultiCurrencyValue } from './data/multiCurrency';

export type { ExchangeMetadata, InstrumentClassification, ProvidentInfo };
export { InstrumentType };

export type PriceUnit = 'base' | 'agorot';

export type Currency = 'USD' | 'ILS' | 'EUR' | 'GBP' | 'ILA';
export const Currency = {
  USD: 'USD' as Currency,
  ILS: 'ILS' as Currency,
  EUR: 'EUR' as Currency,
  GBP: 'GBP' as Currency,
  ILA: 'ILA' as Currency,
};

export interface SimpleMoney {
  amount: number;
  currency: Currency;
}

/**
 * Represents a monetary value with explicit conversions.
 */
export interface Money extends SimpleMoney {
  rateToPortfolio?: number; // Historical rate at transaction time
  // Historical values in base currencies (computed at transaction time)
  valUSD?: number;
  valILS?: number;
}


const EXCHANGES = [
  'NASDAQ', 'NYSE', 'TASE', 'LSE', 'FWB',
  'EURONEXT', 'JPX', 'HKEX', 'TSX', 'ASX', 'GEMEL', 'PENSION',
  'FOREX', 'CBS',
] as const;

export type Exchange = typeof EXCHANGES[number];

export const Exchange = EXCHANGES.reduce((acc, ex) => {
  acc[ex] = ex;
  return acc;
}, {} as any) as { [K in Exchange]: K };

interface ExchangeSettings {
  aliases: string[];
  googleFinanceCode: string; // e.g., 'TLV' for TASE - This is the code written to Google sheets, even if the exchange is not supported
  googleSheetsCode: string; // e.g., 'TLV' for TASE, CURRENCY for FOREX
  yahooFinanceSuffix: string;
}

export const EXCHANGE_SETTINGS: Record<Exchange, ExchangeSettings> = {
  [Exchange.NASDAQ]: {
    aliases: ['XNAS', 'NMS', 'NGS', 'NCM', 'NIM', 'BTS', 'BATS'],
    googleFinanceCode: 'NASDAQ',
    googleSheetsCode: 'NASDAQ',
    yahooFinanceSuffix: ''
  },
  [Exchange.NYSE]: {
    aliases: ['XNYS', 'ARCA', 'WCB', 'ASE', 'AMEX', 'NYQ'],
    googleFinanceCode: 'NYSE',
    googleSheetsCode: 'NYSE',
    yahooFinanceSuffix: ''
  },
  [Exchange.TASE]: {
    aliases: ['XTAE', 'TLV', 'TA'],
    googleFinanceCode: 'TLV',
    googleSheetsCode: 'TLV',
    yahooFinanceSuffix: '.TA'
  },
  [Exchange.LSE]: {
    aliases: ['XLON', 'LONDON'],
    googleFinanceCode: 'LON',
    googleSheetsCode: 'LON',
    yahooFinanceSuffix: '.L'
  },
  [Exchange.FWB]: {
    aliases: ['XFRA', 'FRANKFURT', 'XETRA'],
    googleFinanceCode: 'FRA',
    googleSheetsCode: 'FRA',
    yahooFinanceSuffix: '.F'
  },
  [Exchange.EURONEXT]: {
    aliases: ['XPAR', 'XAMS', 'XBRU', 'XLIS', 'XDUB'],
    googleFinanceCode: 'EPA',
    googleSheetsCode: 'EPA',
    yahooFinanceSuffix: '.PA'
  },
  [Exchange.JPX]: {
    aliases: ['XTKS'],
    googleFinanceCode: 'TYO',
    googleSheetsCode: 'TYO',
    yahooFinanceSuffix: '.T'
  },
  [Exchange.HKEX]: {
    aliases: ['XHKG'],
    googleFinanceCode: 'HKG',
    googleSheetsCode: 'HKG',
    yahooFinanceSuffix: '.HK'
  },
  [Exchange.TSX]: {
    aliases: ['XTSE'],
    googleFinanceCode: 'TSE',
    googleSheetsCode: 'TSE',
    yahooFinanceSuffix: '.TO'
  },
  [Exchange.ASX]: {
    aliases: ['XASX'],
    googleFinanceCode: 'ASX',
    googleSheetsCode: 'ASX',
    yahooFinanceSuffix: '.AX'
  },
  [Exchange.GEMEL]: {
    aliases: [],
    googleFinanceCode: '',
    googleSheetsCode: 'GEMEL',
    yahooFinanceSuffix: ''
  },
  [Exchange.PENSION]: {
    aliases: [],
    googleFinanceCode: '',
    googleSheetsCode: 'PENSION',
    yahooFinanceSuffix: ''
  },
  [Exchange.FOREX]: {
    aliases: ['FX', 'CURRENCY', 'CRYPTO', 'CC', 'CCC'],
    googleFinanceCode: '',
    googleSheetsCode: 'CURRENCY',
    yahooFinanceSuffix: '=X'
  },
  [Exchange.CBS]: {
    aliases: ['CPI', 'MADAD'],
    googleFinanceCode: '',
    googleSheetsCode: 'CBS',
    yahooFinanceSuffix: ''
  },
};

export function isUSExchange(exchange: Exchange | string): boolean {
  if (!exchange) return false;
  const ex = exchange.toString().toUpperCase();
  return ex === 'NASDAQ' || ex === 'NYSE';
}


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
  if ((EXCHANGES as readonly string[]).includes(normalized)) {
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
 * Converts a canonical Exchange type to its Google Sheets finance exchange code.
 * @param exchange The canonical exchange.
 * @returns The Google Finance exchange code (e.g., 'TLV' for TASE) or the original if no mapping exists.
 */
export function toGoogleSheetsExchangeCode(exchange: Exchange): string {
  return EXCHANGE_SETTINGS[exchange]?.googleSheetsCode || exchange;
}

/**
 * Converts a canonical Exchange type to its Google Finance exchange code.
 * @param exchange The canonical exchange.
 * @returns The Google Finance exchange code (e.g., 'TLV' for TASE) or the original if no mapping exists.
 */
export function toGoogleFinanceExchangeCode(exchange: Exchange): string {
  return EXCHANGE_SETTINGS[exchange]?.googleFinanceCode || exchange;
}

export interface ExchangeRates {
  current: Record<string, number>;
  history?: Record<string, Record<string, number>>;
  [key: string]: Record<string, number> | number | Record<string, Record<string, number>> | undefined;
}

export interface DashboardHolding {
  id: string; // Added to match Holding
  key: string;
  portfolioId: string;
  portfolioName: string;
  portfolioCurrency: Currency;
  ticker: string;
  exchange: Exchange;
  displayName: string;
  longName?: string;
  nameHe?: string;
  qtyVested: number;
  qtyUnvested: number;
  qtyTotal: number;
  currentPrice: number; // ALWAYS in Major Unit
  stockCurrency: Currency;

  // Money Fields (Matching Holding where possible)
  costBasisVested: Money; // Portfolio Currency
  costOfSoldTotal: Money;
  proceedsTotal: Money;
  dividendsTotal: Money; // Net/Gross? Net usually.
  unrealizedGain: Money; // Gross, PC
  realizedGainNet: Money; // Net, PC
  feesTotal: Money;

  // Market Value in Stock Currency (from Holding)
  marketValueVested: Money;
  marketValueUnvested: Money;

  // Tax
  realizedTax: number;
  unrealizedTaxLiabilityILS: number;
  unrealizedTaxableGainILS: number;

  // Display fields (Calculated in dashboard.ts)
  display: DashboardHoldingDisplay;

  sector?: string;
  dayChangePct: number;
  perf1w: number;
  perf1m: number;
  perf3m: number;
  perfYtd: number;
  perf1y: number;
  perf3y: number;
  perf5y: number;
  perfAll: number;
  type?: InstrumentClassification;
  generateGainForPeriod?: (
    startDate: Date,
    historyProvider: (ticker: string) => any,
    rates: ExchangeRates,
    initialRates?: Record<string, number>
  ) => {
    gain: MultiCurrencyValue,
    initialValue: MultiCurrencyValue,
    finalValue: MultiCurrencyValue,
    gainPct: number
  };
}

export interface DashboardHoldingDisplay {
  marketValue: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  realizedGain: number;
  realizedGainGross: number; // Pre-Fee, Pre-Tax
  realizedGainNet: number;   // Post-Fee, Post-Tax (if applicable)
  realizedGainPct: number;
  realizedGainAfterTax: number;
  totalGain: number;
  totalGainPct: number;
  valueAfterTax: number;
  dayChangeVal: number;
  dayChangePct: number;
  costBasis: number;
  costOfSold: number;
  proceeds: number;
  dividends: number;
  fees: number;
  dividendYield1y?: number;
  currentPrice: number;
  avgCost: number;
  weightInPortfolio: number;
  weightInGlobal: number;
  unvestedValue: number;
  adjustedCost?: number;
  realizedTax: number;
  unrealizedTax: number;
}

export interface DashboardSummaryData {
  aum: number;
  totalUnrealized: number;
  totalUnrealizedGainPct: number;
  totalRealized: number;
  totalRealizedGainPct: number;
  totalCostOfSold: number;
  totalDividends: number;
  totalReturn: number;
  realizedGainAfterTax: number;
  valueAfterTax: number;
  totalDayChange: number;
  totalDayChangePct: number;
  totalDayChangeIsIncomplete: boolean;
  totalTaxPaid: number; // Added

  // Performance
  perf1d: number;
  perf1w: number;
  perf1w_incomplete: boolean;
  perf1m: number;
  perf1m_incomplete: boolean;
  perf3m: number;
  perf3m_incomplete: boolean;
  perf1y: number;
  perf1y_incomplete: boolean;
  perf3y: number;
  perf3y_incomplete: boolean;
  perf5y: number;
  perf5y_incomplete: boolean;
  perfAll: number;
  perfAll_incomplete: boolean;
  perfYtd: number;
  perfYtd_incomplete: boolean;
  divYield: number;
  totalUnvestedValue: number;
  totalUnvestedGain: number;
  totalUnvestedGainPct: number;
}

export type CommissionExemption = 'none' | 'buys' | 'sells' | 'all';

export interface TaxHistoryEntry {
  startDate: string; // YYYY-MM-DD
  cgt: number;
  incTax: number;
}

export interface FeeHistoryEntry {
  startDate: string;
  mgmtVal: number;
  mgmtType: 'percentage' | 'fixed';
  mgmtFreq: 'monthly' | 'quarterly' | 'yearly';
  divCommRate: number;
  commRate?: number;
  commMin?: number;
  commMax?: number;
}

export interface Portfolio {
  id: string;
  name: string;
  currency: Currency;

  // Tax
  cgt: number;
  incTax?: number; // For RSUs: Marginal Income Tax Rate on Vest
  taxPolicy?: TaxPolicy; // Default IL_REAL_GAIN
  taxOnBase?: boolean;

  // Fees
  mgmtVal?: number;
  mgmtType?: 'percentage' | 'fixed';
  mgmtFreq?: 'monthly' | 'quarterly' | 'yearly';

  commRate: number; // Percentage (0.001 = 0.1%)
  commMin: number;
  commMax?: number; // Optional cap
  divCommRate: number; // Dividend Commission Rate
  commExemption?: CommissionExemption; // New Field

  // Dividend Policy (RSU specific mainly, but could be general)
  divPolicy?: 'cash_taxed' | 'accumulate_tax_free' | 'hybrid_rsu';

  // History
  taxHistory?: TaxHistoryEntry[];
  feeHistory?: FeeHistoryEntry[];

  holdings?: SheetHolding[];
}

export type TaxPolicy = 'TAX_FREE' | 'IL_REAL_GAIN' | 'NOMINAL_GAIN' | 'PENSION' | 'RSU_ACCOUNT';

export interface SheetHolding {
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
  changeDate1d?: Date;
  changePctRecent?: number;
  changeDateRecent?: Date;
  recentChangeDays?: number;
  changePct1m?: number;
  changeDate1m?: Date;
  changePct3m?: number;
  changeDate3m?: Date;
  changePctYtd?: number;
  changeDateYtd?: Date;
  changePct1y?: number;
  changeDate1y?: Date;
  changePct3y?: number;
  changeDate3y?: Date;
  changePct5y?: number;
  changeDate5y?: Date;
  changePctMax?: number;
  changeDateMax?: Date;
  changePct10y?: number;
  changeDate10y?: Date;
  numericId: number | null;
  openPrice?: number;
  volume?: number;
  subSector?: string;
  taseType?: string;
  globesTypeHe?: string;
  providentInfo?: ProvidentInfo;
  meta?: ExchangeMetadata;
  type?: InstrumentClassification;
}

export interface Transaction {
  date: string;
  portfolioId: string;
  ticker: string;
  exchange?: Exchange;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'ITEM_CLOSE' | 'BUY_TRANSFER' | 'SELL_TRANSFER';
  originalQty: number;
  originalPrice: number;
  qty?: number;
  price?: number;
  grossValue?: number;
  currency?: Currency;
  vestDate?: string;
  comment?: string;
  commission?: number;
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
  nominalValue?: number;
  rowIndex?: number;
}

export type TransactionType = Transaction['type'];

export function isBuy(type: TransactionType): boolean {
  return type === 'BUY' || type === 'BUY_TRANSFER';
}

export function isSell(type: TransactionType): boolean {
  return type === 'SELL' || type === 'SELL_TRANSFER';
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
    taxPolicy: 'IL_REAL_GAIN'
  },
  'us_broker_il_tax': {
    cgt: 0.25,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    commMax: 0,
    currency: Currency.USD,
    divPolicy: 'cash_taxed',
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'IL_REAL_GAIN'
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
    taxPolicy: 'RSU_ACCOUNT'
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
  'gemel': {
    cgt: 0,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: 'accumulate_tax_free',
    mgmtVal: 0.007, // 0.7% same as hishtalmut defaults?
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'MAX_TAX_FREE_OR_REAL_GAIN' as TaxPolicy // Wait, GEMEL is usually Tax Free up to limit, but here we treat as Tax Free? Or separate? 
    // Actually existing code uses 'TAX_FREE' for Hishtalmut. Gemel LeHashkaa is 'IL_REAL_GAIN' usually unless it's Gemel LeKitzva.
    // User requested: "IL Gemmel Fund" and "IL Hishtalmut fund".
    // Hishtalmut is tax free. Gemel (LeHashkaa) is Capital Gains (Real).
    // Gemel (LeKitzva/Pension) is different.
    // Let's assume Gemel LeHashkaa for now which is like a taxable account but managed?
    // User said "IL Gemmel Fund".
    // If it's Gemel LeHashkaa: 25% Real Gain.
    // If it's Gemel LeKitzva: Exempt if taken as annuity.
    // I will use IL_REAL_GAIN for Gemel (LeHashkaa) to be safe, or ask?
    // Re-reading user request: "IL pension fund, IL Gemmel Fund, IL Hishtalmut fund".
    // Usually "Gemel" implies "Gemel LeHashkaa" in this context if distinct from Pension/Hishtalmut.
    // BUT "Pension" is TAXED (Income Tax).
    // Let's try to map:
    // Hishtalmut -> Tax Free (usually)
    // Pension -> Taxed (Income)
    // Gemel -> ???
    // If I look at `taxPolicyNames` in PortfolioManager:
    // TAX_FREE = "Tax Free (Gemel/Hishtalmut)" 
    // So current code assumes Gemel IS Tax Free.
    // I will stick to TAX_FREE for Gemel template to match existing `taxPolicyNames`.
  },
  'gemel_tax_free': { // Internal name for consistency
    cgt: 0,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: 'accumulate_tax_free',
    mgmtVal: 0.007,
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