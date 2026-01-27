// src/lib/fetching/commodities.ts
import { Exchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import type { TickerProfile } from '../types/ticker';

const COMMODITIES: { symbol: string, name: string, nameHe: string }[] = [
  { symbol: 'GC=F', name: 'Gold', nameHe: 'זהב' },
  { symbol: 'SI=F', name: 'Silver', nameHe: 'כסף' },
  { symbol: 'CL=F', name: 'Crude Oil', nameHe: 'נפט גולמי' },
  { symbol: 'NG=F', name: 'Natural Gas', nameHe: 'גז טבעי' },
  { symbol: 'ZC=F', name: 'Corn', nameHe: 'תירס' },
  { symbol: 'ZW=F', name: 'Wheat', nameHe: 'חיטה' },
  { symbol: 'ZS=F', name: 'Soybeans', nameHe: 'פולי סויה' },
  { symbol: 'HG=F', name: 'Copper', nameHe: 'נחושת' },
  { symbol: 'PL=F', name: 'Platinum', nameHe: 'פלטינה' },
  { symbol: 'PA=F', name: 'Palladium', nameHe: 'פלדיום' },
];

export function getCommodityTickers(): TickerProfile[] {
  return COMMODITIES.map(c => ({
    symbol: c.symbol,
    exchange: Exchange.CBS,
    securityId: c.symbol,
    name: c.name,
    nameHe: c.nameHe,
    type: new InstrumentClassification(InstrumentType.COMMODITY),
  }));
}
