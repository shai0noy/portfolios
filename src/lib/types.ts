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
  holdings?: Holding[];
}

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
  qty: number;
  price: number;
  grossValue: number;
  currency?: string;
  vestDate?: string;
  comment?: string;
  commission?: number;
  tax?: number;
}

export type PriceUnit = 'base' | 'agorot' | 'cents';

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
    divCommRate: 0
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
    divCommRate: 0
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
    divCommRate: 0
  },
  'pension': { 
    cgt: 0, 
    incTax: 0,
    commRate: 0, 
    commMin: 0,
    currency: 'ILS', 
    divPolicy: 'accumulate_tax_free', 
    mgmtVal: 0.007, // 0.7% from accumulation
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    divCommRate: 0
  }
};
