// src/lib/types/instrument.ts

/**
 * High-level grouping for instrument behavior, sorting, and UI filtering.
 */
export const InstrumentGroup = {
  STOCK: 'STOCK',           // Equities, REITs, Warrants
  ETF: 'ETF',               // Exchange Traded Funds/Notes (Sal, Mimka)
  MUTUAL_FUND: 'MUTUAL_FUND', // Mutual Funds (Neemanut) - "MTF"
  BOND: 'BOND',             // Government and Corporate Bonds, Bills
  SAVING: 'SAVING',         // Long-term savings (Gemel, Pension, Hishtalmut)
  DERIVATIVE: 'DERIVATIVE', // Options, Futures
  FOREX: 'FOREX',           // Currencies, Crypto
  INDEX: 'INDEX',           // Market Indices
  COMMODITY: 'COMMODITY',   // Commodities
  OTHER: 'OTHER'
} as const;

export type InstrumentGroup = typeof InstrumentGroup[keyof typeof InstrumentGroup];

/**
 * Canonical Instrument Types.
 * Hierarchically named where necessary, but concise for base types.
 */
export const InstrumentType = {
  // STOCK Group
  STOCK: 'STOCK',                       // Common Stock
  STOCK_REIT: 'STOCK_REIT',
  STOCK_WARRANT: 'STOCK_WARRANT',
  STOCK_PREF: 'STOCK_PREF',             // Preferred Stock (Manya Bechira)
  STOCK_PARTICIPATING_UNIT: 'STOCK_PARTICIPATING_UNIT', // Yechidot Hishtatfut

  // ETF Group
  ETF: 'ETF',

  // MUTUAL_FUND Group
  MUTUAL_FUND: 'MUTUAL_FUND',           // Keren Neemanut

  // SAVING Group
  SAVING_PROVIDENT: 'SAVING_PROVIDENT', // Kupat Gemel
  SAVING_PENSION: 'SAVING_PENSION',     // Keren Pensya
  SAVING_STUDY: 'SAVING_STUDY',         // Keren Hishtalmut

  // BOND Group
  BOND_GOV: 'BOND_GOV',                 // Government Bond
  BOND_CORP: 'BOND_CORP',               // Corporate Bond
  BOND_CONVERTIBLE: 'BOND_CONVERTIBLE', // Convertible Bond
  BOND_MAKAM: 'BOND_MAKAM',             // T-Bill (Makam)

  // DERIVATIVE Group
  OPTION_TASE: 'OPTION_TASE',           // Equity Option
  OPTION_MAOF: 'OPTION_MAOF',           // Index Option
  OPTION: 'OPTION',                     // Generic/Other options
  FUTURE: 'FUTURE',

  // FOREX Group
  CURRENCY: 'CURRENCY',
  CRYPTO: 'CRYPTO',

  // INDEX Group
  INDEX: 'INDEX',
  CPI: 'CPI',
  COMMODITY: 'COMMODITY',

  UNKNOWN: 'UNKNOWN'
} as const;

export type InstrumentType = typeof InstrumentType[keyof typeof InstrumentType];

/**
 * Metadata defining the properties of a canonical instrument type.
 */
export interface InstrumentMetadata {
  group: InstrumentGroup;  // The high-level group
  nameEn: string;          // Default English display name
  nameHe: string;          // Default Hebrew display name
  globesTypes?: string[];  // Raw Globes type keys associated with this type (one-to-many)
}

/**
 * Registry of metadata for each canonical type.
 * Includes mapping to legacy Globes type strings for fetching.
 */
export const INSTRUMENT_METADATA: Record<InstrumentType, InstrumentMetadata> = {
  // Stock
  [InstrumentType.STOCK]: { group: InstrumentGroup.STOCK, nameEn: 'Stock', nameHe: 'מניה', globesTypes: ['stock'] },
  [InstrumentType.STOCK_REIT]: { group: InstrumentGroup.STOCK, nameEn: 'REIT', nameHe: 'קרן ריט' },
  [InstrumentType.STOCK_WARRANT]: { group: InstrumentGroup.STOCK, nameEn: 'Warrant', nameHe: 'כתב אופציה' },
  [InstrumentType.STOCK_PREF]: { group: InstrumentGroup.STOCK, nameEn: 'Preferred Stock', nameHe: 'מניית בכורה' },
  [InstrumentType.STOCK_PARTICIPATING_UNIT]: { group: InstrumentGroup.STOCK, nameEn: 'Participating Unit', nameHe: 'יחידת השתתפות' },
  
  // ETF
  [InstrumentType.ETF]: { group: InstrumentGroup.ETF, nameEn: 'ETF', nameHe: 'תעודת סל', globesTypes: ['etf'] },
  
  // Mutual Fund
  [InstrumentType.MUTUAL_FUND]: { group: InstrumentGroup.MUTUAL_FUND, nameEn: 'Mutual Fund', nameHe: 'קרן נאמנות', globesTypes: ['fund'] },
  
  // Saving
  [InstrumentType.SAVING_PROVIDENT]: { group: InstrumentGroup.SAVING, nameEn: 'Provident Fund', nameHe: 'קופת גמל', globesTypes: ['gemel_fund'] },
  [InstrumentType.SAVING_PENSION]: { group: InstrumentGroup.SAVING, nameEn: 'Pension Fund', nameHe: 'קרן פנסיה', globesTypes: ['pension_fund'] },
  [InstrumentType.SAVING_STUDY]: { group: InstrumentGroup.SAVING, nameEn: 'Study Fund', nameHe: 'קרן השתלמות' },
  
  // Bond
  // Note: Some of these keys (gov_generic, bond_ta) may be rejected by the API if not supported for *listing*,
  // but are valid for mapping if encountered.
  [InstrumentType.BOND_GOV]: { group: InstrumentGroup.BOND, nameEn: 'Gov Bond', nameHe: 'אג"ח מדינה', globesTypes: ['gov_generic'] },
  [InstrumentType.BOND_CORP]: { group: InstrumentGroup.BOND, nameEn: 'Corporate Bond', nameHe: 'אג"ח חברות', globesTypes: ['bond_ta'] },
  [InstrumentType.BOND_CONVERTIBLE]: { group: InstrumentGroup.BOND, nameEn: 'Convertible Bond', nameHe: 'אג"ח להמרה', globesTypes: ['bond_conversion'] },
  [InstrumentType.BOND_MAKAM]: { group: InstrumentGroup.BOND, nameEn: 'Gov Bond - Makam', nameHe: 'מק"מ', globesTypes: ['makam'] },
  
  // Derivative
  [InstrumentType.OPTION_TASE]: { group: InstrumentGroup.DERIVATIVE, nameEn: 'Option (TA)', nameHe: 'אופציה (ת"א)', globesTypes: ['option_ta'] },
  [InstrumentType.OPTION_MAOF]: { group: InstrumentGroup.DERIVATIVE, nameEn: 'Option (Maof)', nameHe: 'אופציה (מעו"ף)', globesTypes: ['option_maof'] },
  [InstrumentType.OPTION]: { group: InstrumentGroup.DERIVATIVE, nameEn: 'Option', nameHe: 'אופציה', globesTypes: ['option_other'] },
  [InstrumentType.FUTURE]: { group: InstrumentGroup.DERIVATIVE, nameEn: 'Future', nameHe: 'חוזה עתידי' },
  
  // Forex
  [InstrumentType.CURRENCY]: { group: InstrumentGroup.FOREX, nameEn: 'Currency', nameHe: 'מטבע', globesTypes: ['currency'] },
  [InstrumentType.CRYPTO]: { group: InstrumentGroup.FOREX, nameEn: 'Crypto', nameHe: 'מטבע דיגיטלי' },
  
  // Index
  [InstrumentType.INDEX]: { group: InstrumentGroup.INDEX, nameEn: 'Index', nameHe: 'מדד', globesTypes: ['index'] },
  [InstrumentType.CPI]: { group: InstrumentGroup.INDEX, nameEn: 'Consumer Price Index', nameHe: 'מדד מחירים לצרכן', globesTypes: [''] },
  [InstrumentType.COMMODITY]: { group: InstrumentGroup.COMMODITY, nameEn: 'Commodity', nameHe: 'סחורה' },

  // Other
  [InstrumentType.UNKNOWN]: { group: InstrumentGroup.OTHER, nameEn: 'Unknown', nameHe: 'לא ידוע' },
};

/**
 * Mapping from legacy/Globes source strings to Canonical Instrument Types.
 * This centralizes the translation logic from data sources to our internal model.
 */
export const GLOBES_TYPE_MAPPING: Record<string, InstrumentType> = {
  'stock': InstrumentType.STOCK,
  'etf': InstrumentType.ETF,
  'fund': InstrumentType.MUTUAL_FUND,
  'gemel_fund': InstrumentType.SAVING_PROVIDENT,
  'pension_fund': InstrumentType.SAVING_PENSION,
  'makam': InstrumentType.BOND_MAKAM,
  'gov_generic': InstrumentType.BOND_GOV,
  'bond_ta': InstrumentType.BOND_CORP,
  'bond_conversion': InstrumentType.BOND_CONVERTIBLE,
  'option_ta': InstrumentType.OPTION_TASE,
  'option_maof': InstrumentType.OPTION_MAOF,
  'option_other': InstrumentType.OPTION,
  'currency': InstrumentType.CURRENCY,
  'index': InstrumentType.INDEX,
};

/**
 * The concrete classification object attached to a Ticker.
 * Allows preserving the fine-grained source type (dynamic) while mapping to a canonical type (static).
 */
export class InstrumentClassification {
  public readonly type: InstrumentType;
  public readonly group: InstrumentGroup;
  public readonly nameEn: string;
  public readonly nameHe: string;
  public readonly specificType?: string; // The raw source type string (e.g. "CONVERTIBLE BOND" from TASE)

  constructor(
    typeOrGlobesKey: InstrumentType | string, 
    specificType?: string, 
    customDisplay?: { en?: string, he?: string }
  ) {
    // Resolve the canonical type
    let resolvedType: InstrumentType = InstrumentType.UNKNOWN;
    
    if (Object.values(InstrumentType).includes(typeOrGlobesKey as InstrumentType)) {
      resolvedType = typeOrGlobesKey as InstrumentType;
    } else {
      // Try mapping from Globes key
      resolvedType = (GLOBES_TYPE_MAPPING[typeOrGlobesKey] as InstrumentType) || InstrumentType.UNKNOWN;
    }

    const meta = INSTRUMENT_METADATA[resolvedType];

    this.type = resolvedType;
    this.group = meta.group;
    this.nameEn = customDisplay?.en || meta.nameEn;
    this.nameHe = customDisplay?.he || meta.nameHe;
    this.specificType = specificType;
  }

  get isEquity(): boolean {
    return this.group === InstrumentGroup.STOCK || this.group === InstrumentGroup.ETF;
  }
}
