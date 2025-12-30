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
}

export interface Transaction {
  date: string;
  portfolioId: string;
  ticker: string;
  exchange?: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE';
  qty: number;
  price: number;
  grossValue: number; // qty * price
  vestDate?: string;
  comment?: string;
}

// Templates for quick setup
export const PORTFOLIO_TEMPLATES: Record<string, Partial<Portfolio>> = {
  'std_il': { cgt: 0.25, commRate: 0.001, commMin: 2.5, currency: 'ILS', divPolicy: 'cash_taxed' },
  'std_us': { cgt: 0.25, commMin: 1.5, currency: 'USD', divPolicy: 'cash_taxed' },
  'rsu': { cgt: 0.25, incTax: 0.47, currency: 'USD', divPolicy: 'hybrid_rsu' },
  'pension': { cgt: 0, currency: 'ILS', divPolicy: 'accumulate_tax_free', mgmtVal: 0.005, mgmtType: 'percentage' }
};