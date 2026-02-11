"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORTFOLIO_TEMPLATES = exports.EXCHANGE_SETTINGS = exports.Exchange = exports.Currency = exports.InstrumentType = void 0;
exports.parseExchange = parseExchange;
exports.toGoogleSheetsExchangeCode = toGoogleSheetsExchangeCode;
exports.toGoogleFinanceExchangeCode = toGoogleFinanceExchangeCode;
const instrument_1 = require("./types/instrument");
Object.defineProperty(exports, "InstrumentType", { enumerable: true, get: function () { return instrument_1.InstrumentType; } });
exports.Currency = {
    USD: 'USD',
    ILS: 'ILS',
    EUR: 'EUR',
    GBP: 'GBP',
    ILA: 'ILA',
};
const EXCHANGES = [
    'NASDAQ', 'NYSE', 'TASE', 'LSE', 'FWB',
    'EURONEXT', 'JPX', 'HKEX', 'TSX', 'ASX', 'GEMEL', 'PENSION',
    'FOREX', 'CBS',
];
exports.Exchange = EXCHANGES.reduce((acc, ex) => {
    acc[ex] = ex;
    return acc;
}, {});
exports.EXCHANGE_SETTINGS = {
    [exports.Exchange.NASDAQ]: {
        aliases: ['XNAS', 'NMS', 'NGS', 'NCM', 'NIM', 'BTS', 'BATS'],
        googleFinanceCode: 'NASDAQ',
        googleSheetsCode: 'NASDAQ',
        yahooFinanceSuffix: ''
    },
    [exports.Exchange.NYSE]: {
        aliases: ['XNYS', 'ARCA', 'WCB', 'ASE', 'AMEX', 'NYQ'],
        googleFinanceCode: 'NYSE',
        googleSheetsCode: 'NYSE',
        yahooFinanceSuffix: ''
    },
    [exports.Exchange.TASE]: {
        aliases: ['XTAE', 'TLV', 'TA'],
        googleFinanceCode: 'TLV',
        googleSheetsCode: 'TLV',
        yahooFinanceSuffix: '.TA'
    },
    [exports.Exchange.LSE]: {
        aliases: ['XLON', 'LONDON'],
        googleFinanceCode: 'LON',
        googleSheetsCode: 'LON',
        yahooFinanceSuffix: '.L'
    },
    [exports.Exchange.FWB]: {
        aliases: ['XFRA', 'FRANKFURT', 'XETRA'],
        googleFinanceCode: 'FRA',
        googleSheetsCode: 'FRA',
        yahooFinanceSuffix: '.F'
    },
    [exports.Exchange.EURONEXT]: {
        aliases: ['XPAR', 'XAMS', 'XBRU', 'XLIS', 'XDUB'],
        googleFinanceCode: 'EPA',
        googleSheetsCode: 'EPA',
        yahooFinanceSuffix: '.PA'
    },
    [exports.Exchange.JPX]: {
        aliases: ['XTKS'],
        googleFinanceCode: 'TYO',
        googleSheetsCode: 'TYO',
        yahooFinanceSuffix: '.T'
    },
    [exports.Exchange.HKEX]: {
        aliases: ['XHKG'],
        googleFinanceCode: 'HKG',
        googleSheetsCode: 'HKG',
        yahooFinanceSuffix: '.HK'
    },
    [exports.Exchange.TSX]: {
        aliases: ['XTSE'],
        googleFinanceCode: 'TSE',
        googleSheetsCode: 'TSE',
        yahooFinanceSuffix: '.TO'
    },
    [exports.Exchange.ASX]: {
        aliases: ['XASX'],
        googleFinanceCode: 'ASX',
        googleSheetsCode: 'ASX',
        yahooFinanceSuffix: '.AX'
    },
    [exports.Exchange.GEMEL]: {
        aliases: [],
        googleFinanceCode: '',
        googleSheetsCode: 'GEMEL',
        yahooFinanceSuffix: ''
    },
    [exports.Exchange.PENSION]: {
        aliases: [],
        googleFinanceCode: '',
        googleSheetsCode: 'PENSION',
        yahooFinanceSuffix: ''
    },
    [exports.Exchange.FOREX]: {
        aliases: ['FX', 'CURRENCY', 'CRYPTO', 'CC', 'CCC'],
        googleFinanceCode: '',
        googleSheetsCode: 'CURRENCY',
        yahooFinanceSuffix: '=X'
    },
    [exports.Exchange.CBS]: {
        aliases: ['CPI', 'MADAD'],
        googleFinanceCode: '',
        googleSheetsCode: 'CBS',
        yahooFinanceSuffix: ''
    },
};
/**
 * Parses an exchange identifier string into a known Exchange type.
 * The matching is case-insensitive.
 * @param exchangeId The exchange identifier to parse (e.g., 'XNAS', 'NASDAQ').
 * @returns A canonical Exchange value
 */
function parseExchange(exchangeId) {
    if (!exchangeId)
        throw new Error('parseExchange: exchangeId is empty');
    const normalized = exchangeId.trim().toUpperCase();
    // Direct match
    if (EXCHANGES.includes(normalized)) {
        return normalized;
    }
    // Alias lookup
    for (const [ex, config] of Object.entries(exports.EXCHANGE_SETTINGS)) {
        if (config.aliases.includes(normalized)) {
            return ex;
        }
    }
    throw new Error(`parseExchange: Unknown exchangeId '${exchangeId}'`);
}
/**
 * Converts a canonical Exchange type to its Google Sheets finance exchange code.
 * @param exchange The canonical exchange.
 * @returns The Google Finance exchange code (e.g., 'TLV' for TASE) or the original if no mapping exists.
 */
function toGoogleSheetsExchangeCode(exchange) {
    return exports.EXCHANGE_SETTINGS[exchange]?.googleSheetsCode || exchange;
}
/**
 * Converts a canonical Exchange type to its Google Finance exchange code.
 * @param exchange The canonical exchange.
 * @returns The Google Finance exchange code (e.g., 'TLV' for TASE) or the original if no mapping exists.
 */
function toGoogleFinanceExchangeCode(exchange) {
    return exports.EXCHANGE_SETTINGS[exchange]?.googleFinanceCode || exchange;
}
// Templates for quick setup
exports.PORTFOLIO_TEMPLATES = {
    'std_il': {
        cgt: 0.25,
        incTax: 0,
        commRate: 0.001, // 0.1%
        commMin: 5, // 5 ILS min
        commMax: 0,
        currency: exports.Currency.ILS,
        divPolicy: 'cash_taxed',
        mgmtVal: 0,
        mgmtType: 'percentage',
        mgmtFreq: 'yearly',
        divCommRate: 0,
        taxPolicy: 'REAL_GAIN'
    },
    'std_us': {
        cgt: 0.25,
        incTax: 0,
        commRate: 0, // Usually 0 commission
        commMin: 0,
        commMax: 0,
        currency: exports.Currency.USD,
        divPolicy: 'cash_taxed',
        mgmtVal: 0,
        mgmtType: 'percentage',
        mgmtFreq: 'yearly',
        divCommRate: 0,
        taxPolicy: 'NOMINAL_GAIN'
    },
    'rsu': {
        cgt: 0.25,
        incTax: 0.50, // 50% marginal
        commRate: 0,
        commMin: 0,
        currency: exports.Currency.USD,
        divPolicy: 'hybrid_rsu',
        mgmtVal: 0,
        mgmtType: 'percentage',
        mgmtFreq: 'yearly',
        divCommRate: 0,
        taxPolicy: 'REAL_GAIN'
    },
    'hishtalmut': {
        cgt: 0,
        incTax: 0,
        commRate: 0,
        commMin: 0,
        currency: exports.Currency.ILS,
        divPolicy: 'accumulate_tax_free',
        mgmtVal: 0.007, // 0.7% from accumulation
        mgmtType: 'percentage',
        mgmtFreq: 'yearly',
        divCommRate: 0,
        taxPolicy: 'TAX_FREE'
    },
    'pension': {
        cgt: 0.33,
        incTax: 0.33,
        commRate: 0,
        commMin: 0,
        currency: exports.Currency.ILS,
        divPolicy: 'accumulate_tax_free',
        mgmtVal: 0.002, // 0.2% from accumulation
        mgmtType: 'percentage',
        mgmtFreq: 'yearly',
        divCommRate: 0,
        taxPolicy: 'PENSION'
    }
};
