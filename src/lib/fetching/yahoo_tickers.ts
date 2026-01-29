// src/lib/fetching/yahoo_tickers.ts
import { Exchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import type { TickerProfile } from '../types/ticker';

/**
 * Predefined set of popular Yahoo Finance tickers (mostly Futures/Commodities)
 * that should be discoverable in search.
 */
const PREDEFINED_YAHOO_TICKERS: { ticker: string; name: string; sector: string; type: InstrumentType }[] = [
  { ticker: 'GC=F', name: 'Gold Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'MGC=F', name: 'Micro Gold Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'SI=F', name: 'Silver Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'SIL=F', name: 'Micro Silver Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'PL=F', name: 'Platinum Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'PA=F', name: 'Palladium Futures', sector: 'Precious Metals', type: InstrumentType.COMMODITY },
  { ticker: 'HG=F', name: 'Copper Futures', sector: 'Industrial Metals', type: InstrumentType.COMMODITY },
  { ticker: 'CL=F', name: 'Crude Oil Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'BZ=F', name: 'Brent Crude Oil Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'NG=F', name: 'Natural Gas Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'HO=F', name: 'Heating Oil Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'RB=F', name: 'RBOB Gasoline Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'ZC=F', name: 'Corn Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'ZW=F', name: 'Wheat Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'KE=F', name: 'KC HRW Wheat Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'ZS=F', name: 'Soybean Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'ZL=F', name: 'Soybean Oil Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'ZM=F', name: 'Soybean Meal Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'ZO=F', name: 'Oat Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'KC=F', name: 'Coffee Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'CC=F', name: 'Cocoa Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'SB=F', name: 'Sugar Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'CT=F', name: 'Cotton Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'OJ=F', name: 'Orange Juice Futures', sector: 'Agriculture', type: InstrumentType.COMMODITY },
  { ticker: 'HE=F', name: 'Lean Hog Futures', sector: 'Livestock', type: InstrumentType.COMMODITY },
  { ticker: 'LE=F', name: 'Live Cattle Futures', sector: 'Livestock', type: InstrumentType.COMMODITY },
  { ticker: 'GF=F', name: 'Feeder Cattle Futures', sector: 'Livestock', type: InstrumentType.COMMODITY },
  { ticker: 'LBS=F', name: 'Lumber Futures', sector: 'Materials', type: InstrumentType.COMMODITY },
  { ticker: 'B0=F', name: 'Propane Futures', sector: 'Energy', type: InstrumentType.COMMODITY },
  { ticker: 'ES=F', name: 'E-Mini S&P 500 Futures', sector: 'Equity Indices', type: InstrumentType.FUTURE },
  { ticker: 'NQ=F', name: 'Nasdaq 100 Futures', sector: 'Equity Indices', type: InstrumentType.FUTURE },
  { ticker: 'YM=F', name: 'Mini Dow Jones Futures', sector: 'Equity Indices', type: InstrumentType.FUTURE },
  { ticker: 'RTY=F', name: 'E-mini Russell 2000 Futures', sector: 'Equity Indices', type: InstrumentType.FUTURE },
  { ticker: 'ZN=F', name: '10-Year T-Note Futures', sector: 'USA Bonds', type: InstrumentType.FUTURE },
  { ticker: 'ZF=F', name: '5-Year T-Note Futures', sector: 'USA Bonds', type: InstrumentType.FUTURE },
  { ticker: 'ZT=F', name: '2-Year T-Note Futures', sector: 'USA Bonds', type: InstrumentType.FUTURE },
  { ticker: 'ZB=F', name: 'U.S. Treasury Bond Futures', sector: 'USA Bonds', type: InstrumentType.FUTURE },
  { ticker: 'ZR=F', name: 'USD/ZAR Futures', sector: 'Forex', type: InstrumentType.FUTURE },
];

export function getPredefinedYahooTickers(): TickerProfile[] {
  return PREDEFINED_YAHOO_TICKERS.map(t => ({
    symbol: t.ticker,
    exchange: Exchange.NYSE, // Default to NYSE for US-based Yahoo tickers
    securityId: undefined,
    name: t.name,
    nameHe: undefined,
    type: new InstrumentClassification(t.type),
    sector: t.sector
  }));
}
