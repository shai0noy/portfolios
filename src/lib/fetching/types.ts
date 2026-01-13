// src/lib/fetching/types.ts

export interface TickerData {
  price: number;
  openPrice?: number;
  name?: string;
  name_he?: string; // Hebrew name
  currency?: string;
  exchange?: string;
  changePct?: number; // Daily change percentage
  priceUnit?: string;
  timestamp?: number; // Last update time
  sector?: string;
  changePctYtd?: number;
  changePct1w?: number;
  changePct1m?: number;
  changePct3m?: number;
  changePct1y?: number;
  changePct3y?: number;
  changePct5y?: number;
  changePct10y?: number;
  ticker: string;
  numericId : number|null;
}

export interface HistoricalDataPoint {
  date: number; // Unix timestamp
  close: number;
}

export interface TaseSecurity {
  tradeDate: string;
  securityId: number;
  securityFullTypeCode: string;
  isin: string;
  corporateId: string;
  issuerId: number;
  securityIsIncludedInContinuousIndices: number[];
  securityName: string;
  symbol: string;
  companySuperSector: string;
  companySector: string;
  companySubSector: string;
  companyName: string;
}

export interface TaseTicker {
  // Fields from TASE API
  securityId: number;
  name_en: string;
  symbol: string;
  companyName: string;
  companySuperSector: string;
  companySector: string;
  companySubSector: string;

  // Fields from Globes
  globesInstrumentId: string;
  type: string; // 'stock', 'etf', etc.
  name_he: string; // Globes has hebrew and english names
  taseType: string; // TASE type string
}

// Configuration for TASE ticker types
export interface TaseTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}
