export interface Portfolio {
  id: string;
  name: string;
  cgt: number; // Cap Gains Tax (e.g. 0.25)
  incTax: number; // Income Tax (e.g. 0.50)
  mgmtVal: number;
  mgmtType: 'Percentage' | 'Fixed';
  mgmtFreq: 'Monthly' | 'Quarterly' | 'Yearly';
  commRate: number;
  commMin: number;
  commMax: number;
  currency: 'USD' | 'ILS';
  divPolicy: 'Cash (Taxed)' | 'Accumulate (Tax-Free)' | 'Accumulate Unvested / Cash Vested';
  divCommRate: number;
}

export interface Transaction {
  date: string;
  portfolioId: string;
  ticker: string;
  exchange?: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  qty: number;
  price: number;
  grossValue: number; // qty * price
  vestDate?: string;
  comment?: string;
}

// Templates for quick setup
export const PORTFOLIO_TEMPLATES: Record<string, Partial<Portfolio>> = {
  'std_il': { cgt: 0.25, commRate: 0.001, commMin: 2.5, currency: 'ILS', divPolicy: 'Cash (Taxed)' },
  'std_us': { cgt: 0.25, commMin: 1.5, currency: 'USD', divPolicy: 'Cash (Taxed)' },
  'rsu': { cgt: 0.25, incTax: 0.47, currency: 'USD', divPolicy: 'Accumulate Unvested / Cash Vested' },
  'pension': { cgt: 0, currency: 'ILS', divPolicy: 'Accumulate (Tax-Free)', mgmtVal: 0.005, mgmtType: 'Percentage' }
};