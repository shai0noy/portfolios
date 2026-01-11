// src/lib/types.ts
export interface Portfolio {
  id: string;
  name: string;
  cgt: number; // Cap Gains Tax (e.g. 0.25)
  incTax: number; // Income Tax (e.g. 0.50)
  mgmtVal: number;
  mgmtType: 'percentage' | 'fixed';
  mgmtFreq: 'monthly' | 'quarterly' | 'yearly';
  commRate: number;
  commMin: number;
  commMax: number;
  currency: 'USD' | 'ILS';
  divPolicy: 'cash_taxed' | 'accumulate_tax_free' | 'hybrid_rsu';
  divCommRate: number;
  taxPolicy: TaxPolicy;
  holdings?: Holding[];
}

export type TaxPolicy = 'TAX_FREE' | 'REAL_GAIN' | 'NOMINAL_GAIN' | 'PENSION';

export interface Holding {
  portfolioId: string;
  ticker: string;
  exchange?: string;
  qty: number;
  price?: number;
  currency?: string;
  totalValue?: number;
  name?: string;
  name_he?: string;
  sector?: string;
  priceUnit?: PriceUnit;
  changePct?: number;
  changePct1w?: number;
  changePct1m?: number;
  changePct3m?: number;
  changePctYtd?: number;
  changePct1y?: number;
  changePct3y?: number;
  changePct5y?: number;
  changePct10y?: number;
}

export interface Transaction {
  date: string;
  portfolioId: string;
  ticker: string;
  exchange?: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE';
  Original_Qty: number;
  Original_Price: number;
  grossValue?: number;
  currency?: string;
  vestDate?: string;
  comment?: string;
  commission?: number;
  tax?: number;
  Source?: string;
  Creation_Date?: string;
  Orig_Open_Price_At_Creation_Date?: number;
  Split_Adj_Open_Price?: number;
  Split_Ratio?: number;
  Split_Adjusted_Price?: number;
  Split_Adjusted_Qty?: number;
}

export type PriceUnit = 'base' | 'agorot' | 'cents';

export type Currency = 'USD' | 'ILS' | 'EUR' | string;

export interface ExchangeRates {
  current: Record<string, number>;
  [key: string]: Record<string, number> | number; // Allow historical dates (e.g. 'ago1w') or other structures if necessary
}

export interface DashboardHolding {
  key: string;
  portfolioId: string;
  portfolioName: string;
  portfolioCurrency: string;
  ticker: string;
  exchange: string;
  displayName: string;
  name_he?: string;
  qtyVested: number;
  qtyUnvested: number;
  totalQty: number;
  currentPrice: number; // In stock currency
  stockCurrency: string;
  priceUnit?: PriceUnit;

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

  // Values in Stock Currency
  costBasisStockCurrency: number;
  costOfSoldStockCurrency: number;
  proceedsStockCurrency: number;
  dividendsStockCurrency: number;

  // Display fields (can be derived in components, but often pre-calculated)
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

// Templates for quick setup
export const PORTFOLIO_TEMPLATES: Record<string, Partial<Portfolio>> = {
  'std_il': { 
    cgt: 0.25, 
    incTax: 0,
    commRate: 0.001, // 0.1%
    commMin: 5, // 5 ILS min
    commMax: 0,
    currency: 'ILS', 
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
    currency: 'USD', 
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
    currency: 'USD', 
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
    currency: 'ILS', 
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
    currency: 'ILS', 
    divPolicy: 'accumulate_tax_free', 
    mgmtVal: 0.002, // 0.2% from accumulation
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0,
    taxPolicy: 'PENSION'
  }
};