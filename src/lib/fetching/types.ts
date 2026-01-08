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
}

export interface HistoricalDataPoint {
  date: number; // Unix timestamp
  close: number;
}

export interface TaseTicker {
  symbol: string;
  name_he: string;
  name_en: string;
  instrumentId: string;
  type: string;
}

// Configuration for TASE ticker types
export interface TaseTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}
