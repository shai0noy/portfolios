// src/lib/fetching/types.ts

export interface TickerData {
  price: number;
  openPrice?: number;
  name?: string;
  name_he?: string; // Hebrew name
  currency?: string;
  exchange?: string;
  changePct?: number; // Daily change percentage
  changeDate1d?: number;
  timestamp?: number; // Last update time
  sector?: string;
  changePctYtd?: number;
  changeDateYtd?: number;
  changePctRecent?: number;
  changeDateRecent?: number;
  recentChangeDays?: number;
  changePct1m?: number;
  changeDate1m?: number;
  changePct3m?: number;
  changeDate3m?: number;
  changePct1y?: number;
  changeDate1y?: number;
  changePct3y?: number;
  changeDate3y?: number;
  changePct5y?: number;
  changeDate5y?: number;
  changePct10y?: number;
  changeDate10y?: number;
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
  exchange?: string;
}

// Configuration for ticker types
export interface SecurityTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}
