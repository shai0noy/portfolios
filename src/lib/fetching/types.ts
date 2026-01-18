// src/lib/fetching/types.ts
import { Exchange } from '../types';

export interface TickerData {
  price: number;
  openPrice?: number;
  name?: string;
  nameHe?: string; // Hebrew name
  currency?: string;
  exchange: Exchange;
  changePct?: number; // Daily change percentage
  changeDate1d?: number; // Timestamp of the previous close used for daily change
  timestamp?: number; // Last update time
  sector?: string;
  changePctYtd?: number;
  changeDateYtd?: number; // Timestamp of the start of the year price
  changePctRecent?: number;
  changeDateRecent?: number; // Timestamp of the start of the recent period
  recentChangeDays?: number; // Number of days in the recent period (e.g. 7)
  changePct1m?: number;
  changeDate1m?: number; // Timestamp of the price 1 month ago
  changePct3m?: number;
  changeDate3m?: number; // Timestamp of the price 3 months ago
  changePct1y?: number;
  changeDate1y?: number; // Timestamp of the price 1 year ago
  changePct3y?: number;
  changeDate3y?: number; // Timestamp of the price 3 years ago
  changePct5y?: number;
  changeDate5y?: number; // Timestamp of the price 5 years ago
  changePct10y?: number;
  changeDate10y?: number; // Timestamp of the price 10 years ago
  ticker: string;
  numericId : number|null; // Numeric ID for TASE
  source?: string;
}

export interface HistoricalDataPoint {
  date: number; // Unix timestamp
  close: number;
}

export interface TaseSecurity {
  tradeDate: string;
  securityId: number; // TASE security ID
  securityFullTypeCode: string;
  isin: string; // Israel ISIN code
  corporateId: string;
  issuerId: number;
  securityIsIncludedInContinuousIndices: number[];
  securityName: string;
  securityNameHe?: string;
  symbol: string;
  companySuperSector: string;
  companySector: string;
  companySubSector: string;
  companyName: string;
}

export interface TaseInfo {
  securityId: number;
  companyName: string;
  companySuperSector: string;
  companySector: string;
  companySubSector: string;
  globesInstrumentId: string;
  taseType: string;
}

export interface GemelInfo {
  fundId: number;
  managingCompany: string;
  fundSubType: string;
  specialization: string;
  subSpecialization: string;
  managementFee?: number;
  depositFee?: number;
}

// Merge this with TickerData, TaseSecurity
export interface TickerListItem {
  symbol: string;
  exchange: Exchange;
  nameEn: string;
  nameHe?: string;
  type: string; // 'stock', 'etf', 'gemel_fund' etc.
  
  taseInfo?: TaseInfo;
  gemelInfo?: GemelInfo;
}

// Configuration for ticker types
export interface SecurityTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}
