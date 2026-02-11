"use strict";
// src/lib/types/instrument.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstrumentClassification = exports.GLOBES_TYPE_MAPPING = exports.INSTRUMENT_METADATA = exports.InstrumentType = exports.InstrumentGroup = void 0;
/**
 * High-level grouping for instrument behavior, sorting, and UI filtering.
 */
exports.InstrumentGroup = {
    STOCK: 'STOCK', // Equities, REITs, Warrants
    ETF: 'ETF', // Exchange Traded Funds/Notes (Sal, Mimka)
    MUTUAL_FUND: 'MUTUAL_FUND', // Mutual Funds (Neemanut) - "MTF"
    BOND: 'BOND', // Government and Corporate Bonds, Bills
    SAVING: 'SAVING', // Long-term savings (Gemel, Pension, Hishtalmut)
    DERIVATIVE: 'DERIVATIVE', // Options, Futures
    FOREX: 'FOREX', // Currencies, Crypto
    INDEX: 'INDEX', // Market Indices
    COMMODITY: 'COMMODITY', // Commodities
    OTHER: 'OTHER'
};
/**
 * Canonical Instrument Types.
 * Hierarchically named where necessary, but concise for base types.
 */
exports.InstrumentType = {
    // STOCK Group
    STOCK: 'STOCK', // Common Stock
    STOCK_REIT: 'STOCK_REIT',
    STOCK_WARRANT: 'STOCK_WARRANT',
    STOCK_PREF: 'STOCK_PREF', // Preferred Stock (Manya Bechira)
    STOCK_PARTICIPATING_UNIT: 'STOCK_PARTICIPATING_UNIT', // Yechidot Hishtatfut
    // ETF Group
    ETF: 'ETF',
    // MUTUAL_FUND Group
    MUTUAL_FUND: 'MUTUAL_FUND', // Keren Neemanut
    // SAVING Group
    SAVING_PROVIDENT: 'SAVING_PROVIDENT', // Kupat Gemel
    SAVING_PENSION: 'SAVING_PENSION', // Keren Pensya
    SAVING_STUDY: 'SAVING_STUDY', // Keren Hishtalmut
    // BOND Group
    BOND_GOV: 'BOND_GOV', // Government Bond
    BOND_CORP: 'BOND_CORP', // Corporate Bond
    BOND_CONVERTIBLE: 'BOND_CONVERTIBLE', // Convertible Bond
    BOND_MAKAM: 'BOND_MAKAM', // T-Bill (Makam)
    // DERIVATIVE Group
    OPTION_TASE: 'OPTION_TASE', // Equity Option
    OPTION_MAOF: 'OPTION_MAOF', // Index Option
    OPTION: 'OPTION', // Generic/Other options
    FUTURE: 'FUTURE',
    // FOREX Group
    CURRENCY: 'CURRENCY',
    CRYPTO: 'CRYPTO',
    // INDEX Group
    INDEX: 'INDEX',
    CPI: 'CPI',
    COMMODITY: 'COMMODITY',
    UNKNOWN: 'UNKNOWN'
};
/**
 * Registry of metadata for each canonical type.
 * Includes mapping to legacy Globes type strings for fetching.
 */
exports.INSTRUMENT_METADATA = {
    // Stock
    [exports.InstrumentType.STOCK]: { group: exports.InstrumentGroup.STOCK, nameEn: 'Stock', nameHe: 'מניה', globesTypes: ['stock'] },
    [exports.InstrumentType.STOCK_REIT]: { group: exports.InstrumentGroup.STOCK, nameEn: 'REIT', nameHe: 'קרן ריט' },
    [exports.InstrumentType.STOCK_WARRANT]: { group: exports.InstrumentGroup.STOCK, nameEn: 'Warrant', nameHe: 'כתב אופציה' },
    [exports.InstrumentType.STOCK_PREF]: { group: exports.InstrumentGroup.STOCK, nameEn: 'Preferred Stock', nameHe: 'מניית בכורה' },
    [exports.InstrumentType.STOCK_PARTICIPATING_UNIT]: { group: exports.InstrumentGroup.STOCK, nameEn: 'Participating Unit', nameHe: 'יחידת השתתפות' },
    // ETF
    [exports.InstrumentType.ETF]: { group: exports.InstrumentGroup.ETF, nameEn: 'ETF', nameHe: 'תעודת סל', globesTypes: ['etf'] },
    // Mutual Fund
    [exports.InstrumentType.MUTUAL_FUND]: { group: exports.InstrumentGroup.MUTUAL_FUND, nameEn: 'Mutual Fund', nameHe: 'קרן נאמנות', globesTypes: ['fund'] },
    // Saving
    [exports.InstrumentType.SAVING_PROVIDENT]: { group: exports.InstrumentGroup.SAVING, nameEn: 'Provident Fund', nameHe: 'קופת גמל', globesTypes: ['gemel_fund'] },
    [exports.InstrumentType.SAVING_PENSION]: { group: exports.InstrumentGroup.SAVING, nameEn: 'Pension Fund', nameHe: 'קרן פנסיה', globesTypes: ['pension_fund'] },
    [exports.InstrumentType.SAVING_STUDY]: { group: exports.InstrumentGroup.SAVING, nameEn: 'Study Fund', nameHe: 'קרן השתלמות' },
    // Bond
    // Note: Some of these keys (gov_generic, bond_ta) may be rejected by the API if not supported for *listing*,
    // but are valid for mapping if encountered.
    [exports.InstrumentType.BOND_GOV]: { group: exports.InstrumentGroup.BOND, nameEn: 'Gov Bond', nameHe: 'אג"ח מדינה', globesTypes: ['gov_generic'] },
    [exports.InstrumentType.BOND_CORP]: { group: exports.InstrumentGroup.BOND, nameEn: 'Corporate Bond', nameHe: 'אג"ח חברות', globesTypes: ['bond_ta'] },
    [exports.InstrumentType.BOND_CONVERTIBLE]: { group: exports.InstrumentGroup.BOND, nameEn: 'Convertible Bond', nameHe: 'אג"ח להמרה', globesTypes: ['bond_conversion'] },
    [exports.InstrumentType.BOND_MAKAM]: { group: exports.InstrumentGroup.BOND, nameEn: 'Gov Bond - Makam', nameHe: 'מק"מ', globesTypes: ['makam'] },
    // Derivative
    [exports.InstrumentType.OPTION_TASE]: { group: exports.InstrumentGroup.DERIVATIVE, nameEn: 'Option (TA)', nameHe: 'אופציה (ת"א)', globesTypes: ['option_ta'] },
    [exports.InstrumentType.OPTION_MAOF]: { group: exports.InstrumentGroup.DERIVATIVE, nameEn: 'Option (Maof)', nameHe: 'אופציה (מעו"ף)', globesTypes: ['option_maof'] },
    [exports.InstrumentType.OPTION]: { group: exports.InstrumentGroup.DERIVATIVE, nameEn: 'Option', nameHe: 'אופציה', globesTypes: ['option_other'] },
    [exports.InstrumentType.FUTURE]: { group: exports.InstrumentGroup.DERIVATIVE, nameEn: 'Future', nameHe: 'חוזה עתידי' },
    // Forex
    [exports.InstrumentType.CURRENCY]: { group: exports.InstrumentGroup.FOREX, nameEn: 'Currency', nameHe: 'מטבע', globesTypes: ['currency'] },
    [exports.InstrumentType.CRYPTO]: { group: exports.InstrumentGroup.FOREX, nameEn: 'Crypto', nameHe: 'מטבע דיגיטלי' },
    // Index
    [exports.InstrumentType.INDEX]: { group: exports.InstrumentGroup.INDEX, nameEn: 'Index', nameHe: 'מדד', globesTypes: ['index'] },
    [exports.InstrumentType.CPI]: { group: exports.InstrumentGroup.INDEX, nameEn: 'Consumer Price Index', nameHe: 'מדד מחירים לצרכן', globesTypes: [''] },
    [exports.InstrumentType.COMMODITY]: { group: exports.InstrumentGroup.COMMODITY, nameEn: 'Commodity', nameHe: 'סחורה' },
    // Other
    [exports.InstrumentType.UNKNOWN]: { group: exports.InstrumentGroup.OTHER, nameEn: 'Unknown', nameHe: 'לא ידוע' },
};
/**
 * Mapping from legacy/Globes source strings to Canonical Instrument Types.
 * This centralizes the translation logic from data sources to our internal model.
 */
exports.GLOBES_TYPE_MAPPING = {
    'stock': exports.InstrumentType.STOCK,
    'etf': exports.InstrumentType.ETF,
    'fund': exports.InstrumentType.MUTUAL_FUND,
    'gemel_fund': exports.InstrumentType.SAVING_PROVIDENT,
    'pension_fund': exports.InstrumentType.SAVING_PENSION,
    'makam': exports.InstrumentType.BOND_MAKAM,
    'gov_generic': exports.InstrumentType.BOND_GOV,
    'bond_ta': exports.InstrumentType.BOND_CORP,
    'bond_conversion': exports.InstrumentType.BOND_CONVERTIBLE,
    'option_ta': exports.InstrumentType.OPTION_TASE,
    'option_maof': exports.InstrumentType.OPTION_MAOF,
    'option_other': exports.InstrumentType.OPTION,
    'currency': exports.InstrumentType.CURRENCY,
    'index': exports.InstrumentType.INDEX,
};
/**
 * The concrete classification object attached to a Ticker.
 * Allows preserving the fine-grained source type (dynamic) while mapping to a canonical type (static).
 */
class InstrumentClassification {
    constructor(typeOrGlobesKey, specificType, customDisplay) {
        // Resolve the canonical type
        let resolvedType = exports.InstrumentType.UNKNOWN;
        if (Object.values(exports.InstrumentType).includes(typeOrGlobesKey)) {
            resolvedType = typeOrGlobesKey;
        }
        else {
            // Try mapping from Globes key
            resolvedType = exports.GLOBES_TYPE_MAPPING[typeOrGlobesKey] || exports.InstrumentType.UNKNOWN;
        }
        const meta = exports.INSTRUMENT_METADATA[resolvedType];
        this.type = resolvedType;
        this.group = meta.group;
        this.nameEn = customDisplay?.en || meta.nameEn;
        this.nameHe = customDisplay?.he || meta.nameHe;
        this.specificType = specificType;
    }
    get isEquity() {
        return this.group === exports.InstrumentGroup.STOCK || this.group === exports.InstrumentGroup.ETF;
    }
}
exports.InstrumentClassification = InstrumentClassification;
