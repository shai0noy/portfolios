// src/lib/types/ticker.ts
import { Exchange } from '../types';
import { InstrumentClassification } from './instrument';

/**
 * Core Identifier for any financial instrument.
 * Used for looking up data, routing, and cache keys.
 */
export interface TickerId {
  symbol: string;       // Human readable symbol (e.g. "AAPL", "1159250")
  exchange: Exchange;   // Canonical exchange enum
  securityId?: number;  // Numeric ID from Globes/TASE/Gemel
}

/**
 * Exchange-specific metadata bag.
 * Keeps the top-level Profile clean while preserving necessary details.
 */
export type ExchangeMetadata = 
  | { 
      type: 'TASE', 
      securityId: number, 
      isin?: string,
      superSector?: string,
      shortName?: string,
      exposureProfile?: string,
      underlyingAssets?: { name: string, weight: number }[]
    }
  | { type: 'GLOBES', instrumentId: string, underlyingAssets?: { name: string, weight: number }[] }
  | { type: 'PROVIDENT', fundId: number, managementFee?: number, depositFee?: number, managingCompany?: string, underlyingAssets?: { name: string, weight: number }[] }
  | { type: 'GENERIC', underlyingAssets?: { name: string, weight: number }[] };

/**
 * Static descriptive profile of a ticker.
 * This is what gets returned by Search/List APIs.
 */
export interface TickerProfile extends TickerId {
  name: string;         // Primary display name (English preferred)
  nameHe?: string;      // Localized name
  
  type: InstrumentClassification; // The unified type classification
  
  sector?: string;      // Unified sector/specialization
  subSector?: string;
  
  isFeeExempt?: boolean; // If true, exempt from commissions (e.g. Monetary Funds in IL)

  meta?: ExchangeMetadata; // Source-specific details
}

/**
 * Dynamic market data quote.
 * Extends Profile to ensure all identity fields are present.
 */
export interface TickerQuote extends TickerProfile {
  price: number;
  currency: string;     // ISO code (USD, ILS, ILA)
  lastUpdated: Date;
  
  changePct: number;    // Daily change (0.01 = 1%)
  changeVal?: number;
  
  openPrice?: number;
  volume?: number;      // In base currency units
  
  // Historical context (optional, may be loaded separately)
  history?: { date: Date; price: number }[];
  dividends?: { date: Date; amount: number }[];
  splits?: { date: Date; numerator: number; denominator: number }[];
  
  // Stats
  stats?: {
    peRatio?: number;
    marketCap?: number;
    yearLow?: number;
    yearHigh?: number;
    changeYtd?: number;
    change1y?: number;
    change3y?: number;
    change5y?: number;
  }
}