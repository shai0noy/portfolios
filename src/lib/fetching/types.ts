// src/lib/fetching/types.ts
import { Exchange } from '../types';

export interface Dividend {
  date: Date; // Unix timestamp (in milliseconds) of the dividend payout
  amount: number; // Dividend amount per share
}

export interface Split {
  date: Date; // Unix timestamp (in milliseconds) of the split
  numerator: number; // The "new" number of shares
  denominator: number; // The "old" number of shares (e.g., for a 2-for-1 split, numerator is 2, denominator is 1)
}

export interface TickerData {
  price: number;
  openPrice?: number;
  name?: string;
  nameHe?: string; // Hebrew name
  currency?: string;
  exchange: Exchange;
  changePct1d?: number; // Daily change percentage
  changeDate1d?: Date; // Timestamp of the previous close used for daily change
  timestamp?: Date; // Last update time
  sector?: string;
  subSector?: string;
  taseType?: string;
  changePctYtd?: number;
  changeDateYtd?: Date; // Timestamp of the start of the year price
  changePctRecent?: number;
  changeDateRecent?: Date; // Timestamp of the start of the recent period
  recentChangeDays?: number; // Number of days in the recent period (e.g. 7)
  changePct1m?: number;
  changeDate1m?: Date; // Timestamp of the price 1 month ago
  changePct3m?: number;
  changeDate3m?: Date; // Timestamp of the price 3 months ago
  changePct1y?: number;
  changeDate1y?: Date; // Timestamp of the price 1 year ago
  changePct3y?: number;
  changeDate3y?: Date; // Timestamp of the price 3 years ago
  changePct5y?: number;
  changeDate5y?: Date; // Timestamp of the price 5 years ago
  changePct10y?: number;
  changeDate10y?: Date; // Timestamp of the price 10 years ago
  changePctMax?: number;
  changeDateMax?: Date;
  ticker: string;
  numericId : number|null; // Numeric ID for TASE
  source?: string;
  globesInstrumentId?: string;
  historical?: { date: Date; price: number }[];
  dividends?: Dividend[];
  splits?: Split[];
  tradeTimeStatus?: string;
  globesTypeHe?: string;
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

export interface ProvidentInfo {
  fundId: number;
  managingCompany: string;
  fundType?: string; // SUG_KUPA / SUG_KRN
  specialization?: string; // HITMAHUT_RASHIT
  subSpecialization?: string; // HITMAHUT_MISHNIT
  managementFee?: number; // SHIUR_DMEI_NIHUL_AHARON
  depositFee?: number; // SHIUR_D_NIHUL_AHARON_HAFKADOT
}

// Merge this with TickerData, TaseSecurity
export interface TickerListItem {
  symbol: string;
  exchange: Exchange;
  nameEn: string;
  nameHe?: string;
  type: string; // 'stock', 'etf', 'gemel_fund', 'pension_fund' etc.
  
  taseInfo?: TaseInfo;
  providentInfo?: ProvidentInfo;
  globesRawSymbol?: string;
  globesTypeHe?: string;
}

// Configuration for ticker types
export interface SecurityTypeConfig {
  [key: string]: {
    enabled: boolean;
    displayName: string; // Used for UI, e.g., "Stocks", "ETFs"
  };
}
