// src/lib/types/instrument.ts
var InstrumentGroup = {
  STOCK: "STOCK",
  // Equities, REITs, Warrants
  ETF: "ETF",
  // Exchange Traded Funds/Notes (Sal, Mimka)
  MUTUAL_FUND: "MUTUAL_FUND",
  // Mutual Funds (Neemanut) - "MTF"
  MONETARY_FUND: "MONETARY_FUND",
  // Keren Kaspit - "Monetary Fund"
  BOND: "BOND",
  // Government and Corporate Bonds, Bills
  SAVING: "SAVING",
  // Long-term savings (Gemel, Pension, Hishtalmut)
  DERIVATIVE: "DERIVATIVE",
  // Options, Futures
  FOREX: "FOREX",
  // Currencies, Crypto
  INDEX: "INDEX",
  // Market Indices
  COMMODITY: "COMMODITY",
  // Commodities
  OTHER: "OTHER"
};
var InstrumentType = {
  // STOCK Group
  STOCK: "STOCK",
  // Common Stock
  STOCK_REIT: "STOCK_REIT",
  STOCK_WARRANT: "STOCK_WARRANT",
  STOCK_PREF: "STOCK_PREF",
  // Preferred Stock (Manya Bechira)
  STOCK_PARTICIPATING_UNIT: "STOCK_PARTICIPATING_UNIT",
  // Yechidot Hishtatfut
  // ETF Group
  ETF: "ETF",
  // MUTUAL_FUND Group
  MUTUAL_FUND: "MUTUAL_FUND",
  // Keren Neemanut
  MONETARY_FUND: "MONETARY_FUND",
  // Keren Kaspit
  // SAVING Group
  SAVING_PROVIDENT: "SAVING_PROVIDENT",
  // Kupat Gemel
  SAVING_PENSION: "SAVING_PENSION",
  // Keren Pensya
  SAVING_STUDY: "SAVING_STUDY",
  // Keren Hishtalmut
  // BOND Group
  BOND_GOV: "BOND_GOV",
  // Government Bond
  BOND_CORP: "BOND_CORP",
  // Corporate Bond
  BOND_CONVERTIBLE: "BOND_CONVERTIBLE",
  // Convertible Bond
  BOND_MAKAM: "BOND_MAKAM",
  // T-Bill (Makam)
  // DERIVATIVE Group
  OPTION_TASE: "OPTION_TASE",
  // Equity Option
  OPTION_MAOF: "OPTION_MAOF",
  // Index Option
  OPTION: "OPTION",
  // Generic/Other options
  FUTURE: "FUTURE",
  // FOREX Group
  CURRENCY: "CURRENCY",
  CRYPTO: "CRYPTO",
  // INDEX Group
  INDEX: "INDEX",
  CPI: "CPI",
  COMMODITY: "COMMODITY",
  UNKNOWN: "UNKNOWN"
};
var INSTRUMENT_METADATA = {
  // Stock
  [InstrumentType.STOCK]: { group: InstrumentGroup.STOCK, nameEn: "Stock", nameHe: "\u05DE\u05E0\u05D9\u05D4", globesTypes: ["stock"] },
  [InstrumentType.STOCK_REIT]: { group: InstrumentGroup.STOCK, nameEn: "REIT", nameHe: "\u05E7\u05E8\u05DF \u05E8\u05D9\u05D8" },
  [InstrumentType.STOCK_WARRANT]: { group: InstrumentGroup.STOCK, nameEn: "Warrant", nameHe: "\u05DB\u05EA\u05D1 \u05D0\u05D5\u05E4\u05E6\u05D9\u05D4" },
  [InstrumentType.STOCK_PREF]: { group: InstrumentGroup.STOCK, nameEn: "Preferred Stock", nameHe: "\u05DE\u05E0\u05D9\u05D9\u05EA \u05D1\u05DB\u05D5\u05E8\u05D4" },
  [InstrumentType.STOCK_PARTICIPATING_UNIT]: { group: InstrumentGroup.STOCK, nameEn: "Participating Unit", nameHe: "\u05D9\u05D7\u05D9\u05D3\u05EA \u05D4\u05E9\u05EA\u05EA\u05E4\u05D5\u05EA" },
  // ETF
  [InstrumentType.ETF]: { group: InstrumentGroup.ETF, nameEn: "ETF", nameHe: "\u05EA\u05E2\u05D5\u05D3\u05EA \u05E1\u05DC", globesTypes: ["etf"] },
  // Mutual Fund
  [InstrumentType.MUTUAL_FUND]: { group: InstrumentGroup.MUTUAL_FUND, nameEn: "Mutual Fund", nameHe: "\u05E7\u05E8\u05DF \u05E0\u05D0\u05DE\u05E0\u05D5\u05EA", globesTypes: ["fund"] },
  [InstrumentType.MONETARY_FUND]: { group: InstrumentGroup.MONETARY_FUND, nameEn: "Monetary Fund", nameHe: "\u05E7\u05E8\u05DF \u05DB\u05E1\u05E4\u05D9\u05EA", globesTypes: ["monetary_fund"] },
  // Saving
  [InstrumentType.SAVING_PROVIDENT]: { group: InstrumentGroup.SAVING, nameEn: "Provident Fund", nameHe: "\u05E7\u05D5\u05E4\u05EA \u05D2\u05DE\u05DC", globesTypes: ["gemel_fund"] },
  [InstrumentType.SAVING_PENSION]: { group: InstrumentGroup.SAVING, nameEn: "Pension Fund", nameHe: "\u05E7\u05E8\u05DF \u05E4\u05E0\u05E1\u05D9\u05D4", globesTypes: ["pension_fund"] },
  [InstrumentType.SAVING_STUDY]: { group: InstrumentGroup.SAVING, nameEn: "Study Fund", nameHe: "\u05E7\u05E8\u05DF \u05D4\u05E9\u05EA\u05DC\u05DE\u05D5\u05EA" },
  // Bond
  // Note: Some of these keys (gov_generic, bond_ta) may be rejected by the API if not supported for *listing*,
  // but are valid for mapping if encountered.
  [InstrumentType.BOND_GOV]: { group: InstrumentGroup.BOND, nameEn: "Gov Bond", nameHe: '\u05D0\u05D2"\u05D7 \u05DE\u05D3\u05D9\u05E0\u05D4', globesTypes: ["gov_generic"] },
  [InstrumentType.BOND_CORP]: { group: InstrumentGroup.BOND, nameEn: "Corporate Bond", nameHe: '\u05D0\u05D2"\u05D7 \u05D7\u05D1\u05E8\u05D5\u05EA', globesTypes: ["bond_ta"] },
  [InstrumentType.BOND_CONVERTIBLE]: { group: InstrumentGroup.BOND, nameEn: "Convertible Bond", nameHe: '\u05D0\u05D2"\u05D7 \u05DC\u05D4\u05DE\u05E8\u05D4', globesTypes: ["bond_conversion"] },
  [InstrumentType.BOND_MAKAM]: { group: InstrumentGroup.BOND, nameEn: "Gov Bond - Makam", nameHe: '\u05DE\u05E7"\u05DE', globesTypes: ["makam"] },
  // Derivative
  [InstrumentType.OPTION_TASE]: { group: InstrumentGroup.DERIVATIVE, nameEn: "Option (TA)", nameHe: '\u05D0\u05D5\u05E4\u05E6\u05D9\u05D4 (\u05EA"\u05D0)', globesTypes: ["option_ta"] },
  [InstrumentType.OPTION_MAOF]: { group: InstrumentGroup.DERIVATIVE, nameEn: "Option (Maof)", nameHe: '\u05D0\u05D5\u05E4\u05E6\u05D9\u05D4 (\u05DE\u05E2\u05D5"\u05E3)', globesTypes: ["option_maof"] },
  [InstrumentType.OPTION]: { group: InstrumentGroup.DERIVATIVE, nameEn: "Option", nameHe: "\u05D0\u05D5\u05E4\u05E6\u05D9\u05D4", globesTypes: ["option_other"] },
  [InstrumentType.FUTURE]: { group: InstrumentGroup.DERIVATIVE, nameEn: "Future", nameHe: "\u05D7\u05D5\u05D6\u05D4 \u05E2\u05EA\u05D9\u05D3\u05D9" },
  // Forex
  [InstrumentType.CURRENCY]: { group: InstrumentGroup.FOREX, nameEn: "Currency", nameHe: "\u05DE\u05D8\u05D1\u05E2", globesTypes: ["currency"] },
  [InstrumentType.CRYPTO]: { group: InstrumentGroup.FOREX, nameEn: "Crypto", nameHe: "\u05DE\u05D8\u05D1\u05E2 \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC\u05D9" },
  // Index
  [InstrumentType.INDEX]: { group: InstrumentGroup.INDEX, nameEn: "Index", nameHe: "\u05DE\u05D3\u05D3", globesTypes: ["index"] },
  [InstrumentType.CPI]: { group: InstrumentGroup.INDEX, nameEn: "Consumer Price Index", nameHe: "\u05DE\u05D3\u05D3 \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD \u05DC\u05E6\u05E8\u05DB\u05DF", globesTypes: [""] },
  [InstrumentType.COMMODITY]: { group: InstrumentGroup.COMMODITY, nameEn: "Commodity", nameHe: "\u05E1\u05D7\u05D5\u05E8\u05D4" },
  // Other
  [InstrumentType.UNKNOWN]: { group: InstrumentGroup.OTHER, nameEn: "Unknown", nameHe: "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2" }
};
var GLOBES_TYPE_MAPPING = {
  "stock": InstrumentType.STOCK,
  "etf": InstrumentType.ETF,
  "fund": InstrumentType.MUTUAL_FUND,
  "gemel_fund": InstrumentType.SAVING_PROVIDENT,
  "pension_fund": InstrumentType.SAVING_PENSION,
  "makam": InstrumentType.BOND_MAKAM,
  "gov_generic": InstrumentType.BOND_GOV,
  "bond_ta": InstrumentType.BOND_CORP,
  "bond_conversion": InstrumentType.BOND_CONVERTIBLE,
  "option_ta": InstrumentType.OPTION_TASE,
  "option_maof": InstrumentType.OPTION_MAOF,
  "option_other": InstrumentType.OPTION,
  "currency": InstrumentType.CURRENCY,
  "index": InstrumentType.INDEX,
  "monetary_fund": InstrumentType.MONETARY_FUND
};
var InstrumentClassification = class {
  type;
  group;
  nameEn;
  nameHe;
  specificType;
  // The raw source type string (e.g. "CONVERTIBLE BOND" from TASE)
  constructor(typeOrGlobesKey, specificType, customDisplay) {
    let resolvedType = InstrumentType.UNKNOWN;
    if (Object.values(InstrumentType).includes(typeOrGlobesKey)) {
      resolvedType = typeOrGlobesKey;
    } else {
      resolvedType = GLOBES_TYPE_MAPPING[typeOrGlobesKey] || InstrumentType.UNKNOWN;
    }
    const meta = INSTRUMENT_METADATA[resolvedType];
    this.type = resolvedType;
    this.group = meta.group;
    this.nameEn = customDisplay?.en || meta.nameEn;
    this.nameHe = customDisplay?.he || meta.nameHe;
    this.specificType = specificType;
  }
  get isEquity() {
    return this.group === InstrumentGroup.STOCK || this.group === InstrumentGroup.ETF;
  }
};

// src/lib/types.ts
var Currency = {
  USD: "USD",
  ILS: "ILS",
  EUR: "EUR",
  GBP: "GBP",
  ILA: "ILA",
  CAD: "CAD",
  JPY: "JPY",
  HKD: "HKD",
  AUD: "AUD",
  KRW: "KRW",
  CHF: "CHF"
};
var EXCHANGES = [
  "NASDAQ",
  "NYSE",
  "TASE",
  "LSE",
  "FWB",
  "SWX",
  "EURONEXT",
  "JPX",
  "HKEX",
  "TSX",
  "ASX",
  "KSE",
  "GEMEL",
  "PENSION",
  "FOREX",
  "CBS",
  "BOI",
  "CASH"
];
var Exchange = EXCHANGES.reduce((acc, ex) => {
  acc[ex] = ex;
  return acc;
}, {});
var EXCHANGE_SETTINGS = {
  [Exchange.NASDAQ]: {
    aliases: ["XNAS", "NMS", "NGS", "NCM", "NIM", "BTS", "BATS"],
    googleFinanceCode: "",
    googleSheetsCode: "NASDAQ",
    yahooFinanceSuffix: "",
    globesCode: "NASDAQ",
    defaultCurrency: Currency.USD,
    labelEn: "NASDAQ",
    labelHe: "NASDAQ"
  },
  [Exchange.NYSE]: {
    aliases: ["XNYS", "WCB", "ASE", "AMEX", "NYQ", "ARCA", "NYSEARCA"],
    googleFinanceCode: "",
    googleSheetsCode: "NYSE",
    yahooFinanceSuffix: "",
    globesCode: "NYSE",
    defaultCurrency: Currency.USD,
    labelEn: "NYSE",
    labelHe: "NYSE"
  },
  [Exchange.TASE]: {
    aliases: ["XTAE", "TLV", "TA"],
    googleFinanceCode: "TLV",
    googleSheetsCode: "TLV",
    yahooFinanceSuffix: ".TA",
    globesCode: "TASE",
    defaultCurrency: Currency.ILA,
    labelEn: "TASE (Tel Aviv)",
    labelHe: "TASE (\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1)"
  },
  [Exchange.LSE]: {
    aliases: ["XLON", "LONDON", "LONDON-CB", "LSE", "LON"],
    googleFinanceCode: "LON",
    googleSheetsCode: "LON",
    yahooFinanceSuffix: ".L",
    globesCode: "London-CB",
    defaultCurrency: Currency.GBP,
    labelEn: "LSE (London)",
    labelHe: "LSE (\u05DC\u05D5\u05E0\u05D3\u05D5\u05DF)"
  },
  [Exchange.FWB]: {
    aliases: ["XFRA", "FRANKFURT", "XETRA", "FRA", "FWB"],
    googleFinanceCode: "FRA",
    googleSheetsCode: "FRA",
    yahooFinanceSuffix: ".F",
    globesCode: "FRANKFURT",
    defaultCurrency: Currency.EUR,
    labelEn: "FWB (Frankfurt)",
    labelHe: "FWB (\u05E4\u05E8\u05E0\u05E7\u05E4\u05D5\u05E8\u05D8)"
  },
  [Exchange.SWX]: {
    aliases: ["XSWX", "SWX", "ZURICH", "ZRH", "SIX"],
    googleFinanceCode: "SWX",
    googleSheetsCode: "SWX",
    yahooFinanceSuffix: ".SW",
    globesCode: "SIXSWISS",
    defaultCurrency: Currency.CHF,
    labelEn: "SIX (Zurich)",
    labelHe: "SIX (\u05E6\u05D9\u05E8\u05D9\u05DA)"
  },
  [Exchange.EURONEXT]: {
    aliases: ["XPAR", "XAMS", "XBRU", "XLIS", "XDUB", "EURONEXT", "EPA", "PA", "PAR", "PARIS"],
    googleFinanceCode: "EPA",
    googleSheetsCode: "EPA",
    yahooFinanceSuffix: ".PA",
    globesCode: "EURONEXT",
    defaultCurrency: Currency.EUR,
    labelEn: "Euronext (Europe)",
    labelHe: "Euronext (\u05D0\u05D9\u05E8\u05D5\u05E4\u05D4)"
  },
  [Exchange.JPX]: {
    aliases: ["XTKS", "TSE", "TOKYO", "TYO", "JPX"],
    googleFinanceCode: "TYO",
    googleSheetsCode: "TYO",
    yahooFinanceSuffix: ".T",
    globesCode: "TSE",
    defaultCurrency: Currency.JPY,
    labelEn: "JPX (Tokyo)",
    labelHe: "JPX (\u05D8\u05D5\u05E7\u05D9\u05D5)"
  },
  [Exchange.HKEX]: {
    aliases: ["XHKG", "HKEX", "HKG", "HONGKONG", "HK"],
    googleFinanceCode: "HKG",
    googleSheetsCode: "HKG",
    yahooFinanceSuffix: ".HK",
    globesCode: "HONGKONG",
    defaultCurrency: Currency.HKD,
    labelEn: "HKEX (Hong Kong)",
    labelHe: "HKEX (\u05D4\u05D5\u05E0\u05D2 \u05E7\u05D5\u05E0\u05D2)"
  },
  [Exchange.TSX]: {
    aliases: ["XTSE", "TSX", "TORONTO", "TO"],
    googleFinanceCode: "TSE",
    googleSheetsCode: "TSE",
    yahooFinanceSuffix: ".TO",
    globesCode: "TORONTO",
    defaultCurrency: Currency.CAD,
    labelEn: "TSX (Toronto)",
    labelHe: "TSX (\u05D8\u05D5\u05E8\u05D5\u05E0\u05D8\u05D5)"
  },
  [Exchange.ASX]: {
    aliases: ["XASX", "ASX", "SYDNEY", "SY", "SYD", "AX"],
    googleFinanceCode: "ASX",
    googleSheetsCode: "ASX",
    yahooFinanceSuffix: ".AX",
    globesCode: "AUSTRALIA",
    defaultCurrency: Currency.AUD,
    labelEn: "ASX (Sydney)",
    labelHe: "ASX (\u05E1\u05D9\u05D3\u05E0\u05D9)"
  },
  [Exchange.KSE]: {
    aliases: ["XKRX", "KRX", "KSE", "SEOUL", "KS", "KQ"],
    googleFinanceCode: "KRX",
    googleSheetsCode: "KRX",
    yahooFinanceSuffix: ".KS",
    globesCode: "SEOUL",
    defaultCurrency: Currency.KRW,
    labelEn: "KSE (Korea)",
    labelHe: "KSE (\u05E7\u05D5\u05E8\u05D9\u05D0\u05D4)"
  },
  [Exchange.GEMEL]: {
    aliases: [],
    googleFinanceCode: "",
    googleSheetsCode: "GEMEL",
    yahooFinanceSuffix: "",
    globesCode: "",
    defaultCurrency: Currency.ILA,
    labelEn: "Gemel Funds",
    labelHe: "\u05E7\u05D5\u05E4\u05D5\u05EA \u05D2\u05DE\u05DC"
  },
  [Exchange.PENSION]: {
    aliases: [],
    googleFinanceCode: "",
    googleSheetsCode: "PENSION",
    yahooFinanceSuffix: "",
    globesCode: "",
    defaultCurrency: Currency.ILA,
    labelEn: "Pension Funds",
    labelHe: "\u05E7\u05E8\u05E0\u05D5\u05EA \u05E4\u05E0\u05E1\u05D9\u05D4"
  },
  [Exchange.FOREX]: {
    aliases: ["FX", "CURRENCY", "CRYPTO", "CC", "CCC"],
    googleFinanceCode: "",
    googleSheetsCode: "CURRENCY",
    yahooFinanceSuffix: "=X",
    globesCode: "",
    defaultCurrency: Currency.USD,
    labelEn: "FOREX",
    labelHe: "FOREX"
  },
  [Exchange.CBS]: {
    aliases: ["CPI", "MADAD"],
    googleFinanceCode: "",
    googleSheetsCode: "CBS",
    yahooFinanceSuffix: "",
    globesCode: "",
    defaultCurrency: Currency.ILA,
    labelEn: "Israel Price indices",
    labelHe: "\u05DE\u05D3\u05D3\u05D9 \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD"
  },
  [Exchange.BOI]: {
    aliases: ["BANK_OF_ISRAEL", "BOI_INTEREST"],
    googleFinanceCode: "",
    googleSheetsCode: "BOI",
    yahooFinanceSuffix: "",
    globesCode: "",
    defaultCurrency: Currency.ILS,
    labelEn: "Bank of Israel",
    labelHe: "\u05D1\u05E0\u05E7 \u05D9\u05E9\u05E8\u05D0\u05DC"
  },
  [Exchange.CASH]: {
    aliases: ["CASH"],
    googleFinanceCode: "",
    googleSheetsCode: "CASH",
    yahooFinanceSuffix: "",
    globesCode: "",
    defaultCurrency: Currency.ILS,
    labelEn: "Cash",
    labelHe: "\u05DE\u05D6\u05D5\u05DE\u05DF"
  }
};
function parseExchange(exchangeId) {
  if (!exchangeId) throw new Error("parseExchange: exchangeId is empty");
  const normalized = exchangeId.trim().toUpperCase();
  if (EXCHANGES.includes(normalized)) {
    return normalized;
  }
  for (const [ex, config] of Object.entries(EXCHANGE_SETTINGS)) {
    if (config.aliases.includes(normalized) || config.globesCode && config.globesCode.toUpperCase() === normalized) {
      return ex;
    }
  }
  throw new Error(`parseExchange: Unknown exchangeId '${exchangeId}'`);
}
function toGoogleSheetsExchangeCode(exchange) {
  const code = EXCHANGE_SETTINGS[exchange]?.googleSheetsCode;
  return code !== void 0 ? code : exchange;
}
function toGoogleFinanceExchangeCode(exchange) {
  const code = EXCHANGE_SETTINGS[exchange]?.googleFinanceCode;
  return code !== void 0 ? code : exchange;
}
function isBuy(type) {
  return type === "BUY" || type === "BUY_TRANSFER";
}
function isSell(type) {
  return type === "SELL" || type === "SELL_TRANSFER";
}
var PORTFOLIO_TEMPLATES = {
  "real_estate_il": {
    cgt: 0.25,
    incTax: 0,
    commRate: 0.08,
    // 8% Default Purchase Tax (for additional property)
    commMin: 0,
    commMax: 0,
    currency: Currency.ILS,
    divPolicy: "cash_taxed",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "IL_REAL_GAIN",
    commExemption: "sells"
    // Only tax on purchase
  },
  "std_il": {
    cgt: 0.25,
    incTax: 0,
    commRate: 1e-3,
    // 0.1%
    commMin: 5,
    // 5 ILS min
    commMax: 0,
    currency: Currency.ILS,
    divPolicy: "cash_taxed",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "IL_REAL_GAIN"
  },
  "us_broker_il_tax": {
    cgt: 0.25,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    commMax: 0,
    currency: Currency.USD,
    divPolicy: "cash_taxed",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "IL_REAL_GAIN"
  },
  "std_us": {
    cgt: 0.25,
    incTax: 0,
    commRate: 0,
    // Usually 0 commission
    commMin: 0,
    commMax: 0,
    currency: Currency.USD,
    divPolicy: "cash_taxed",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "NOMINAL_GAIN"
  },
  "rsu": {
    cgt: 0.25,
    incTax: 0.5,
    // 50% marginal
    commRate: 0,
    commMin: 0,
    currency: Currency.USD,
    divPolicy: "hybrid_rsu",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "RSU_ACCOUNT"
  },
  "hishtalmut": {
    cgt: 0,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: "accumulate_tax_free",
    mgmtVal: 7e-3,
    // 0.7% from accumulation
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "TAX_FREE"
  },
  "gemel": {
    cgt: 0,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: "accumulate_tax_free",
    mgmtVal: 7e-3,
    // 0.7% same as hishtalmut defaults?
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "TAX_FREE"
    // Wait, GEMEL is usually Tax Free up to limit, but here we treat as Tax Free? Or separate? 
    // Actually existing code uses 'TAX_FREE' for Hishtalmut. Gemel LeHashkaa is 'IL_REAL_GAIN' usually unless it's Gemel LeKitzva.
    // User requested: "IL Gemmel Fund" and "IL Hishtalmut fund".
    // Hishtalmut is tax free. Gemel (LeHashkaa) is Capital Gains (Real).
    // Gemel (LeKitzva/Pension) is different.
    // Let's assume Gemel LeHashkaa for now which is like a taxable account but managed?
    // User said "IL Gemmel Fund".
    // If it's Gemel LeHashkaa: 25% Real Gain.
    // If it's Gemel LeKitzva: Exempt if taken as annuity.
    // I will use IL_REAL_GAIN for Gemel (LeHashkaa) to be safe, or ask?
    // Re-reading user request: "IL pension fund, IL Gemmel Fund, IL Hishtalmut fund".
    // Usually "Gemel" implies "Gemel LeHashkaa" in this context if distinct from Pension/Hishtalmut.
    // BUT "Pension" is TAXED (Income Tax).
    // Let's try to map:
    // Hishtalmut -> Tax Free (usually)
    // Pension -> Taxed (Income)
    // Gemel -> ???
    // If I look at `taxPolicyNames` in PortfolioManager:
    // TAX_FREE = "Tax Free (Gemel/Hishtalmut)" 
    // So current code assumes Gemel IS Tax Free.
    // I will stick to TAX_FREE for Gemel template to match existing `taxPolicyNames`.
  },
  "gemel_tax_free": {
    // Internal name for consistency
    cgt: 0,
    incTax: 0,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: "accumulate_tax_free",
    mgmtVal: 7e-3,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "TAX_FREE"
  },
  "pension": {
    cgt: 0.33,
    incTax: 0.33,
    commRate: 0,
    commMin: 0,
    currency: Currency.ILS,
    divPolicy: "accumulate_tax_free",
    mgmtVal: 2e-3,
    // 0.2% from accumulation
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "PENSION"
  },
  "crypto": {
    cgt: 0.25,
    incTax: 0,
    commRate: 1e-3,
    // 0.1% default
    commMin: 0,
    currency: Currency.USD,
    divPolicy: "accumulate_tax_free",
    mgmtVal: 0,
    mgmtType: "percentage",
    mgmtFreq: "yearly",
    divCommRate: 0,
    taxPolicy: "IL_REAL_GAIN",
    isCrypto: true,
    conversionFeeVal: 1e-3,
    conversionFeeType: "percentage"
  }
};

// src/lib/date.ts
function toGoogleSheetDateFormat(date) {
  if (!date) return "";
  if (isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}
function fromGoogleSheetDate(value) {
  if (value === void 0 || value === null || value === "") return null;
  if (typeof value === "number") {
    if (value < 1e5) {
      return new Date(Math.round((value - 25569) * 86400 * 1e3));
    }
    return new Date(value);
  }
  return coerceDate(String(value));
}
function coerceDate(d) {
  if (d === void 0 || d === null || d === "") return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === "number") {
    return fromGoogleSheetDate(d);
  }
  const str = String(d).trim();
  if (!str) return null;
  if (str.includes("/") || str.includes("-")) {
    const parts = str.split(/[\/\-]/).map((p) => parseInt(p, 10));
    if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
      const [n0, n1, n2] = parts;
      if (n0 > 1e3) {
        return new Date(n0, n1 - 1, n2);
      } else if (n2 > 1e3) {
        if (n1 > 12) {
          return new Date(n2, n0 - 1, n1);
        }
        return new Date(n2, n1 - 1, n0);
      }
    }
  }
  if (/^\d+(\.\d+)?$/.test(str)) {
    return fromGoogleSheetDate(Number(str));
  }
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}
function formatYYYYMMDD(d) {
  if (!d || isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// src/lib/currencyUtils.ts
var LTR_MARK = "\u200E";
function cleanZero(n, maxDecimals) {
  if (n === 0) return 0;
  const factor = Math.pow(10, maxDecimals);
  if (Math.round(n * factor) === 0) return 0;
  return n;
}
function normalizeCurrency(input) {
  if (!input) return Currency.USD;
  const upper = input.trim().toUpperCase();
  if (upper === '\u05E9"\u05D7' || upper === "NIS" || upper === "ILS") return Currency.ILS;
  if (upper === "\u05D0\u05D2" || upper === "ILA" || upper === "ILAG" || upper === "AGOROT" || upper === "AG") return Currency.ILA;
  if (upper === "\u05D3\u05D5\u05DC\u05E8" || upper === "$" || upper === "DOLLAR" || upper === "USD") return Currency.USD;
  if (upper === "\u05D0\u05D9\u05E8\u05D5" || upper === "EUR" || upper === "EURO") return Currency.EUR;
  if (upper === '\u05DC\u05D9\u05E9"\u05D8' || upper === "LIRA" || upper === "GBP") return Currency.GBP;
  if (upper === "CAD") return Currency.CAD;
  if (upper === "JPY") return Currency.JPY;
  if (upper === "HKD") return Currency.HKD;
  if (upper === "AUD") return Currency.AUD;
  if (upper === "KRW") return Currency.KRW;
  if (upper === "CHF") return Currency.CHF;
  if (upper === "USD") return Currency.USD;
  console.warn(`normalizeCurrency: Unknown currency '${input}', defaulting to USD`);
  throw new Error(`Unknown currency: ${input}`);
}
function toILS(amount, srcCurrency, rates) {
  return convertCurrency(amount, srcCurrency, Currency.ILS, rates);
}
function convertCurrency(amount, from, to, rates) {
  if (typeof amount !== "number" || isNaN(amount)) {
    console.error(`convertCurrency: Invalid amount: ${amount}`);
    return 0;
  }
  const fromNorm = normalizeCurrency(from);
  const toNorm = normalizeCurrency(to);
  if (fromNorm === toNorm) return amount;
  if (fromNorm === Currency.ILA && toNorm === Currency.ILS) return amount / 100;
  if (fromNorm === Currency.ILS && toNorm === Currency.ILA) return amount * 100;
  let currentRates;
  if (rates && "current" in rates) {
    currentRates = rates.current;
  } else if (rates) {
    currentRates = rates;
  }
  if (!currentRates || Object.keys(currentRates).length === 0) {
    return 0;
  }
  const fromRate = currentRates[fromNorm === Currency.ILA ? Currency.ILS : fromNorm];
  const toRate = currentRates[toNorm === Currency.ILA ? Currency.ILS : toNorm];
  if (fromNorm !== Currency.USD && !fromRate) {
    console.warn(`convertCurrency: Missing or zero rate for source currency: ${fromNorm} (rate: ${fromRate}). returning 0.`);
    return 0;
  }
  if (toNorm !== Currency.USD && !toRate) {
    console.warn(`convertCurrency: Missing or zero rate for target currency: ${toNorm} (rate: ${toRate}). returning 0.`);
    return 0;
  }
  const adjustedAmount = fromNorm === Currency.ILA ? amount / 100 : amount;
  const amountInUSD = fromNorm === Currency.USD ? adjustedAmount : adjustedAmount / fromRate;
  const result = toNorm === Currency.USD ? amountInUSD : amountInUSD * toRate;
  if (toNorm === Currency.ILA) return result * 100;
  return result;
}
function extractInstrumentGroup(type) {
  if (!type) return void 0;
  if (typeof type === "object") {
    if ("group" in type && type.group && Object.values(InstrumentGroup).includes(type.group)) {
      return type.group;
    }
    if ("type" in type && type.type) {
      const canonicalType = type.type;
      if (INSTRUMENT_METADATA[canonicalType]) {
        return INSTRUMENT_METADATA[canonicalType].group;
      }
    }
  }
  if (typeof type === "string") {
    const upper = type.toUpperCase();
    if (Object.values(InstrumentGroup).includes(upper)) {
      return upper;
    }
    if (Object.values(InstrumentType).includes(upper)) {
      return INSTRUMENT_METADATA[upper]?.group;
    }
    const lower = type.toLowerCase();
    const mapped = GLOBES_TYPE_MAPPING[lower];
    if (mapped && INSTRUMENT_METADATA[mapped]) {
      return INSTRUMENT_METADATA[mapped].group;
    }
  }
  return void 0;
}
function resolveTickerPriceCurrency(params) {
  let normReported;
  if (params.reportedCurrency) {
    try {
      normReported = normalizeCurrency(params.reportedCurrency);
    } catch {
    }
  }
  let normStock;
  if (params.stockCurrency) {
    try {
      normStock = normalizeCurrency(params.stockCurrency);
    } catch {
    }
  }
  let exchange;
  if (params.exchange) {
    try {
      exchange = parseExchange(params.exchange);
    } catch {
    }
  }
  if (!exchange && params.ticker?.endsWith(".TA")) {
    exchange = Exchange.TASE;
  }
  if (normReported && normReported !== Currency.ILS && normReported !== Currency.ILA) {
    return normReported;
  }
  if (!normReported && normStock && normStock !== Currency.ILS && normStock !== Currency.ILA) {
    return normStock;
  }
  if (normReported === Currency.ILA) {
    return Currency.ILA;
  }
  if (exchange === Exchange.TASE) {
    const group = extractInstrumentGroup(params.type);
    if (group === InstrumentGroup.INDEX || group === InstrumentGroup.FOREX || group === InstrumentGroup.DERIVATIVE) {
      return Currency.ILS;
    }
    return Currency.ILA;
  }
  if (normReported) {
    return normReported;
  }
  if (normStock) {
    return normStock;
  }
  if (exchange && EXCHANGE_SETTINGS[exchange]?.defaultCurrency) {
    return EXCHANGE_SETTINGS[exchange].defaultCurrency;
  }
  return Currency.USD;
}
var calculatePerformanceInDisplayCurrency = (currentPrice, stockCurrency, perfPct, displayCurrency, exchangeRates) => {
  if (perfPct === void 0 || perfPct === null || isNaN(perfPct)) return { changeVal: NaN, changePct1d: NaN };
  const normStockCurrency = normalizeCurrency(stockCurrency);
  const normDisplayCurrency = normalizeCurrency(displayCurrency);
  if (Math.abs(1 + perfPct) < 1e-9) {
    const priceDisplayNow = convertCurrency(currentPrice, normStockCurrency, normDisplayCurrency, exchangeRates);
    return { changeVal: -priceDisplayNow, changePct1d: -1 };
  }
  const prevPriceStock = currentPrice / (1 + perfPct);
  const changeValStock = currentPrice - prevPriceStock;
  const changeValDisplay = convertCurrency(changeValStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
  const prevPriceDisplay = convertCurrency(prevPriceStock, normStockCurrency, normDisplayCurrency, exchangeRates.current);
  const changePctDisplay = prevPriceDisplay !== 0 ? changeValDisplay / prevPriceDisplay : 0;
  return { changeVal: changeValDisplay, changePct1d: changePctDisplay };
};
function formatPercent(n, alwaysShowSign = false) {
  if (n === void 0 || n === null || isNaN(n)) return "-";
  const activeDecimals = Math.abs(n) >= 1 ? 0 : 2;
  n = cleanZero(n, activeDecimals + 2);
  const formatter = new Intl.NumberFormat(void 0, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: activeDecimals,
    signDisplay: alwaysShowSign ? "exceptZero" : "auto"
  });
  return LTR_MARK + formatter.format(n);
}

// src/lib/alerts.ts
function evaluateAlert(alert, liveData) {
  const curPrice = liveData.price;
  let triggered = false;
  if (alert.type === "price_above" && alert.targetPrice !== void 0) {
    triggered = curPrice >= alert.targetPrice;
  } else if (alert.type === "price_below" && alert.targetPrice !== void 0) {
    triggered = curPrice <= alert.targetPrice;
  } else if (alert.type === "price_moved_percent" && alert.percentChange !== void 0 && alert.daysWindow !== void 0) {
    const hist = liveData.historical;
    if (hist && hist.length > 0) {
      const targetDate = /* @__PURE__ */ new Date();
      targetDate.setDate(targetDate.getDate() - alert.daysWindow);
      let priceNDaysAgo;
      let minTimeDiff = Infinity;
      for (const p of hist) {
        const pDate = new Date(p.date);
        const diff = Math.abs(pDate.getTime() - targetDate.getTime());
        if (diff < minTimeDiff) {
          minTimeDiff = diff;
          priceNDaysAgo = p.price;
        }
      }
      if (priceNDaysAgo && priceNDaysAgo > 0) {
        const changePctVal = (curPrice - priceNDaysAgo) / priceNDaysAgo * 100;
        if (alert.direction === "up") {
          triggered = changePctVal >= alert.percentChange;
        } else if (alert.direction === "down") {
          triggered = changePctVal <= -alert.percentChange;
        } else {
          triggered = Math.abs(changePctVal) >= alert.percentChange;
        }
      }
    } else {
      const changeVal = alert.daysWindow <= 1 ? liveData.changePct1d : alert.daysWindow <= 7 ? liveData.changePctRecent : liveData.changePct1m;
      const pct = (changeVal || 0) * 100;
      if (alert.direction === "up") triggered = pct >= alert.percentChange;
      else if (alert.direction === "down") triggered = pct <= -alert.percentChange;
      else triggered = Math.abs(pct) >= alert.percentChange;
    }
  }
  return triggered;
}

// src/lib/portfolioUtils.ts
function getTaxRatesForDate(p, date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  if (!p.taxHistory || p.taxHistory.length === 0) {
    return { cgt: p.cgt, incTax: p.incTax ?? 0 };
  }
  const sorted = [...p.taxHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const entry = sorted.find((h) => new Date(h.startDate) <= d);
  if (entry) {
    return { cgt: entry.cgt, incTax: entry.incTax };
  }
  return { cgt: p.cgt, incTax: p.incTax ?? 0 };
}
function getFeeRatesForDate(p, date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  if (!p.feeHistory || p.feeHistory.length === 0) {
    return { mgmtVal: p.mgmtVal ?? 0, mgmtType: p.mgmtType ?? "percentage", mgmtFreq: p.mgmtFreq ?? "yearly", divCommRate: p.divCommRate, commRate: p.commRate, commMin: p.commMin, commMax: p.commMax };
  }
  const sorted = [...p.feeHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  const entry = sorted.find((h) => new Date(h.startDate) <= d);
  if (entry) {
    return {
      mgmtVal: entry.mgmtVal,
      mgmtType: entry.mgmtType,
      mgmtFreq: entry.mgmtFreq,
      divCommRate: entry.divCommRate,
      commRate: entry.commRate ?? p.commRate,
      commMin: entry.commMin ?? p.commMin,
      commMax: entry.commMax ?? p.commMax
    };
  }
  return { mgmtVal: p.mgmtVal ?? 0, mgmtType: p.mgmtType ?? "percentage", mgmtFreq: p.mgmtFreq ?? "yearly", divCommRate: p.divCommRate, commRate: p.commRate, commMin: p.commMin, commMax: p.commMax };
}
function isRealGainTaxed(policy) {
  return policy === "IL_REAL_GAIN" || policy === "RSU_ACCOUNT";
}

// src/lib/data/multiCurrency.ts
var MultiCurrencyValue = class _MultiCurrencyValue {
  valUSD;
  valILS;
  constructor(valUSD = 0, valILS = 0) {
    this.valUSD = valUSD;
    this.valILS = valILS;
  }
  static from(valUSD, valILS) {
    return new _MultiCurrencyValue(valUSD, valILS);
  }
  static zero() {
    return new _MultiCurrencyValue(0, 0);
  }
  add(other) {
    return new _MultiCurrencyValue(
      this.valUSD + other.valUSD,
      this.valILS + other.valILS
    );
  }
  sub(other) {
    return new _MultiCurrencyValue(
      this.valUSD - other.valUSD,
      this.valILS - other.valILS
    );
  }
  // Scale by a scalar
  scale(factor) {
    return new _MultiCurrencyValue(
      this.valUSD * factor,
      this.valILS * factor
    );
  }
  get(currency) {
    if (currency === Currency.USD) return this.valUSD;
    if (currency === Currency.ILS) return this.valILS;
    return 0;
  }
};

// src/lib/data/model.ts
var getCPI = (date, cpiData) => {
  if (!cpiData?.historical || cpiData.historical.length === 0) return 100;
  const timestamp = date.getTime();
  const history = cpiData.historical;
  if (timestamp >= history[0].date.getTime()) return history[0].price;
  for (let i = 0; i < history.length - 1; i++) {
    const h1 = history[i];
    const h2 = history[i + 1];
    if (timestamp <= h1.date.getTime() && timestamp >= h2.date.getTime()) {
      const t1 = h1.date.getTime();
      const t2 = h2.date.getTime();
      const ratio = t1 === t2 ? 0 : (timestamp - t2) / (t1 - t2);
      return h2.price + (h1.price - h2.price) * ratio;
    }
  }
  return history[history.length - 1].price;
};
function computeRealTaxableGain(nominalGainPC, gainSC, costBasisPC, stockCurrency, portfolioCurrency, cpiStart, cpiEnd, exchangeRates) {
  let x = nominalGainPC;
  let y = nominalGainPC;
  if (portfolioCurrency === Currency.ILS && (stockCurrency === Currency.ILS || stockCurrency === Currency.ILA)) {
    const inflationRate = cpiStart > 0 ? cpiEnd / cpiStart - 1 : 0;
    const inflationAdj = costBasisPC * inflationRate;
    y = nominalGainPC - inflationAdj;
  } else if (portfolioCurrency !== stockCurrency) {
    y = convertCurrency(gainSC, stockCurrency, portfolioCurrency, exchangeRates);
  }
  if (x > 0 && y < 0 || x < 0 && y > 0) {
    return 0;
  }
  if (x >= 0 && y >= 0) {
    return Math.min(x, y);
  }
  return x;
}
var Holding = class {
  id;
  ticker;
  portfolioId;
  exchange;
  stockCurrency;
  portfolioCurrency;
  // State (Mutable)
  _lots = [];
  _transactions = [];
  // Raw history
  _dividends = [];
  // Holding-Level Fees (Accumulators)
  _accumulatedMgmtFees = 0;
  // Portfolio Currency
  // Tax/Inflation
  adjustedCost;
  // Portfolio Currency
  // Unallocated Buy Fees (For average cost distribution if needed, though we try to allocate to lots)
  // We allocate buy fees PRO-RATA to lots on creation.
  // Metadata
  sector;
  name;
  // Effective Name (Legacy support or calculated)
  customName;
  // Long Name (from Sheet)
  marketName;
  // Short Name (from Live Data)
  displayName;
  // Short Name preferred
  nameHe;
  type;
  // InstrumentClassification
  underlyingAssets;
  calendarEvents;
  // Market Data (Mutable)
  currentPrice = 0;
  dayChangePct;
  isStaleDayChange = false;
  perf1w;
  perf1m;
  perf3m;
  perfYtd;
  perf1y;
  perf3y;
  perf5y;
  perfAll;
  divYield;
  // Ticker intrinsic performance (not personal holding performance)
  tickerChangePct1w;
  tickerChangePct1m;
  tickerChangePct3m;
  tickerChangePctYtd;
  tickerChangePct1y;
  tickerChangePct3y;
  tickerChangePct5y;
  tickerChangePctAll;
  // Ticker intrinsic performance (not personal holding performance)
  // Quantities
  qtyVested;
  qtyUnvested;
  qtyTotal;
  // Metrics (in Stock Currency or Portfolio Currency - now Explicit)
  marketValueVested;
  // Stock Currency
  marketValueUnvested;
  // Stock Currency
  costBasisVested;
  // Portfolio Currency
  // Gains (Portfolio Currency)
  unrealizedGain;
  // Gross
  realizedGainNet;
  // Totals (Portfolio Currency)
  proceedsTotal;
  dividendsTotal;
  feesTotal;
  costOfSoldTotal;
  // Tax (Portfolio Currency - usually ILS)
  realizedCapitalGainsTax;
  realizedIncomeTax;
  unrealizedTaxLiabilityILS;
  unrealizedTaxableGainILS;
  realCostILS;
  recalculateQty() {
    this.qtyVested = this._lots.reduce((acc, l) => acc + (l.isVested && !l.soldDate ? l.qty : 0), 0);
    this.qtyUnvested = this._lots.reduce((acc, l) => acc + (!l.isVested && !l.soldDate ? l.qty : 0), 0);
    this.qtyTotal = this.qtyVested + this.qtyUnvested;
  }
  constructor(portfolioId, ticker, exchange, stockCurrency, portfolioCurrency, displayName) {
    this.portfolioId = portfolioId;
    this.ticker = ticker;
    this.exchange = exchange;
    this.stockCurrency = stockCurrency;
    this.portfolioCurrency = portfolioCurrency;
    this.displayName = displayName || ticker;
    this.id = `${portfolioId}_${ticker}`;
    this._lots = [];
    this._dividends = [];
    const zeroPC = { amount: 0, currency: portfolioCurrency };
    const zeroSC = { amount: 0, currency: stockCurrency };
    this.qtyVested = 0;
    this.qtyUnvested = 0;
    this.qtyTotal = 0;
    this.marketValueVested = { ...zeroSC };
    this.marketValueUnvested = { ...zeroSC };
    this.costBasisVested = { ...zeroPC };
    this.unrealizedGain = { ...zeroPC };
    this.realizedGainNet = { ...zeroPC };
    this.proceedsTotal = { ...zeroPC };
    this.dividendsTotal = { ...zeroPC };
    this.feesTotal = { ...zeroPC };
    this.costOfSoldTotal = { ...zeroPC };
    this.realizedCapitalGainsTax = 0;
    this.realizedIncomeTax = 0;
    this.unrealizedTaxLiabilityILS = 0;
    this.unrealizedTaxableGainILS = 0;
    this.realCostILS = 0;
  }
  // --- Core Logic ---
  addTransaction(txn, rates, cpiData, portfolio, options) {
    this._transactions.push(txn);
    const date = new Date(txn.date);
    const cpi = getCPI(date, cpiData);
    let feePC = 0;
    if (txn.commission) {
      const commCurrency = txn.currency ? normalizeCurrency(txn.currency) : this.stockCurrency;
      let commAmount = txn.commission;
      if (commCurrency === Currency.ILA) commAmount = commAmount / 100;
      feePC = convertCurrency(commAmount, commCurrency === Currency.ILA ? Currency.ILS : commCurrency, this.portfolioCurrency, rates);
    }
    if (isBuy(txn.type)) {
      this.handleBuy(txn, rates, cpi, feePC, options);
    } else if (isSell(txn.type)) {
      return this.handleSell(txn, rates, cpi, feePC, portfolio);
    } else if (txn.type === "DIVIDEND") {
    } else if (txn.type === "FEE") {
      this.addMgmtFee(feePC);
      const val = txn.price ? txn.price * (txn.qty || 1) : 0;
      const valPC = convertCurrency(val, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
      this.addMgmtFee(valPC);
    }
    return {};
  }
  addDividend(d) {
    this._dividends.push(d);
  }
  addMgmtFee(amount) {
    this._accumulatedMgmtFees += amount;
  }
  handleBuy(txn, rates, cpi, feePC, options) {
    const qty = txn.qty || 0;
    if (qty <= 0) return;
    let effectiveRates = rates ? rates.current : void 0;
    if (rates && txn.date) {
      const d = typeof txn.date === "string" ? new Date(txn.date) : txn.date;
      for (let i = 0; i <= 7; i++) {
        const searchDate = new Date(d);
        searchDate.setDate(searchDate.getDate() - i);
        const dateKey = searchDate.toISOString().split("T")[0];
        if (rates[dateKey]) {
          effectiveRates = rates[dateKey];
          break;
        }
      }
    }
    let pricePerUnitPC = 0;
    if (this.portfolioCurrency === Currency.ILS) {
      const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
      if (txnCurr === Currency.ILS || txnCurr === Currency.ILA) {
        pricePerUnitPC = convertCurrency(txn.price || 0, txnCurr, Currency.ILS, effectiveRates);
      } else if (txn.originalPriceILA) {
        pricePerUnitPC = toILS(txn.originalPriceILA, Currency.ILA);
      } else {
        pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.ILS, effectiveRates);
      }
    } else {
      const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
      if (txnCurr === Currency.USD) {
        pricePerUnitPC = txn.price || 0;
      } else if (txn.originalPriceUSD) {
        pricePerUnitPC = txn.originalPriceUSD;
      } else {
        pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.USD, effectiveRates);
      }
    }
    const rateToPC = pricePerUnitPC / (txn.originalPrice || 1);
    let valUSD = txn.originalPriceUSD;
    if (!valUSD) {
      const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
      if (txnCurr === Currency.USD && txn.price) {
        valUSD = txn.price;
      } else if (txn.originalPrice && txnCurr === Currency.USD) {
        valUSD = txn.originalPrice;
      } else {
        valUSD = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.USD, effectiveRates);
      }
    }
    let valILS = void 0;
    if (this.portfolioCurrency === Currency.ILS) {
      valILS = pricePerUnitPC;
    } else if (txn.originalPriceILA) {
      valILS = toILS(txn.originalPriceILA, Currency.ILA);
    } else {
      const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
      if ((txnCurr === Currency.ILS || txnCurr === Currency.ILA) && txn.price) {
        valILS = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.ILS, effectiveRates);
      } else {
        valILS = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.ILS, effectiveRates);
      }
    }
    let costMoney;
    if (options?.costBasisOverride !== void 0) {
      const forcedCostTotal = options.costBasisOverride;
      const forcedCostPerUnit = qty > 0 ? forcedCostTotal / qty : 0;
      const rateToPC_Override = forcedCostPerUnit / (txn.originalPrice || 1);
      costMoney = {
        amount: forcedCostPerUnit,
        currency: this.portfolioCurrency,
        rateToPortfolio: rateToPC_Override,
        valUSD: void 0,
        // Lost historical context unless we pass it too?
        valILS: void 0
        // Lost historical context
      };
    } else {
      costMoney = {
        amount: pricePerUnitPC,
        currency: this.portfolioCurrency,
        rateToPortfolio: rateToPC,
        valUSD,
        valILS
      };
    }
    const totalCostMoney = {
      amount: costMoney.amount * qty,
      currency: this.portfolioCurrency,
      rateToPortfolio: costMoney.rateToPortfolio,
      valUSD: costMoney.valUSD ? costMoney.valUSD * qty : void 0,
      valILS: costMoney.valILS ? costMoney.valILS * qty : void 0
    };
    const feeMoney = {
      amount: feePC,
      currency: this.portfolioCurrency,
      rateToPortfolio: 1,
      valUSD: convertCurrency(feePC, this.portfolioCurrency, Currency.USD, rates),
      valILS: convertCurrency(feePC, this.portfolioCurrency, Currency.ILS, rates)
    };
    const lot = {
      id: `lot_${txn.numericId || Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ticker: this.ticker,
      date: new Date(txn.date),
      qty,
      costPerUnit: costMoney,
      costTotal: totalCostMoney,
      feesBuy: feeMoney,
      cpiAtBuy: cpi,
      vestingDate: txn.vestDate ? new Date(txn.vestDate) : void 0,
      isVested: !txn.vestDate || new Date(txn.vestDate) <= /* @__PURE__ */ new Date(),
      originalTxnId: txn.rowIndex?.toString() || "",
      notes: txn.comment
    };
    this._lots.push(lot);
    this.recalculateQty();
  }
  handleSell(txn, rates, cpi, feePC, portfolio) {
    let qtyToSell = txn.qty || 0;
    if (qtyToSell <= 0) return {};
    const activeLots = this.activeLots.sort((a, b) => a.date.getTime() - b.date.getTime());
    let sellPricePC = 0;
    let totalCostOfSold = 0;
    if (this.portfolioCurrency === Currency.ILS) {
      if (txn.originalPriceILA) {
        sellPricePC = toILS(txn.originalPriceILA, Currency.ILA);
      } else {
        sellPricePC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.ILS, rates);
      }
    } else {
      if (this.portfolioCurrency === Currency.USD && txn.originalPriceUSD) {
        sellPricePC = txn.originalPriceUSD;
      } else {
        sellPricePC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
      }
    }
    const sellPriceSC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, this.stockCurrency, rates);
    const totalSellQty = qtyToSell;
    for (const lot of activeLots) {
      if (qtyToSell <= 0) break;
      const portion = Math.min(lot.qty, qtyToSell);
      let targetLot;
      if (portion < lot.qty) {
        const remainingQty = lot.qty - portion;
        const soldChunk = {
          ...lot,
          id: lot.id + "_sold_" + Date.now(),
          qty: portion,
          costTotal: { ...lot.costTotal, amount: lot.costTotal.amount * (portion / lot.qty) },
          feesBuy: { ...lot.feesBuy, amount: lot.feesBuy.amount * (portion / lot.qty) }
        };
        const scale = portion / lot.qty;
        if (soldChunk.costTotal.valUSD) soldChunk.costTotal.valUSD *= scale;
        if (soldChunk.costTotal.valILS) soldChunk.costTotal.valILS *= scale;
        if (soldChunk.feesBuy.valUSD) soldChunk.feesBuy.valUSD *= scale;
        if (soldChunk.feesBuy.valILS) soldChunk.feesBuy.valILS *= scale;
        lot.qty = remainingQty;
        lot.costTotal.amount -= soldChunk.costTotal.amount;
        if (lot.costTotal.valUSD) lot.costTotal.valUSD -= soldChunk.costTotal.valUSD;
        if (lot.costTotal.valILS) lot.costTotal.valILS -= soldChunk.costTotal.valILS;
        lot.feesBuy.amount -= soldChunk.feesBuy.amount;
        if (lot.feesBuy.valUSD) lot.feesBuy.valUSD -= soldChunk.feesBuy.valUSD;
        if (lot.feesBuy.valILS) lot.feesBuy.valILS -= soldChunk.feesBuy.valILS;
        this._lots.push(soldChunk);
        targetLot = soldChunk;
      } else {
        targetLot = lot;
      }
      targetLot.soldDate = new Date(txn.date);
      targetLot.disposalType = txn.type === "SELL_TRANSFER" ? "TRANSFER" : "SELL";
      targetLot.soldPricePerUnit = {
        amount: sellPricePC,
        currency: this.portfolioCurrency,
        rateToPortfolio: 1,
        // sellPricePC is already PC
        valUSD: convertCurrency(sellPricePC, this.portfolioCurrency, Currency.USD, rates),
        valILS: convertCurrency(sellPricePC, this.portfolioCurrency, Currency.ILS, rates)
      };
      const allocatedSellFeePC = portion / totalSellQty * feePC;
      targetLot.soldFees = {
        amount: allocatedSellFeePC,
        currency: this.portfolioCurrency,
        rateToPortfolio: 1,
        valUSD: convertCurrency(allocatedSellFeePC, this.portfolioCurrency, Currency.USD, rates),
        valILS: convertCurrency(allocatedSellFeePC, this.portfolioCurrency, Currency.ILS, rates)
      };
      const proceedsPC = portion * sellPricePC;
      const proceedsSC = portion * sellPriceSC;
      const costPC = targetLot.costTotal.amount;
      const buyFeePC = targetLot.feesBuy.amount;
      const netGainPC = proceedsPC - costPC - allocatedSellFeePC - buyFeePC;
      targetLot.realizedGainNet = netGainPC;
      const { cgt } = getTaxRatesForDate(portfolio, txn.date);
      const { taxPolicy } = portfolio;
      let proceedsILS = convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates);
      if (this.portfolioCurrency === Currency.ILS && txn.originalPriceILA) {
        const histPriceILS = toILS(txn.originalPriceILA, Currency.ILA);
        proceedsILS = portion * histPriceILS;
      } else if (txn.originalPriceILA) {
        const histPriceILS = toILS(txn.originalPriceILA, Currency.ILA);
        proceedsILS = portion * histPriceILS;
      }
      const sellFeeILS = convertCurrency(allocatedSellFeePC, this.portfolioCurrency, Currency.ILS, rates);
      const buyFeeILS = convertCurrency(buyFeePC, this.portfolioCurrency, Currency.ILS, rates);
      const costILS = convertCurrency(costPC, this.portfolioCurrency, Currency.ILS, rates);
      totalCostOfSold += costPC;
      const trueCostILS = targetLot.costTotal.valILS || costILS;
      const trueBuyFeeILS = targetLot.feesBuy.valILS || buyFeeILS;
      const nominalGainILS = proceedsILS - sellFeeILS - (trueCostILS + trueBuyFeeILS);
      let costSC = 0;
      if (this.stockCurrency === Currency.USD && targetLot.costTotal.valUSD) {
        costSC = targetLot.costTotal.valUSD;
      } else if (this.stockCurrency === Currency.ILS && targetLot.costTotal.valILS) {
        costSC = targetLot.costTotal.valILS;
      } else {
        costSC = targetLot.costTotal.amount / (targetLot.costTotal.rateToPortfolio || 1);
      }
      const sellFeeSC = convertCurrency(allocatedSellFeePC, this.portfolioCurrency, this.stockCurrency, rates);
      const buyFeeSC = convertCurrency(buyFeePC, this.portfolioCurrency, this.stockCurrency, rates);
      const gainSC = proceedsSC - sellFeeSC - buyFeeSC - costSC;
      let taxableGainILS = 0;
      if (taxPolicy === "TAX_FREE") {
        taxableGainILS = 0;
      } else if (isRealGainTaxed(taxPolicy)) {
        let calcRates = rates;
        if (proceedsSC > 0 && proceedsILS > 0) {
          const effectiveRate = proceedsILS / proceedsSC;
          const newCurrent = { ...rates.current };
          if (this.stockCurrency === Currency.USD) {
            newCurrent[this.portfolioCurrency] = effectiveRate;
          } else if (this.portfolioCurrency === Currency.USD) {
            newCurrent[this.stockCurrency] = 1 / effectiveRate;
          } else {
            if (newCurrent[this.stockCurrency] === 1) {
              newCurrent[this.portfolioCurrency] = effectiveRate;
            }
          }
          calcRates = { ...rates, current: newCurrent };
        }
        taxableGainILS = computeRealTaxableGain(
          nominalGainILS,
          gainSC,
          trueCostILS + trueBuyFeeILS,
          this.stockCurrency,
          Currency.ILS,
          targetLot.cpiAtBuy,
          cpi,
          calcRates
        );
      } else {
        taxableGainILS = nominalGainILS;
      }
      targetLot.realizedTaxableGainILS = taxableGainILS;
      const taxILS = Math.max(0, taxableGainILS) * cgt;
      targetLot.realizedTax = taxILS;
      targetLot.realizedTaxPC = convertCurrency(taxILS, Currency.ILS, this.portfolioCurrency, rates);
      this.realizedCapitalGainsTax += targetLot.realizedTaxPC;
      if (taxPolicy === "RSU_ACCOUNT" && portfolio.incTax && portfolio.incTax > 0) {
        const incomeTaxPC = costPC * portfolio.incTax;
        targetLot.realizedIncomeTaxPC = incomeTaxPC;
        this.realizedIncomeTax += incomeTaxPC;
      }
      targetLot.totalRealizedTaxPC = (targetLot.realizedTaxPC || 0) + (targetLot.realizedIncomeTaxPC || 0);
      qtyToSell -= portion;
    }
    this.recalculateQty();
    return {
      costOfSold: totalCostOfSold
    };
  }
  // --- Getters (Computed Properties) ---
  get lots() {
    return this._lots;
  }
  get transactions() {
    return this._transactions;
  }
  get dividends() {
    return this._dividends;
  }
  get activeLots() {
    return this._lots.filter((l) => !l.soldDate && l.qty > 0);
  }
  get vestedLots() {
    return this._lots.filter((l) => !l.soldDate && l.qty > 0 && l.isVested);
  }
  get realizedLots() {
    return this._lots.filter((l) => l.soldDate);
  }
  get combinedLots() {
    return this._lots;
  }
  get marketValueTotal() {
    return {
      amount: this.marketValueVested.amount + this.marketValueUnvested.amount,
      currency: this.stockCurrency
    };
  }
  get unrealizedGainPct() {
    if (this.costBasisVested.amount === 0) return 0;
    return this.unrealizedGain.amount / this.costBasisVested.amount;
  }
  get avgHoldingTimeYears() {
    let totalUnitYears = 0;
    let totalUnits = 0;
    const now = /* @__PURE__ */ new Date();
    for (const lot of this.combinedLots) {
      const endDate = lot.soldDate || now;
      const years = (endDate.getTime() - lot.date.getTime()) / (1e3 * 60 * 60 * 24 * 365.25);
      totalUnitYears += lot.qty * years;
      totalUnits += lot.qty;
    }
    return totalUnits > 0 ? totalUnitYears / totalUnits : 0;
  }
  get avgYearlyReturn() {
    const time = this.avgHoldingTimeYears;
    if (time <= 0 || this.perfAll === void 0) return void 0;
    return this.perfAll / time;
  }
  /**
   * Aggregated Realized Tax in Portfolio Currency (PC).
   * Sums:
   * 1. Realized Capital Gains Tax from Sold Lots
   * 2. Realized Income Tax from Sold Lots (e.g. RSU Vest Value tax, paid upon Sale)
   * 3. Tax on Dividends
   */
  get totalTaxPaidPC() {
    const salesTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedTaxPC || 0), 0);
    const incomeTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedIncomeTaxPC || 0), 0);
    const divTax = this._dividends.reduce((sum, d) => sum + (d.taxAmountPC || 0), 0);
    return salesTax + incomeTax + divTax;
  }
  /**
   * Calculates the gain for this holding over a specific period.
   * Uses "Initial Value vs Final Value" logic (Simple Return), not Time-Weighted Return.
   */
  generateGainForPeriod(startDate, historyProvider, rates, initialRates) {
    let initialVal = MultiCurrencyValue.zero();
    let finalVal = MultiCurrencyValue.zero();
    const startTime = new Date(startDate).setUTCHours(0, 0, 0, 0);
    const historyData = historyProvider(this.ticker);
    const getPriceAtDate = (date) => {
      if (!historyData?.historical) return 0;
      const t = date.getTime();
      let found = historyData.historical[0];
      for (let i = 0; i < historyData.historical.length; i++) {
        if (new Date(historyData.historical[i].date).getTime() > t) break;
        found = historyData.historical[i];
      }
      return found?.price || found?.adjClose || 0;
    };
    let priceAtStart = 0;
    let priceAtStartFetched = false;
    const lots = this._lots;
    for (const lot of lots) {
      if (!lot.isVested) continue;
      if (lot.soldDate && lot.soldDate.getTime() < startTime) continue;
      let lotInitial = MultiCurrencyValue.zero();
      if (lot.date.getTime() >= startTime) {
        const usd = lot.costTotal.valUSD || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.USD, rates);
        const ils = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, rates);
        lotInitial = new MultiCurrencyValue(usd, ils);
      } else {
        if (!priceAtStartFetched) {
          priceAtStart = getPriceAtDate(startDate);
          priceAtStartFetched = true;
        }
        if (priceAtStart <= 0) {
          continue;
        }
        const valSC = lot.qty * priceAtStart;
        const ratesToUse = initialRates || rates.current;
        const synthRates = { ...rates, current: ratesToUse };
        lotInitial = new MultiCurrencyValue(
          convertCurrency(valSC, this.stockCurrency, Currency.USD, synthRates),
          convertCurrency(valSC, this.stockCurrency, Currency.ILS, synthRates)
        );
      }
      initialVal = initialVal.add(lotInitial);
      let lotFinal = MultiCurrencyValue.zero();
      if (lot.soldDate) {
        const costPC = lot.costTotal.amount;
        const netGainPC = lot.realizedGainNet || 0;
        const buyFeePC = lot.feesBuy.amount;
        const sellFeePC = lot.soldFees?.amount || 0;
        const proceedsPC = costPC + netGainPC + buyFeePC + sellFeePC;
        lotFinal = new MultiCurrencyValue(
          convertCurrency(proceedsPC, this.portfolioCurrency, Currency.USD, rates),
          convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates)
        );
      } else {
        const currentPrice = this.currentPrice;
        const valSC = lot.qty * currentPrice;
        lotFinal = new MultiCurrencyValue(
          convertCurrency(valSC, this.stockCurrency, Currency.USD, rates),
          convertCurrency(valSC, this.stockCurrency, Currency.ILS, rates)
        );
      }
      finalVal = finalVal.add(lotFinal);
    }
    let gain = finalVal.sub(initialVal);
    for (const div of this._dividends) {
      if (div.date.getTime() >= startTime) {
        const divVal = new MultiCurrencyValue(
          convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.USD, rates),
          convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.ILS, rates)
        );
        finalVal = finalVal.add(divVal);
        gain = gain.add(divVal);
      }
    }
    return {
      gain,
      initialValue: initialVal,
      finalValue: finalVal,
      gainPct: 0
      // Caller will compute
    };
  }
};

// src/lib/data/engine.ts
var INITIAL_SUMMARY = {
  aum: 0,
  totalUnrealized: 0,
  totalUnrealizedGainPct: 0,
  totalRealized: 0,
  totalRealizedGainPct: 0,
  totalCostOfSold: 0,
  totalDividends: 0,
  totalReturn: 0,
  realizedGainAfterTax: 0,
  totalTaxPaid: 0,
  valueAfterTax: 0,
  totalDayChange: 0,
  totalDayChangePct: 0,
  totalDayChangeIsIncomplete: false,
  perf1d: 0,
  perf1w: 0,
  perf1w_incomplete: false,
  perf1m: 0,
  perf1m_incomplete: false,
  perf3m: 0,
  perf3m_incomplete: false,
  perf1y: 0,
  perf1y_incomplete: false,
  perf3y: 0,
  perf3y_incomplete: false,
  perf5y: 0,
  perf5y_incomplete: false,
  perfAll: 0,
  perfAll_incomplete: false,
  perfYtd: 0,
  perfYtd_incomplete: false,
  divYield: 0,
  totalUnvestedValue: 0,
  totalUnvestedGain: 0,
  totalUnvestedGainPct: 0
};
var perfPeriods = {
  perf1w: "perf1w",
  perf1m: "perf1m",
  perf3m: "perf3m",
  perfYtd: "perfYtd",
  perf1y: "perf1y",
  perf3y: "perf3y",
  perf5y: "perf5y",
  perfAll: "perfAll"
};
var FinanceEngine = class _FinanceEngine {
  holdings = /* @__PURE__ */ new Map();
  portfolios;
  exchangeRates;
  cpiData;
  transferBucket = /* @__PURE__ */ new Map();
  livePrices = /* @__PURE__ */ new Map();
  constructor(portfolios, exchangeRates, cpiData) {
    this.portfolios = new Map(portfolios.map((p) => [p.id, p]));
    this.exchangeRates = exchangeRates;
    this.cpiData = cpiData;
  }
  /**
   * Creates a shallow copy of the engine primarily to trigger React re-renders 
   * when live prices update. Holdings and transfer buckets are passed by reference 
   * for performance. Do not use this for deep mutations.
   */
  clone() {
    const copy = new _FinanceEngine(Array.from(this.portfolios.values()), this.exchangeRates, this.cpiData);
    copy.holdings = this.holdings;
    copy.transferBucket = this.transferBucket;
    copy.livePrices = new Map(this.livePrices);
    return copy;
  }
  get transactions() {
    const all = [];
    this.holdings.forEach((h) => {
      all.push(...h.transactions);
    });
    return all;
  }
  get dividendRecords() {
    const all = [];
    this.holdings.forEach((h) => {
      h.dividends.forEach((d) => {
        all.push({
          ...d,
          ticker: h.ticker,
          exchange: h.exchange,
          portfolioId: h.portfolioId
        });
      });
    });
    return all;
  }
  get allDividends() {
    const all = [];
    this.holdings.forEach((h) => all.push(...h.dividends));
    return all;
  }
  getHolding(portfolioId, ticker, exchange, currency) {
    const key = `${portfolioId}_${ticker}`;
    if (!this.holdings.has(key)) {
      const p = this.portfolios.get(portfolioId);
      const holdingOnPortfolio = p?.holdings?.find((h2) => h2.ticker === ticker && h2.exchange === exchange);
      const stockCurrency = normalizeCurrency(holdingOnPortfolio?.currency || currency);
      const portfolioCurrency = normalizeCurrency(p?.currency || "USD");
      const h = new Holding(portfolioId, ticker, exchange, stockCurrency, portfolioCurrency);
      if (holdingOnPortfolio) {
        if (holdingOnPortfolio.name) {
          h.customName = holdingOnPortfolio.name;
          h.name = holdingOnPortfolio.name;
        }
        if (holdingOnPortfolio.nameHe) h.nameHe = holdingOnPortfolio.nameHe;
        if (holdingOnPortfolio.sector) h.sector = holdingOnPortfolio.sector;
        if (holdingOnPortfolio.type) h.type = holdingOnPortfolio.type;
      }
      this.holdings.set(key, h);
    }
    return this.holdings.get(key);
  }
  processEvents(rawTxns, dividends) {
    const events = [
      ...rawTxns.map((t) => ({ kind: "TXN", data: t })),
      ...dividends.map((d) => ({ kind: "DIV", data: d }))
    ];
    events.sort((a, b) => {
      const dateA = coerceDate(a.data.date);
      const dateB = coerceDate(b.data.date);
      const timeDiff = (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
      if (timeDiff !== 0) return timeDiff;
      const getPriority = (kind, data) => {
        if (kind === "DIV") return 2;
        const type = data.type;
        switch (type) {
          case "BUY":
            return 1;
          case "SELL_TRANSFER":
            return 3;
          case "BUY_TRANSFER":
            return 4;
          case "SELL":
            return 5;
          case "FEE":
            return 6;
          default:
            return 99;
        }
      };
      const pA = getPriority(a.kind, a.data);
      const pB = getPriority(b.kind, b.data);
      return pA - pB;
    });
    this.transferBucket.clear();
    events.forEach((e) => {
      if (e.kind === "DIV") {
        const d = e.data;
        this.holdings.forEach((h) => {
          if (h.ticker === d.ticker && h.exchange === d.exchange) {
            const { vested, unvested } = this.getQtyBreakdownAtDate(h, d.date);
            const totalQty = vested + unvested;
            if (totalQty > 0) {
              const divCurrency = d.currency || h.stockCurrency;
              const grossDC = totalQty * d.amount;
              const grossSC = convertCurrency(grossDC, divCurrency, h.stockCurrency, this.exchangeRates);
              const p = this.portfolios.get(h.portfolioId);
              let divFeeRate = 0;
              if (p) {
                const { divCommRate } = getFeeRatesForDate(p, d.date);
                divFeeRate = divCommRate;
              }
              const feeSC = grossSC * divFeeRate;
              const feePC = convertCurrency(feeSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
              const grossPC = convertCurrency(grossDC, divCurrency, h.portfolioCurrency, this.exchangeRates);
              let ratioCashed = totalQty > 0 ? vested / totalQty : 0;
              let ratioReinvested = totalQty > 0 ? unvested / totalQty : 0;
              let taxRateCashed = 0;
              let taxRateReinvested = 0;
              let taxAmountPC = 0;
              let taxCashedPC = 0;
              let taxReinvestedPC = 0;
              if (p) {
                const { cgt, incTax, divPolicy, taxPolicy } = p;
                const isReit = h.type?.type === InstrumentType.STOCK_REIT;
                let baseTaxRate = isReit && (incTax || 0) > 0 ? incTax || 0 : cgt;
                if (taxPolicy === "TAX_FREE") baseTaxRate = 0;
                taxRateCashed = baseTaxRate;
                if (divPolicy === "accumulate_tax_free" || divPolicy === "hybrid_rsu") {
                  taxRateReinvested = 0;
                } else {
                  taxRateReinvested = baseTaxRate;
                }
                const valILS = convertCurrency(grossSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
                if (divPolicy === "accumulate_tax_free") {
                  ratioCashed = 0;
                  ratioReinvested = 1;
                }
                const grossILS = valILS;
                const taxILSCashed = grossILS * ratioCashed * taxRateCashed;
                const taxILSReinvested = grossILS * ratioReinvested * taxRateReinvested;
                taxCashedPC = convertCurrency(taxILSCashed, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                taxReinvestedPC = convertCurrency(taxILSReinvested, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                taxAmountPC = taxCashedPC + taxReinvestedPC;
              }
              const feeCashedPC = feePC * ratioCashed;
              const feeReinvestedPC = feePC - feeCashedPC;
              const netPC = grossPC - feePC - taxAmountPC;
              const divRecord = {
                date: d.date,
                grossAmount: {
                  amount: grossDC,
                  currency: divCurrency,
                  rateToPortfolio: grossPC / grossDC
                  // approx
                },
                netAmountPC: netPC,
                taxAmountPC,
                feeAmountPC: feePC,
                isTaxable: true,
                // New breakdown
                unitsHeld: totalQty,
                pricePerUnit: d.amount,
                cashedAmount: totalQty > 0 ? grossPC * ratioCashed - feeCashedPC - taxCashedPC : 0,
                reinvestedAmount: totalQty > 0 ? grossPC * ratioReinvested - feeReinvestedPC - taxReinvestedPC : 0,
                isReinvested: ratioReinvested > 0,
                taxCashedPC,
                taxReinvestedPC,
                feeCashedPC,
                feeReinvestedPC,
                assetPriceAtDrip: d.assetPriceAtDrip
              };
              h.addDividend(divRecord);
              if (divRecord.isReinvested && divRecord.assetPriceAtDrip && divRecord.assetPriceAtDrip > 0) {
                const reinvestedAmountSC = convertCurrency(divRecord.reinvestedAmount, h.portfolioCurrency, h.stockCurrency, this.exchangeRates);
                const qtyBuy = reinvestedAmountSC / divRecord.assetPriceAtDrip;
                const originalPriceILA = h.stockCurrency === Currency.ILS ? divRecord.assetPriceAtDrip * 100 : void 0;
                const drpTxn = {
                  date: d.date.toISOString(),
                  portfolioId: h.portfolioId,
                  ticker: h.ticker,
                  exchange: h.exchange,
                  type: "BUY",
                  originalQty: qtyBuy,
                  originalPrice: divRecord.assetPriceAtDrip,
                  originalPriceILA,
                  qty: qtyBuy,
                  price: divRecord.assetPriceAtDrip,
                  currency: h.stockCurrency,
                  commission: 0,
                  source: "SYSTEM_DRIP",
                  isDrip: true
                };
                const pGroup = this.portfolios.get(h.portfolioId);
                if (pGroup) {
                  h.addTransaction(drpTxn, this.exchangeRates, this.cpiData, pGroup);
                }
              }
            }
          }
        });
      } else {
        const t = e.data;
        const p = this.portfolios.get(t.portfolioId);
        if (!p) return;
        const exchange = t.exchange || Exchange.TASE;
        const stockCurrency = normalizeCurrency(t.currency || (exchange === Exchange.TASE ? Currency.ILA : Currency.USD));
        const h = this.getHolding(t.portfolioId, t.ticker, exchange, stockCurrency);
        let txnRates = this.exchangeRates;
        if (t.date && this.exchangeRates[t.date]) {
          txnRates = {
            ...this.exchangeRates,
            current: this.exchangeRates[t.date]
          };
        }
        h.addTransaction(t, txnRates, this.cpiData, p);
      }
    });
    this.calculateSnapshot();
  }
  priceHistory = /* @__PURE__ */ new Map();
  hydrateLivePrices(priceMap) {
    priceMap.forEach((live, key) => {
      this.livePrices.set(key, live);
      if (live?.historical) {
        const ticker = key.split(":")[1];
        if (ticker) this.priceHistory.set(ticker, live.historical);
      }
    });
    this.holdings.forEach((h) => {
      const key = `${h.exchange}:${h.ticker}`;
      const live = priceMap.get(key);
      if (live?.historical) {
        this.priceHistory.set(h.ticker, live.historical);
      }
    });
    const now = /* @__PURE__ */ new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const calculatePersonalPerf = (h, period, fallbackPct) => {
      let startDate;
      switch (period) {
        case "1w":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
          break;
        case "1m":
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case "3m":
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case "ytd":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "1y":
          startDate = new Date(now);
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case "3y":
          startDate = new Date(now);
          startDate.setFullYear(startDate.getFullYear() - 3);
          break;
        case "5y":
          startDate = new Date(now);
          startDate.setFullYear(startDate.getFullYear() - 5);
          break;
        case "all":
          startDate = /* @__PURE__ */ new Date(0);
          break;
        default:
          return fallbackPct || 0;
      }
      if (startDate > now) return fallbackPct || 0;
      try {
        const provider = (t) => ({ historical: this.priceHistory.get(t) || [] });
        const res = h.generateGainForPeriod(startDate, provider, this.exchangeRates);
        if (res.initialValue.get(h.portfolioCurrency) === 0) {
          return fallbackPct !== void 0 ? fallbackPct : 0;
        }
        const initialPC = res.initialValue.get(h.portfolioCurrency);
        const gainPC = res.gain.get(h.portfolioCurrency);
        if (initialPC === 0) return fallbackPct !== void 0 ? fallbackPct : 0;
        return gainPC / initialPC;
      } catch (e) {
        console.warn(`Failed to calc personal perf for ${h.ticker} ${period}`, e);
        return fallbackPct !== void 0 ? fallbackPct : 0;
      }
    };
    this.holdings.forEach((h) => {
      const key = `${h.exchange}:${h.ticker}`;
      const live = priceMap.get(key);
      if (h.exchange === "TASE" || h.exchange === "Tel Aviv") {
      }
      if (live) {
        let price = live.price || h.currentPrice;
        if (!price) {
          const sortedTxns = [...h.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (sortedTxns.length > 0) {
            const lastTxn = sortedTxns[sortedTxns.length - 1];
            price = lastTxn.price || lastTxn.originalPrice || 0;
          }
        }
        if (price > 0) {
          const priceCurrency = resolveTickerPriceCurrency({
            exchange: h.exchange,
            ticker: h.ticker,
            reportedCurrency: live.currency,
            stockCurrency: h.stockCurrency,
            type: live.type || h.type,
            meta: live.meta
          });
          let finalPrice = price;
          if (priceCurrency !== h.stockCurrency) {
            finalPrice = convertCurrency(price, priceCurrency, h.stockCurrency, this.exchangeRates);
          }
          h.currentPrice = finalPrice;
        }
        if (live.changePct1d !== void 0) {
          h.dayChangePct = live.changePct1d;
          h.isStaleDayChange = !!live.isStaleDayChange;
        }
        h.perf1w = calculatePersonalPerf(h, "1w", live.changePctRecent ?? live.perf1w);
        h.perf1m = calculatePersonalPerf(h, "1m", live.changePct1m ?? live.perf1m);
        h.perf3m = calculatePersonalPerf(h, "3m", live.changePct3m ?? live.perf3m);
        h.perfYtd = calculatePersonalPerf(h, "ytd", live.changePctYtd ?? live.perfYtd);
        h.perf1y = calculatePersonalPerf(h, "1y", live.changePct1y ?? live.perf1y);
        h.perf3y = calculatePersonalPerf(h, "3y", live.changePct3y ?? live.perf3y);
        h.perf5y = calculatePersonalPerf(h, "5y", live.changePct5y ?? live.perf5y);
        h.perfAll = calculatePersonalPerf(h, "all", live.changePctMax ?? live.perfAll);
        h.tickerChangePct1w = live.changePctRecent;
        h.tickerChangePct1m = live.changePct1m;
        h.tickerChangePct3m = live.changePct3m;
        h.tickerChangePctYtd = live.changePctYtd;
        h.tickerChangePct1y = live.changePct1y;
        h.tickerChangePct3y = live.changePct3y;
        h.tickerChangePct5y = live.changePct5y;
        h.tickerChangePctAll = live.changePctMax;
        if (live.name) {
          h.marketName = live.name;
        }
        if (live.nameHe) h.nameHe = live.nameHe;
        if (live.type) h.type = live.type;
        if (live.sector) h.sector = live.sector;
        if (live.meta && "underlyingAssets" in live.meta && live.meta.underlyingAssets) {
          h.underlyingAssets = live.meta.underlyingAssets;
        }
        if (live.calendarEvents) {
          h.calendarEvents = live.calendarEvents;
        }
        if (live.dividends && Array.isArray(live.dividends)) {
          const oneYearAgo = /* @__PURE__ */ new Date();
          oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
          const lastYearDivs = live.dividends.reduce((sum, d) => {
            return new Date(d.date) >= oneYearAgo ? sum + (d.amount || 0) : sum;
          }, 0);
          if (lastYearDivs > 0 && (h.currentPrice || 0) > 0) {
            h.divYield = lastYearDivs / (h.currentPrice || 1);
          }
        }
      }
    });
  }
  generateRecurringFees(priceProvider) {
    this.holdings.forEach((h) => {
      const p = this.portfolios.get(h.portfolioId);
      if (!p) return;
      const hasFeeHistory = p.feeHistory && p.feeHistory.some((f) => f.mgmtType === "percentage" && f.mgmtVal > 0);
      const hasCurrentFee = p.mgmtType === "percentage" && (p.mgmtVal || 0) > 0;
      if (!hasFeeHistory && !hasCurrentFee) return;
      if (h.transactions.length === 0) return;
      const startDate = new Date(h.transactions[0].date);
      const iter = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
      const limit = /* @__PURE__ */ new Date();
      limit.setUTCHours(23, 59, 59, 999);
      while (iter <= limit) {
        const rates = getFeeRatesForDate(p, iter);
        if (rates.mgmtVal === 0 || rates.mgmtType !== "percentage") {
          iter.setUTCMonth(iter.getUTCMonth() + 1);
          continue;
        }
        let isDue = false;
        const m = iter.getUTCMonth();
        if (rates.mgmtFreq === "monthly") isDue = true;
        else if (rates.mgmtFreq === "quarterly") isDue = m % 3 === 0;
        else if (rates.mgmtFreq === "yearly") isDue = m === 0;
        if (isDue) {
          const qtyAtDate = this.getQuantityAtDate(h, iter);
          if (qtyAtDate > 0) {
            const price = priceProvider(h.ticker, h.exchange, iter);
            if (price && price > 0) {
              let periodFactor = 1;
              if (rates.mgmtFreq === "monthly") periodFactor = 12;
              else if (rates.mgmtFreq === "quarterly") periodFactor = 4;
              const valueSC = qtyAtDate * price;
              const feeAmountSC = valueSC * (rates.mgmtVal / periodFactor);
              const feePC = convertCurrency(feeAmountSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
              if (feePC > 0) {
                h.addMgmtFee(feePC);
              }
            }
          }
        }
        iter.setUTCMonth(iter.getUTCMonth() + 1);
      }
    });
  }
  getQuantityAtDate(h, date) {
    const { vested, unvested } = this.getQtyBreakdownAtDate(h, date);
    return vested + unvested;
  }
  getQtyBreakdownAtDate(h, date) {
    const time = date.getTime();
    let vested = 0;
    let unvested = 0;
    for (const t of h.transactions) {
      const dT = coerceDate(t.date);
      if (dT && dT.getTime() > time) continue;
      if (isBuy(t.type)) {
        const qty = t.qty || 0;
        const dVest = t.vestDate ? coerceDate(t.vestDate) : null;
        const isVested = !dVest || dVest.getTime() <= time;
        if (isVested) vested += qty;
        else unvested += qty;
      }
      if (isSell(t.type)) {
        vested -= t.qty || 0;
      }
    }
    return { vested: Math.max(0, vested), unvested: Math.max(0, unvested) };
  }
  calculateSnapshot() {
    this.holdings.forEach((h) => {
      const activeLots = h.activeLots;
      const realizedLots = h.realizedLots;
      h.qtyVested = activeLots.reduce((acc, l) => acc + (l.isVested ? l.qty : 0), 0);
      h.qtyUnvested = activeLots.reduce((acc, l) => acc + (!l.isVested ? l.qty : 0), 0);
      h.qtyTotal = h.qtyVested + h.qtyUnvested;
      h.marketValueVested = { amount: h.qtyVested * h.currentPrice, currency: h.stockCurrency };
      h.marketValueUnvested = { amount: h.qtyUnvested * h.currentPrice, currency: h.stockCurrency };
      const cbVestedVal = activeLots.reduce((acc, l) => acc + (l.isVested ? convertCurrency(l.costTotal.amount, l.costTotal.currency, h.portfolioCurrency, this.exchangeRates) : 0), 0);
      const cbVestedUSD = activeLots.reduce((acc, l) => acc + (l.isVested ? l.costTotal.valUSD || 0 : 0), 0);
      const cbVestedILS = activeLots.reduce((acc, l) => acc + (l.isVested ? l.costTotal.valILS || 0 : 0), 0);
      h.costBasisVested = { amount: cbVestedVal, currency: h.portfolioCurrency, valUSD: cbVestedUSD, valILS: cbVestedILS };
      const realizedGainNetVal = realizedLots.reduce((acc, l) => acc + (l.realizedGainNet || 0), 0);
      h.realizedGainNet = { amount: realizedGainNetVal, currency: h.portfolioCurrency };
      let adjustedCost;
      {
        const currentCPI = this.cpiData ? getCPI(/* @__PURE__ */ new Date(), this.cpiData) : 100;
        let totalAdjCostPC = 0;
        let hasAdjustment = false;
        activeLots.forEach((l) => {
          const nominalCostILS = l.costTotal.valILS || convertCurrency(l.costTotal.amount, l.costTotal.currency, Currency.ILS, this.exchangeRates);
          let pureRealCostILS = nominalCostILS;
          let taxBasisCostILS = nominalCostILS;
          let adjustmentLabel = "";
          let adjustmentPct = 0;
          if (h.stockCurrency === Currency.ILS || h.stockCurrency === Currency.ILA) {
            const inflationRate = l.cpiAtBuy > 0 && currentCPI ? currentCPI / l.cpiAtBuy : 1;
            pureRealCostILS = nominalCostILS * inflationRate;
            taxBasisCostILS = nominalCostILS * Math.max(1, inflationRate);
            adjustmentLabel = "Change in CPI";
            adjustmentPct = currentCPI / l.cpiAtBuy - 1;
          } else {
            let costSC = 0;
            if (h.stockCurrency === Currency.USD && l.costTotal.valUSD) {
              costSC = l.costTotal.valUSD;
            } else if (h.stockCurrency === Currency.ILS && l.costTotal.valILS) {
              costSC = l.costTotal.valILS;
            } else {
              if (l.costPerUnit && l.costPerUnit.currency === h.stockCurrency) {
                costSC = l.costPerUnit.amount * l.qty;
              } else if (l.costTotal.currency === h.stockCurrency) {
                costSC = l.costTotal.amount;
              } else {
                costSC = convertCurrency(l.costTotal.amount, l.costTotal.currency, h.stockCurrency, this.exchangeRates);
              }
            }
            const realCostILS = convertCurrency(costSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
            pureRealCostILS = realCostILS;
            const currentPrice = h.currentPrice || 0;
            const valueSC = l.qty * currentPrice;
            const valueILS = convertCurrency(valueSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
            const gainNominal = valueILS - nominalCostILS;
            const gainReal = valueILS - realCostILS;
            let allowableGain = 0;
            let ruleUsed = "";
            if (gainNominal > 0 && gainReal > 0) {
              allowableGain = Math.min(gainNominal, gainReal);
              ruleUsed = gainNominal < gainReal ? "Lower Nominal Gain" : "Lower Real Gain";
            } else if (gainNominal < 0 && gainReal < 0) {
              allowableGain = Math.max(gainNominal, gainReal);
              ruleUsed = gainNominal > gainReal ? "Lower Nominal Loss" : "Lower Real Loss";
            } else {
              allowableGain = 0;
              ruleUsed = "Mixed (Exempt Only)";
            }
            taxBasisCostILS = valueILS - allowableGain;
            adjustmentLabel = `Tax Rule: ${ruleUsed}`;
            if (nominalCostILS !== 0) {
              adjustmentPct = taxBasisCostILS / nominalCostILS - 1;
            }
          }
          const adjCostPC = convertCurrency(taxBasisCostILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
          l.adjustedCost = adjCostPC;
          l.adjustedCostILS = taxBasisCostILS;
          l.realCostILS = pureRealCostILS;
          l.adjustmentDetails = {
            label: adjustmentLabel,
            percentage: adjustmentPct
          };
          totalAdjCostPC += adjCostPC;
          hasAdjustment = true;
        });
        if (hasAdjustment) {
          adjustedCost = totalAdjCostPC;
        }
      }
      h.adjustedCost = adjustedCost;
      h.realizedGainNet = { amount: realizedGainNetVal, currency: h.portfolioCurrency };
      const proceedsVal = realizedLots.reduce((acc, l) => {
        const cost = convertCurrency(l.costTotal.amount, l.costTotal.currency, h.portfolioCurrency, this.exchangeRates);
        const buyFee = convertCurrency(l.feesBuy.amount, l.feesBuy.currency, h.portfolioCurrency, this.exchangeRates);
        const sellFee = l.soldFees ? convertCurrency(l.soldFees.amount, l.soldFees.currency, h.portfolioCurrency, this.exchangeRates) : 0;
        const gain = l.realizedGainNet || 0;
        return acc + gain + cost + buyFee + sellFee;
      }, 0);
      const proceedsUSD = realizedLots.reduce((acc, l) => acc + (l.soldPricePerUnit?.valUSD || 0) * l.qty, 0) || void 0;
      const proceedsILS = realizedLots.reduce((acc, l) => acc + (l.soldPricePerUnit?.valILS || 0) * l.qty, 0) || void 0;
      h.proceedsTotal = { amount: proceedsVal, currency: h.portfolioCurrency, valUSD: proceedsUSD, valILS: proceedsILS };
      const cosVal = realizedLots.reduce((acc, l) => acc + convertCurrency(l.costTotal.amount, l.costTotal.currency, h.portfolioCurrency, this.exchangeRates), 0);
      const cosUSD = realizedLots.reduce((acc, l) => acc + (l.costTotal.valUSD || 0), 0) || void 0;
      const cosILS = realizedLots.reduce((acc, l) => acc + (l.costTotal.valILS || 0), 0) || void 0;
      h.costOfSoldTotal = { amount: cosVal, currency: h.portfolioCurrency, valUSD: cosUSD, valILS: cosILS };
      const activeBuyFees = activeLots.reduce((acc, l) => acc + convertCurrency(l.feesBuy.amount, l.feesBuy.currency, h.portfolioCurrency, this.exchangeRates), 0);
      const realizedFees = realizedLots.reduce((acc, l) => acc + convertCurrency(l.feesBuy.amount, l.feesBuy.currency, h.portfolioCurrency, this.exchangeRates) + (l.soldFees ? convertCurrency(l.soldFees.amount, l.soldFees.currency, h.portfolioCurrency, this.exchangeRates) : 0), 0);
      h.feesTotal = { amount: activeBuyFees + realizedFees, currency: h.portfolioCurrency };
      const divs = h._dividends || [];
      const divsVal = divs.reduce((acc, d) => acc + d.netAmountPC, 0);
      h.dividendsTotal = { amount: divsVal, currency: h.portfolioCurrency };
      const mvVestedPC = convertCurrency(h.marketValueVested.amount, h.marketValueVested.currency, h.portfolioCurrency, this.exchangeRates);
      h.unrealizedGain = { amount: mvVestedPC - cbVestedVal, currency: h.portfolioCurrency };
      const p = this.portfolios.get(h.portfolioId);
      if (p) {
        let { cgt, incTax } = getTaxRatesForDate(p, /* @__PURE__ */ new Date());
        const { taxPolicy } = p;
        if (taxPolicy === "TAX_FREE") {
          cgt = 0;
          incTax = 0;
        }
        if (taxPolicy !== "RSU_ACCOUNT") {
          incTax = 0;
        }
        const currentPriceILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, this.exchangeRates);
        const currentPriceSC = h.currentPrice;
        const currentCPI = getCPI(/* @__PURE__ */ new Date(), this.cpiData);
        let totalTaxableGainILS = 0;
        let totalWealthTaxILS = 0;
        activeLots.forEach((lot) => {
          if (!lot.isVested) return;
          const mvILS = lot.qty * currentPriceILS;
          const mvSC = lot.qty * currentPriceSC;
          const costILS = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, this.exchangeRates);
          const feesILS = lot.feesBuy.valILS || convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, Currency.ILS, this.exchangeRates);
          const feesSC = convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, h.stockCurrency, this.exchangeRates);
          let costSC = 0;
          if (h.stockCurrency === Currency.USD && lot.costTotal.valUSD) {
            costSC = lot.costTotal.valUSD;
          } else if (h.stockCurrency === Currency.ILS && lot.costTotal.valILS) {
            costSC = lot.costTotal.valILS;
          } else {
            costSC = lot.costTotal.amount / (lot.costTotal.rateToPortfolio || 1);
          }
          const gainSC = mvSC - costSC - feesSC;
          let taxableILS = 0;
          const isForeign = h.stockCurrency !== Currency.ILS;
          if (p.taxOnBase) {
            taxableILS = mvILS;
          } else if (isRealGainTaxed(taxPolicy)) {
            const nominalGainILS = mvILS - (costILS + feesILS);
            taxableILS = computeRealTaxableGain(
              nominalGainILS,
              gainSC,
              costILS + feesILS,
              h.stockCurrency,
              Currency.ILS,
              lot.cpiAtBuy,
              currentCPI,
              this.exchangeRates
            );
          } else if (taxPolicy === "NOMINAL_GAIN" && isForeign) {
            const foreignGainConvertedToILS = convertCurrency(gainSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
            taxableILS = foreignGainConvertedToILS;
          } else {
            taxableILS = mvILS - (costILS + feesILS);
          }
          totalTaxableGainILS += taxableILS;
          totalWealthTaxILS += (costILS + feesILS) * incTax;
          const lotTaxLiabilityILS = taxableILS * cgt + (costILS + feesILS) * incTax;
          lot.unrealizedTax = convertCurrency(lotTaxLiabilityILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
          lot.unrealizedTaxableGainILS = taxableILS;
          lot.currentValueILS = mvILS;
          if (isForeign) {
            lot.realCostILS = convertCurrency(costSC + feesSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
          } else {
            const inflationRate = lot.cpiAtBuy > 0 ? currentCPI / lot.cpiAtBuy : 1;
            lot.realCostILS = (costILS + feesILS) * inflationRate;
          }
        });
        h.unrealizedTaxableGainILS = totalTaxableGainILS;
        h.unrealizedTaxLiabilityILS = totalTaxableGainILS * cgt + totalWealthTaxILS;
        const realizedTaxVal = realizedLots.reduce((acc, l) => acc + (l.realizedTax || 0), 0);
        h.realizedCapitalGainsTax = realizedTaxVal;
      }
    });
  }
  getGlobalSummary(displayCurrency, filterIds) {
    const globalAcc = {
      aum: 0,
      totalUnrealized: 0,
      totalRealized: 0,
      totalCostOfSold: 0,
      totalDividends: 0,
      totalReturn: 0,
      totalDayChange: 0,
      aumWithDayChangeData: 0,
      holdingsWithDayChange: 0,
      holdingsWithStaleDayChange: 0,
      totalUnvestedValue: 0,
      totalUnvestedGain: 0,
      totalUnvestedCost: 0,
      totalFees: 0,
      totalRealizedTax: 0,
      totalUnrealizedTax: 0,
      totalDividendTax: 0
    };
    const perfAcc = {};
    Object.keys(perfPeriods).forEach((p) => {
      perfAcc[`totalChange_${p}`] = 0;
      perfAcc[`aumFor_${p}`] = 0;
      perfAcc[`holdingsFor_${p}`] = 0;
    });
    this.holdings.forEach((h) => {
      if (filterIds && !filterIds.has(h.id)) return;
      const mvTotalSC = h.marketValueVested.amount;
      const marketValue = convertCurrency(mvTotalSC, h.stockCurrency, displayCurrency, this.exchangeRates);
      const unrealizedGain = convertCurrency(h.unrealizedGain.amount, h.unrealizedGain.currency, displayCurrency, this.exchangeRates);
      const unvestedCostPC = h.activeLots.reduce((acc, l) => {
        if (l.isVested) return acc;
        return acc + convertCurrency(l.costTotal.amount, l.costTotal.currency, h.portfolioCurrency, this.exchangeRates);
      }, 0);
      const unvestedCost = convertCurrency(unvestedCostPC, h.portfolioCurrency, displayCurrency, this.exchangeRates);
      globalAcc.totalUnvestedCost += unvestedCost;
      const realizedGain = convertCurrency(h.realizedGainNet.amount, h.realizedGainNet.currency, displayCurrency, this.exchangeRates);
      const dividends = convertCurrency(h.dividendsTotal.amount, h.dividendsTotal.currency, displayCurrency, this.exchangeRates);
      const costOfSold = convertCurrency(h.costOfSoldTotal.amount, h.costOfSoldTotal.currency, displayCurrency, this.exchangeRates);
      const totalFees = convertCurrency(h.feesTotal.amount, h.feesTotal.currency, displayCurrency, this.exchangeRates);
      const totalGain = unrealizedGain + realizedGain + dividends;
      globalAcc.aum += marketValue;
      globalAcc.totalUnrealized += unrealizedGain;
      globalAcc.totalRealized += realizedGain;
      const divs = h._dividends || [];
      const divsTaxVal = divs.reduce((acc, d) => acc + (d.taxAmountPC || 0), 0);
      const divsTaxDisplay = convertCurrency(divsTaxVal, h.portfolioCurrency, displayCurrency, this.exchangeRates);
      globalAcc.totalDividendTax += divsTaxDisplay;
      const dividendsGross = dividends + divsTaxDisplay;
      globalAcc.totalCostOfSold += costOfSold;
      globalAcc.totalDividends += dividendsGross;
      globalAcc.totalReturn += totalGain + divsTaxDisplay;
      let realizedTax = convertCurrency(h.totalTaxPaidPC, h.portfolioCurrency, displayCurrency, this.exchangeRates);
      let finalFees = totalFees;
      const port = this.portfolios.get(h.portfolioId);
      if (port && port.commExemption === "sells") {
        realizedTax += finalFees;
        finalFees = 0;
      }
      globalAcc.totalFees += finalFees;
      const unrealizedTax = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, this.exchangeRates);
      globalAcc.totalRealizedTax += realizedTax;
      globalAcc.totalUnrealizedTax += unrealizedTax;
      if (h.dayChangePct !== void 0) {
        if (h.dayChangePct !== 0) {
          const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.dayChangePct, displayCurrency, this.exchangeRates);
          const dayChangeTotal = changeVal * h.qtyVested;
          globalAcc.totalDayChange += dayChangeTotal;
        }
        globalAcc.aumWithDayChangeData += marketValue;
        if (h.isStaleDayChange) {
          globalAcc.holdingsWithStaleDayChange++;
        } else {
          globalAcc.holdingsWithDayChange++;
        }
      }
      if (h.perf1w !== void 0) {
        perfAcc.totalChange_perf1w += h.perf1w * marketValue;
        perfAcc.aumFor_perf1w += marketValue;
        perfAcc.holdingsFor_perf1w++;
      }
      if (h.perf1m !== void 0) {
        perfAcc.totalChange_perf1m += h.perf1m * marketValue;
        perfAcc.aumFor_perf1m += marketValue;
        perfAcc.holdingsFor_perf1m++;
      }
      if (h.perf3m !== void 0) {
        perfAcc.totalChange_perf3m += h.perf3m * marketValue;
        perfAcc.aumFor_perf3m += marketValue;
        perfAcc.holdingsFor_perf3m++;
      }
      if (h.perfYtd !== void 0) {
        perfAcc.totalChange_perfYtd += h.perfYtd * marketValue;
        perfAcc.aumFor_perfYtd += marketValue;
        perfAcc.holdingsFor_perfYtd++;
      }
      if (h.perf1y !== void 0) {
        perfAcc.totalChange_perf1y += h.perf1y * marketValue;
        perfAcc.aumFor_perf1y += marketValue;
        perfAcc.holdingsFor_perf1y++;
      }
      if (h.perf3y !== void 0) {
        perfAcc.totalChange_perf3y += h.perf3y * marketValue;
        perfAcc.aumFor_perf3y += marketValue;
        perfAcc.holdingsFor_perf3y++;
      }
      if (h.perf5y !== void 0) {
        perfAcc.totalChange_perf5y += h.perf5y * marketValue;
        perfAcc.aumFor_perf5y += marketValue;
        perfAcc.holdingsFor_perf5y++;
      }
      if (h.perfAll !== void 0) {
        perfAcc.totalChange_perfAll += h.perfAll * marketValue;
        perfAcc.aumFor_perfAll += marketValue;
        perfAcc.holdingsFor_perfAll++;
      }
      const unvestedVal = convertCurrency(h.marketValueUnvested.amount, h.marketValueUnvested.currency, displayCurrency, this.exchangeRates);
      globalAcc.totalUnvestedValue += unvestedVal;
    });
    const summary = {
      ...INITIAL_SUMMARY,
      aum: globalAcc.aum,
      totalUnrealized: globalAcc.totalUnrealized,
      totalRealized: globalAcc.totalRealized,
      totalDividends: globalAcc.totalDividends,
      totalReturn: globalAcc.totalReturn,
      totalCostOfSold: globalAcc.totalCostOfSold,
      totalUnrealizedGainPct: globalAcc.aum - globalAcc.totalUnrealized > 0 ? globalAcc.totalUnrealized / (globalAcc.aum - globalAcc.totalUnrealized) : 0,
      totalRealizedGainPct: globalAcc.totalCostOfSold > 0 ? globalAcc.totalRealized / globalAcc.totalCostOfSold : 0,
      totalDayChange: globalAcc.totalDayChange,
      realizedGainAfterTax: globalAcc.totalRealized + globalAcc.totalDividends - Math.max(0, globalAcc.totalRealizedTax),
      totalTaxPaid: Math.max(0, globalAcc.totalRealizedTax),
      // Populate the new field
      valueAfterTax: globalAcc.aum - Math.max(0, globalAcc.totalUnrealizedTax),
      totalDayChangePct: globalAcc.aumWithDayChangeData > 0 ? globalAcc.totalDayChange / globalAcc.aumWithDayChangeData : 0,
      totalDayChangeIsIncomplete: globalAcc.holdingsWithDayChange + globalAcc.holdingsWithStaleDayChange < this.holdings.size,
      totalDayChangeIsStale: globalAcc.holdingsWithStaleDayChange > 0 && globalAcc.holdingsWithDayChange === 0,
      // Perf
      perf1w: perfAcc.aumFor_perf1w > 0 ? perfAcc.totalChange_perf1w / perfAcc.aumFor_perf1w : 0,
      perf1w_incomplete: perfAcc.aumFor_perf1w < globalAcc.aum * 0.9,
      perf1m: perfAcc.aumFor_perf1m > 0 ? perfAcc.totalChange_perf1m / perfAcc.aumFor_perf1m : 0,
      perf1m_incomplete: perfAcc.aumFor_perf1m < globalAcc.aum * 0.9,
      perf3m: perfAcc.aumFor_perf3m > 0 ? perfAcc.totalChange_perf3m / perfAcc.aumFor_perf3m : 0,
      perf3m_incomplete: perfAcc.aumFor_perf3m < globalAcc.aum * 0.9,
      perfYtd: perfAcc.aumFor_perfYtd > 0 ? perfAcc.totalChange_perfYtd / perfAcc.aumFor_perfYtd : 0,
      perfYtd_incomplete: perfAcc.aumFor_perfYtd < globalAcc.aum * 0.9,
      perf1y: perfAcc.aumFor_perf1y > 0 ? perfAcc.totalChange_perf1y / perfAcc.aumFor_perf1y : 0,
      perf1y_incomplete: perfAcc.aumFor_perf1y < globalAcc.aum * 0.9,
      perf3y: perfAcc.aumFor_perf3y > 0 ? perfAcc.totalChange_perf3y / perfAcc.aumFor_perf3y : 0,
      perf3y_incomplete: perfAcc.aumFor_perf3y < globalAcc.aum * 0.9,
      perf5y: perfAcc.aumFor_perf5y > 0 ? perfAcc.totalChange_perf5y / perfAcc.aumFor_perf5y : 0,
      perf5y_incomplete: perfAcc.aumFor_perf5y < globalAcc.aum * 0.9,
      perfAll: perfAcc.aumFor_perfAll > 0 ? perfAcc.totalChange_perfAll / perfAcc.aumFor_perfAll : 0,
      perfAll_incomplete: perfAcc.aumFor_perfAll < globalAcc.aum * 0.9,
      totalUnvestedValue: globalAcc.totalUnvestedValue,
      totalUnvestedGain: globalAcc.totalUnvestedValue - globalAcc.totalUnvestedCost,
      totalUnvestedGainPct: globalAcc.totalUnvestedCost > 0 ? (globalAcc.totalUnvestedValue - globalAcc.totalUnvestedCost) / globalAcc.totalUnvestedCost : 0
    };
    return summary;
  }
};

// src/lib/dashboard_calc.ts
function calculateDashboardSummary(data, displayCurrency, exchangeRates, portfoliosMap, engine) {
  if (!engine) return { summary: INITIAL_SUMMARY, holdings: [] };
  const dataKeys = new Set(data.map((d) => d.key || d.id));
  const summary = engine.getGlobalSummary(displayCurrency, dataKeys);
  const unifiedHoldings = Array.from(engine.holdings.values());
  const filteredUnified = unifiedHoldings.filter((h) => dataKeys.has(h.id));
  const enrichedHoldings = filteredUnified.map((h) => {
    const getHistoricalVal = (money) => {
      if (displayCurrency === Currency.ILS && money.valILS !== void 0) return money.valILS;
      if (displayCurrency === Currency.USD && money.valUSD !== void 0) return money.valUSD;
      return convertCurrency(money.amount, money.currency, displayCurrency, exchangeRates);
    };
    const mvVested = h.marketValueVested;
    const marketValue = convertCurrency(mvVested.amount, mvVested.currency, displayCurrency, exchangeRates);
    const costBasisDisplay = getHistoricalVal(h.costBasisVested);
    const unrealizedGain = marketValue - costBasisDisplay;
    const dividendsNet = h.dividends.reduce((sum, d) => {
      let netValDisplay = 0;
      const grossValDisplay = getHistoricalVal(d.grossAmount);
      const cashedNet = d.cashedAmount !== void 0 ? d.cashedAmount : d.netAmountPC;
      if (d.grossAmount.amount !== 0 && d.netAmountPC > 0) {
        const ratio = cashedNet / d.netAmountPC;
        const originalRatio = d.netAmountPC / d.grossAmount.amount;
        netValDisplay = grossValDisplay * originalRatio * ratio;
      } else {
        netValDisplay = convertCurrency(cashedNet, h.portfolioCurrency, displayCurrency, exchangeRates);
      }
      return sum + netValDisplay;
    }, 0);
    const rawDivs = h._dividends || [];
    let dividendsGross = 0;
    if (rawDivs.length > 0) {
      dividendsGross = rawDivs.reduce((sum, d) => {
        const grossValDisplay = getHistoricalVal(d.grossAmount);
        if (d.cashedAmount !== void 0) {
          const cashedGrossPC = d.cashedAmount + (d.taxCashedPC || 0) + (d.feeCashedPC || 0);
          const totalGrossPC = cashedGrossPC + (d.reinvestedAmount || 0) + (d.taxReinvestedPC || 0) + (d.feeReinvestedPC || 0);
          const ratio = totalGrossPC > 0 ? cashedGrossPC / totalGrossPC : 0;
          return sum + grossValDisplay * ratio;
        }
        return sum + grossValDisplay;
      }, 0);
    } else {
      const divTaxToDeduct = h._dividends ? h._dividends.reduce((acc, d) => acc + (d.taxAmountPC || 0), 0) : 0;
      const divTaxDisplay = convertCurrency(divTaxToDeduct, h.portfolioCurrency, displayCurrency, exchangeRates);
      dividendsGross = dividendsNet + divTaxDisplay;
    }
    const costOfSoldDisplay = getHistoricalVal(h.costOfSoldTotal);
    const proceedsDisplay = getHistoricalVal(h.proceedsTotal);
    const realizedSellsGross = proceedsDisplay - costOfSoldDisplay;
    const realizedGainGross = realizedSellsGross + dividendsGross;
    let feesDisplay = convertCurrency(h.feesTotal.amount, h.feesTotal.currency, displayCurrency, exchangeRates);
    let realizedTaxDisplay = h.realizedLots.reduce((sum, lot) => {
      return sum + convertCurrency((lot.realizedTaxPC || 0) + (lot.realizedIncomeTaxPC || 0), h.portfolioCurrency, displayCurrency, exchangeRates);
    }, 0);
    const port = portfoliosMap.get(h.portfolioId);
    if (port && port.commExemption === "sells") {
      realizedTaxDisplay += feesDisplay;
      feesDisplay = 0;
    }
    const realizedSellsNet = realizedSellsGross - feesDisplay - realizedTaxDisplay;
    const realizedGainNet = realizedSellsNet + dividendsNet;
    const totalGain = unrealizedGain + realizedGainGross;
    const unrealizedTaxDisplay = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, exchangeRates);
    const valueAfterTax = marketValue - unrealizedTaxDisplay;
    const realizedGainAfterTax = realizedGainNet;
    const realizedTax = realizedTaxDisplay;
    const unvestedVal = convertCurrency(h.marketValueUnvested.amount, h.marketValueUnvested.currency, displayCurrency, exchangeRates);
    let dayChangeVal = 0;
    let dayChangePct = h.dayChangePct;
    if (dayChangePct !== 0) {
      const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, dayChangePct, displayCurrency, exchangeRates);
      dayChangeVal = changeVal * h.qtyVested;
    }
    let dividendYield1y = h.divYield;
    const display = {
      marketValue,
      unrealizedGain,
      // Use definition from line 69
      unrealizedGainPct: costBasisDisplay > 0 ? unrealizedGain / costBasisDisplay : 0,
      realizedGain: realizedGainGross,
      realizedGainGross,
      realizedGainNet,
      // realizedGainPct: yield on SOLD portion only (pure trade performance)
      realizedGainPct: costOfSoldDisplay > 0 ? realizedSellsGross / costOfSoldDisplay : 0,
      realizedGainAfterTax,
      totalGain,
      totalGainPct: costBasisDisplay + costOfSoldDisplay > 0 ? totalGain / (costBasisDisplay + costOfSoldDisplay) : 0,
      valueAfterTax,
      dayChangeVal,
      dayChangePct,
      costBasis: costBasisDisplay,
      costOfSold: costOfSoldDisplay,
      proceeds: proceedsDisplay,
      dividends: dividendsNet,
      // Net
      dividendsGross,
      fees: feesDisplay,
      dividendYield1y,
      currentPrice: convertCurrency(h.currentPrice, h.stockCurrency, displayCurrency, exchangeRates),
      avgCost: h.qtyVested > 0 ? costBasisDisplay / h.qtyVested : 0,
      weightInPortfolio: 0,
      weightInGlobal: 0,
      unvestedValue: unvestedVal,
      realizedTax: realizedTaxDisplay,
      unrealizedTax: unrealizedTaxDisplay
    };
    const pName = portfoliosMap.get(h.portfolioId)?.name || h.portfolioId;
    return {
      ...h,
      // Holding spread (careful, it has private fields but they won't enumerate usually, or will they?)
      // We should explicit mapping if we don't want private fields.
      // But consumers likely just access public props.
      id: h.id,
      ticker: h.ticker,
      exchange: h.exchange,
      displayName: h.marketName || h.customName || h.name || h.ticker,
      // Short name preferred for table? User said "For the table use the short name"
      // Wait, user said: "use the short name, but use the long in most other places".
      // DashboardTable uses `displayName`. So `displayName` should be Short (Market).
      // And we should pass Long Name separately?
      // Let's add `longName` to EnrichedDashboardHolding.
      longName: h.customName || h.name || h.marketName || h.ticker,
      nameHe: h.nameHe,
      // Map nameHe
      portfolioId: h.portfolioId,
      portfolioName: pName,
      activeLots: h.activeLots,
      realizedLots: h.realizedLots,
      transactions: h.transactions,
      dividends: h.dividends,
      qtyTotal: h.qtyTotal,
      // Mapped from getter
      avgHoldingTimeYears: h.avgHoldingTimeYears,
      avgYearlyReturn: h.avgYearlyReturn,
      realizedTax,
      // Added
      underlyingAssets: h.underlyingAssets,
      calendarEvents: h.calendarEvents,
      display
    };
  });
  const portfolioAum = /* @__PURE__ */ new Map();
  enrichedHoldings.forEach((h) => {
    portfolioAum.set(h.portfolioId, (portfolioAum.get(h.portfolioId) || 0) + h.display.marketValue);
  });
  enrichedHoldings.forEach((h) => {
    h.display.weightInGlobal = summary.aum > 0 ? h.display.marketValue / summary.aum : 0;
    const pAum = portfolioAum.get(h.portfolioId) || 0;
    h.display.weightInPortfolio = pAum > 0 ? h.display.marketValue / pAum : 0;
  });
  return { summary, holdings: enrichedHoldings };
}

// src/lib/sheets/formulas.ts
function getGoogleFinanceFormula(query, attribute, dateExpression) {
  const dateArg = dateExpression ? `, ${dateExpression}` : "";
  return `IFERROR(INDEX(GOOGLEFINANCE(${query}, "${attribute}"${dateArg}), 2, 2), "")`;
}
function getHistoricalPriceFormula(tickerOrPair, dateExpression, isCurrency = false) {
  const query = isCurrency ? `"CURRENCY:${tickerOrPair}"` : tickerOrPair;
  return getGoogleFinanceFormula(query, "price", dateExpression);
}

// src/lib/sheets/config.ts
var TXN_COLS = {
  date: { key: "date", colName: "Date", colId: "A" },
  portfolioId: { key: "portfolioId", colName: "Portfolio", colId: "B" },
  ticker: { key: "ticker", colName: "Ticker", colId: "C" },
  exchange: { key: "exchange", colName: "Exchange", colId: "D" },
  type: { key: "type", colName: "Type", colId: "E" },
  originalQty: { key: "originalQty", colName: "Original_Qty", colId: "F", numeric: true },
  originalPrice: { key: "originalPrice", colName: "Original_Price", colId: "G", numeric: true },
  currency: { key: "currency", colName: "Currency", colId: "H" },
  // Original_Price_ILA: Converts the original price to ILA (Agorot).
  // If currency is ILS, price is in ILS, so * 100.
  // If currency is USD, price is USD, so * USDILS * 100.
  // If other, convert to ILS then * 100.
  originalPriceILA: {
    key: "originalPriceILA",
    colName: "Original_Price_ILA",
    colId: "I",
    numeric: true,
    formula: (rowNum, cols) => {
      const txnCurr = `${cols.currency.colId}${rowNum}`;
      const origPrice = `${cols.originalPrice.colId}${rowNum}`;
      const txnDate = `${cols.date.colId}${rowNum}`;
      const usdToIlsFormula = getHistoricalPriceFormula("USDILS", txnDate, true);
      return `=IF(${txnCurr}="ILA", ${origPrice}, IF(${txnCurr}="ILS", ${origPrice}*100, IF(${txnCurr}="USD", ${origPrice} * ${usdToIlsFormula} * 100, ${origPrice} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${txnCurr} & "ILS", "price", ${txnDate}), 2, 2) * 100)))`;
    }
  },
  // Original_Price_USD: Converts the original transaction price to USD.
  originalPriceUSD: {
    key: "originalPriceUSD",
    colName: "Original_Price_USD",
    colId: "J",
    numeric: true,
    formula: (rowNum, cols) => {
      const txnCurr = `${cols.currency.colId}${rowNum}`;
      const origPrice = `${cols.originalPrice.colId}${rowNum}`;
      const txnDate = `${cols.date.colId}${rowNum}`;
      const usdIlsFormula = getHistoricalPriceFormula("USDILS", txnDate, true);
      return `=IF(${txnCurr}="USD", ${origPrice}, IF(${txnCurr}="ILA", ${origPrice} / 100 / ${usdIlsFormula}, IF(${txnCurr}="ILS", ${origPrice} / ${usdIlsFormula}, ${origPrice} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${txnCurr} & "USD", "price", ${txnDate}), 2, 2))))`;
    }
  },
  vestDate: { key: "vestDate", colName: "Vesting_Date", colId: "K" },
  comment: { key: "comment", colName: "Comments", colId: "L" },
  commission: { key: "commission", colName: "Commission", colId: "M", numeric: true },
  source: { key: "source", colName: "Source", colId: "N" },
  creationDate: { key: "creationDate", colName: "Creation_Date", colId: "O" },
  origOpenPriceAtCreationDate: { key: "origOpenPriceAtCreationDate", colName: "Orig_Open_Price_At_Creation_Date", colId: "P", numeric: true },
  splitAdjOpenPrice: {
    key: "splitAdjOpenPrice",
    colName: "Split_Adj_Open_Price",
    colId: "Q",
    numeric: true,
    formula: (rowNum, cols) => `=INDEX(GOOGLEFINANCE(IF(${cols.gfExchange.colId}${rowNum}="", ${cols.ticker.colId}${rowNum}, ${cols.gfExchange.colId}${rowNum}&":"&${cols.ticker.colId}${rowNum}), "open", ${cols.creationDate.colId}${rowNum}), 2, 2)`
  },
  splitRatio: {
    key: "splitRatio",
    colName: "Split_Ratio",
    colId: "R",
    numeric: true,
    formula: (rowNum, cols) => `=ROUND(IFERROR(IF(OR(ISBLANK(${cols.splitAdjOpenPrice.colId}${rowNum}), ${cols.splitAdjOpenPrice.colId}${rowNum}=0, ISBLANK(${cols.origOpenPriceAtCreationDate.colId}${rowNum})), 1, ${cols.origOpenPriceAtCreationDate.colId}${rowNum} / ${cols.splitAdjOpenPrice.colId}${rowNum}), 1), 2)`
  },
  splitAdjustedPrice: {
    key: "splitAdjustedPrice",
    colName: "Split_Adjusted_Price",
    colId: "S",
    numeric: true,
    formula: (rowNum, cols) => `=IFERROR(${cols.originalPrice.colId}${rowNum} / ${cols.splitRatio.colId}${rowNum}, ${cols.originalPrice.colId}${rowNum})`
  },
  splitAdjustedQty: {
    key: "splitAdjustedQty",
    colName: "Split_Adjusted_Qty",
    colId: "T",
    numeric: true,
    formula: (rowNum, cols) => `=IFERROR(${cols.originalQty.colId}${rowNum} * ${cols.splitRatio.colId}${rowNum}, ${cols.originalQty.colId}${rowNum})`
  },
  numericId: {
    key: "numericId",
    colName: "Numeric_ID",
    colId: "U",
    numeric: true
  },
  gfExchange: {
    key: "gfExchange",
    colName: "GF_Exchange",
    colId: "V"
  }
};
var transactionHeaders = Object.values(TXN_COLS).sort((a, b) => {
  const lenDiff = a.colId.length - b.colId.length;
  return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
}).map((c) => c.colName);
var transactionMapping = Object.keys(TXN_COLS).reduce((acc, key) => {
  const k = key;
  if (TXN_COLS[k]) {
    acc[k] = TXN_COLS[k].colName;
  }
  return acc;
}, {});
var transactionNumericKeys = Object.keys(TXN_COLS).filter((key) => TXN_COLS[key].numeric).map((key) => key);
var portfolioHeaders = ["Portfolio_ID", "Display_Name", "Cap_Gains_Tax_Rate", "Income_Tax_Rate", "Mgmt_Fee_Val", "Mgmt_Type", "Mgmt_Freq", "Comm_Rate_%", "Comm_Min", "Comm_Max_Fee", "Currency", "Div_Policy", "Div_Comm_Rate_%", "Comm_Exemption", "Tax_Policy", "Tax_On_Base", "Tax_History", "Fee_History", "Is_Crypto", "Conversion_Fee_Val", "Conversion_Fee_Type"];
var holdingsHeaders = [
  "Ticker",
  "Exchange",
  "Live_Price",
  "Currency",
  "Total Holding Value",
  "Name_En",
  "Name_He",
  "Sector",
  "Type",
  "Day_Change",
  "Change_1W",
  "Change_1M",
  "Change_3M",
  "Change_YTD",
  "Change_1Y",
  "Change_3Y",
  "Change_5Y",
  "Change_10Y",
  "Numeric_ID",
  "GF_Exchange"
];
var configHeaders = ["Key", "Value", "1D Ago", "1W Ago", "1M Ago", "3M Ago", "6M Ago", "YTD", "1Y Ago", "3Y Ago", "5Y Ago"];
var DEFAULT_SHEET_NAME = import.meta.env?.DEV ? "Portfolios_App_Data_Dev" : "Portfolios_App_Data";
var PORTFOLIO_SHEET_NAME = "Portfolio_Options";
var PORT_OPT_RANGE = `${PORTFOLIO_SHEET_NAME}!A2:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`;
var TX_SHEET_NAME = "Transaction_Log";
var TX_FETCH_RANGE = `${TX_SHEET_NAME}!A2:${String.fromCharCode(65 + transactionHeaders.length - 1)}`;
var CONFIG_SHEET_NAME = "Currency_Conversions";
var CONFIG_RANGE = `${CONFIG_SHEET_NAME}!A2:K`;
var METADATA_SHEET = "App_Metadata";
var metadataHeaders = ["Key", "Value"];
var METADATA_RANGE = METADATA_SHEET + "!A:B";
var HOLDINGS_SHEET = "Holdings";
var HOLDINGS_RANGE = `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}`;
var DIV_SHEET_NAME = "Dividends";
var dividendHeaders = ["Exchange", "Ticker", "Date", "Div_Amount", "Source", "Asset_Price_At_Time", "Asset_Price_Currency", "Div_Currency"];
var DIVIDENDS_RANGE = `${DIV_SHEET_NAME}!A2:H`;
var EXTERNAL_DATASETS_SHEET_NAME = "External_Datasets";
var EXTERNAL_DATASETS_RANGE = `${EXTERNAL_DATASETS_SHEET_NAME}!A2:E`;
var TRACKING_LISTS_SHEET_NAME = "Tracking_Lists";
var TRACKING_LISTS_RANGE = `${TRACKING_LISTS_SHEET_NAME}!A2:E`;
var portfolioMapping = {
  id: "Portfolio_ID",
  name: "Display_Name",
  cgt: "Cap_Gains_Tax_Rate",
  incTax: "Income_Tax_Rate",
  mgmtVal: "Mgmt_Fee_Val",
  mgmtType: "Mgmt_Type",
  mgmtFreq: "Mgmt_Freq",
  commRate: "Comm_Rate_%",
  commMin: "Comm_Min",
  commMax: "Comm_Max_Fee",
  currency: "Currency",
  divPolicy: "Div_Policy",
  divCommRate: "Div_Comm_Rate_%",
  commExemption: "Comm_Exemption",
  taxPolicy: "Tax_Policy",
  taxOnBase: "Tax_On_Base",
  taxHistory: "Tax_History",
  feeHistory: "Fee_History",
  isCrypto: "Is_Crypto",
  conversionFeeVal: "Conversion_Fee_Val",
  conversionFeeType: "Conversion_Fee_Type"
};
var portfolioNumericKeys = ["cgt", "incTax", "mgmtVal", "commRate", "commMin", "commMax", "divCommRate", "conversionFeeVal"];
var holdingMapping = {
  ticker: "Ticker",
  exchange: "Exchange",
  price: "Live_Price",
  currency: "Currency",
  totalValue: "Total Holding Value",
  name: "Name_En",
  nameHe: "Name_He",
  sector: "Sector",
  type: "Type",
  changePct1d: "Day_Change",
  changePctRecent: "Change_1W",
  changePct1m: "Change_1M",
  changePct3m: "Change_3M",
  changePctYtd: "Change_YTD",
  changePct1y: "Change_1Y",
  changePct3y: "Change_3Y",
  changePct5y: "Change_5Y",
  changePct10y: "Change_10Y",
  numericId: "Numeric_ID",
  gfExchange: "GF_Exchange"
};
var holdingNumericKeys = [
  "price",
  "totalValue",
  "changePct1d",
  "changePctRecent",
  "changePct1m",
  "changePct3m",
  "changePctYtd",
  "changePct1y",
  "changePct3y",
  "changePct5y",
  "changePct10y",
  "numericId"
];

// src/agent/workerRuntime.ts
var AgentApiError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
};
function createPureRowMapper(headers) {
  const headerMap = new Map(headers.map((h, i) => [h, i]));
  return (row, mapping, numericKeys = []) => {
    const obj = {};
    for (const key in mapping) {
      const headerName = mapping[key];
      const index = headerMap.get(headerName);
      if (index !== void 0 && row[index] !== void 0 && row[index] !== null) {
        const value = row[index];
        if (numericKeys.includes(key)) {
          if (String(value).trim() === "") {
            obj[key] = void 0;
          } else {
            const strVal = String(value).trim();
            const isPercentage = strVal.endsWith("%");
            const numVal = parseFloat(strVal.replace(/,/g, "").replace(/%/, ""));
            obj[key] = isNaN(numVal) ? void 0 : isPercentage ? numVal / 100 : numVal;
          }
        } else {
          obj[key] = typeof value === "number" ? String(value) : value;
        }
      }
    }
    return obj;
  };
}
var mapRowToPortfolio = createPureRowMapper(portfolioHeaders);
var mapRowToTransaction = createPureRowMapper(transactionHeaders);
var mapRowToHolding = createPureRowMapper(holdingsHeaders);
var escapeSheetString = (str) => str ? str.replace(/"/g, '""') : "";
var sortedTxnColDefs = Object.values(TXN_COLS).sort((a, b) => {
  const lenDiff = a.colId.length - b.colId.length;
  return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
});
var SheetsRestClient = class {
  spreadsheetId;
  accessToken;
  sheetIdCache = null;
  constructor(spreadsheetId, accessToken) {
    this.spreadsheetId = spreadsheetId;
    this.accessToken = accessToken;
  }
  async request(path, init) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers || {}
      }
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Google Sheets API error (${res.status})`;
      throw new AgentApiError(res.status === 401 || res.status === 403 ? res.status : 400, msg);
    }
    return res.json();
  }
  async verifyAccess() {
    const meta = await this.request("?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)");
    this.sheetIdCache = /* @__PURE__ */ new Map();
    for (const s of meta.sheets || []) {
      if (s.properties?.title !== void 0 && s.properties?.sheetId !== void 0) {
        this.sheetIdCache.set(s.properties.title, s.properties.sheetId);
      }
    }
    return {
      spreadsheetId: meta.spreadsheetId,
      title: meta.properties?.title || ""
    };
  }
  async getSheetNumericId(sheetName, createIfMissing = false) {
    if (!this.sheetIdCache) {
      await this.verifyAccess();
    }
    const existing = this.sheetIdCache.get(sheetName);
    if (existing !== void 0) return existing;
    if (!createIfMissing) {
      throw new AgentApiError(400, `Sheet '${sheetName}' not found in spreadsheet.`);
    }
    const batchRes = await this.batchUpdate([
      { addSheet: { properties: { title: sheetName } } }
    ]);
    const newId = batchRes.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    this.sheetIdCache.set(sheetName, newId);
    return newId;
  }
  async getValues(range, valueRenderOption = "UNFORMATTED_VALUE") {
    try {
      const data = await this.request(
        `/values/${encodeURIComponent(range)}?valueRenderOption=${valueRenderOption}`
      );
      return data.values || [];
    } catch (e) {
      if (e instanceof AgentApiError && e.status === 400 && e.message.includes("Unable to parse range")) {
        return [];
      }
      throw e;
    }
  }
  async batchGetValues(ranges, valueRenderOption = "UNFORMATTED_VALUE") {
    const params = new URLSearchParams({ valueRenderOption });
    for (const r of ranges) {
      params.append("ranges", r);
    }
    const data = await this.request(`/values:batchGet?${params.toString()}`);
    const out = {};
    const valueRanges = data.valueRanges || [];
    ranges.forEach((r, idx) => {
      out[r] = valueRanges[idx]?.values || [];
    });
    return out;
  }
  async updateValues(range, values, valueInputOption = "USER_ENTERED") {
    return this.request(
      `/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
      {
        method: "PUT",
        body: JSON.stringify({ values })
      }
    );
  }
  async appendValues(range, values, valueInputOption = "USER_ENTERED", insertDataOption = "INSERT_ROWS") {
    return this.request(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`,
      {
        method: "POST",
        body: JSON.stringify({ values })
      }
    );
  }
  async clearValues(range) {
    return this.request(`/values/${encodeURIComponent(range)}:clear`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }
  async batchUpdate(requests) {
    return this.request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests })
    });
  }
  async getMetadataMap() {
    const rows = await this.getValues(METADATA_RANGE, "FORMATTED_VALUE");
    const keyIdx = metadataHeaders.indexOf("Key");
    const valIdx = metadataHeaders.indexOf("Value");
    const map = {};
    for (const r of rows) {
      if (r[keyIdx]) {
        map[String(r[keyIdx])] = r[valIdx] !== void 0 && r[valIdx] !== null ? String(r[valIdx]) : "";
      }
    }
    return map;
  }
  async setMetadataValue(key, value) {
    await this.getSheetNumericId(METADATA_SHEET, true);
    const rows = await this.getValues(METADATA_RANGE, "FORMATTED_VALUE");
    const keyIdx = metadataHeaders.indexOf("Key");
    const existingIdx = rows.findIndex((r) => String(r[keyIdx]) === key);
    if (existingIdx > -1) {
      const rowNum = existingIdx + 1;
      await this.updateValues(`${METADATA_SHEET}!B${rowNum}`, [[value]], "RAW");
    } else {
      await this.appendValues(`${METADATA_SHEET}!A:B`, [[key, value]], "RAW", "INSERT_ROWS");
    }
  }
};
async function verifySheetAgentKey(sheets, expectedKeyHash) {
  const meta = await sheets.getMetadataMap();
  const activeHash = (meta["agent_api_key_hash"] || "").trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, "Agent private key is invalid, revoked, or rotated for this spreadsheet.");
  }
  return meta;
}
function extractXmlTag(xml, tag) {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return "";
  return match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function extractXmlNumber(xml, tag) {
  const nilRegex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*xsi:nil="true"[^>]*\\/?>`, "i");
  if (nilRegex.test(xml)) return void 0;
  const val = extractXmlTag(xml, tag);
  if (!val || val.toLowerCase() === "null") return void 0;
  const n = parseFloat(val);
  return isNaN(n) ? void 0 : n;
}
function toYahooSymbol(ticker, exchange) {
  const clean = ticker.trim().toUpperCase();
  if (exchange === Exchange.CBS || exchange === Exchange.BOI || exchange === Exchange.GEMEL || exchange === Exchange.PENSION || exchange === Exchange.CASH) {
    return null;
  }
  if (clean.startsWith("^")) return clean;
  if (exchange === Exchange.TASE) {
    if (clean === "137") return "^TA125.TA";
    if (clean === "142") return "^TA35.TA";
    if (/^\d+$/.test(clean) || clean.includes("-")) return null;
    return `${clean.replace(/\./g, "-")}.TA`;
  }
  if (exchange === Exchange.FOREX) {
    return clean.endsWith("=X") ? clean : `${clean.replace("/", "")}=X`;
  }
  const suffixMap = {
    [Exchange.LSE]: ".L",
    [Exchange.FWB]: ".DE",
    [Exchange.SWX]: ".SW",
    [Exchange.JPX]: ".T",
    [Exchange.HKEX]: ".HK",
    [Exchange.TSX]: ".TO",
    [Exchange.ASX]: ".AX",
    [Exchange.KSE]: ".KS"
  };
  const suffix = suffixMap[exchange] || "";
  return `${clean.replace(/\./g, "-")}${suffix}`;
}
function computePeriodChangesFromHistory(price, historical, prevClose) {
  const out = {};
  if (prevClose && prevClose > 0) {
    out.changePct1d = (price - prevClose) / prevClose;
  } else if (historical.length >= 2) {
    const prev = historical[historical.length - 2].price;
    if (prev > 0) out.changePct1d = (price - prev) / prev;
  }
  const findPriceOnOrBefore = (targetDate) => {
    const targetMs = targetDate.getTime();
    for (let i = historical.length - 1; i >= 0; i--) {
      if (historical[i].date.getTime() <= targetMs && historical[i].price > 0) {
        return historical[i].price;
      }
    }
    return void 0;
  };
  const now = /* @__PURE__ */ new Date();
  const d1w = new Date(now);
  d1w.setDate(now.getDate() - 7);
  const d1m = new Date(now);
  d1m.setMonth(now.getMonth() - 1);
  const d3m = new Date(now);
  d3m.setMonth(now.getMonth() - 3);
  const dYtd = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59));
  const d1y = new Date(now);
  d1y.setFullYear(now.getFullYear() - 1);
  const d3y = new Date(now);
  d3y.setFullYear(now.getFullYear() - 3);
  const d5y = new Date(now);
  d5y.setFullYear(now.getFullYear() - 5);
  const calc = (ref) => ref && ref > 0 ? (price - ref) / ref : void 0;
  out.changePctRecent = calc(findPriceOnOrBefore(d1w));
  out.changePct1m = calc(findPriceOnOrBefore(d1m));
  out.changePct3m = calc(findPriceOnOrBefore(d3m));
  out.changePctYtd = calc(findPriceOnOrBefore(dYtd));
  out.changePct1y = calc(findPriceOnOrBefore(d1y));
  out.changePct3y = calc(findPriceOnOrBefore(d3y));
  out.changePct5y = calc(findPriceOnOrBefore(d5y));
  return out;
}
var WorkerMarketService = class {
  invokeProxy;
  constructor(invokeProxy) {
    this.invokeProxy = invokeProxy;
  }
  async fetchYahooData(ticker, exchange, includeQuoteSummary = false) {
    const yahooSym = toYahooSymbol(ticker, exchange);
    if (!yahooSym) return null;
    try {
      const histRes = await this.invokeProxy("yahoo_hist", { ticker: yahooSym, range: "5y" });
      if (!histRes.ok) return null;
      const histJson = await histRes.json().catch(() => null);
      const result = histJson?.chart?.result?.[0];
      if (!result?.meta) return null;
      const meta = result.meta;
      let currency = Currency.USD;
      try {
        currency = meta.currency === "ILA" ? Currency.ILA : normalizeCurrency(meta.currency || "USD");
      } catch {
        currency = exchange === Exchange.TASE ? Currency.ILA : Currency.USD;
      }
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const historical = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c !== null && c !== void 0 && !isNaN(c) && c > 0) {
          historical.push({ date: new Date(timestamps[i] * 1e3), price: c });
        }
      }
      const price = Number(meta.regularMarketPrice) || (historical.length > 0 ? historical[historical.length - 1].price : 0);
      if (!price) return null;
      const dividends = [];
      const rawDivs = result.events?.dividends;
      if (rawDivs && typeof rawDivs === "object") {
        for (const key of Object.keys(rawDivs)) {
          const d = rawDivs[key];
          if (d?.date && d?.amount) {
            dividends.push({
              date: new Date(d.date * 1e3),
              amount: Number(d.amount),
              currency: currency === Currency.ILA ? Currency.ILS : currency
            });
          }
        }
        dividends.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
      const changes = computePeriodChangesFromHistory(price, historical, meta.chartPreviousClose || meta.previousClose);
      const out = {
        ticker: ticker.toUpperCase(),
        exchange,
        numericId: null,
        price,
        openPrice: meta.regularMarketOpen ? Number(meta.regularMarketOpen) : void 0,
        currency,
        name: meta.longName || meta.shortName || ticker.toUpperCase(),
        historical,
        dividends,
        source: "Yahoo",
        timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1e3) : /* @__PURE__ */ new Date(),
        ...changes
      };
      if (includeQuoteSummary) {
        try {
          const qsRes = await this.invokeProxy("yahoo_quote_summary", {
            ticker: yahooSym,
            modules: "calendarEvents,defaultKeyStatistics,financialData,recommendationTrend,price,summaryDetail,assetProfile"
          });
          if (qsRes.ok) {
            const qsJson = await qsRes.json().catch(() => null);
            const qs = qsJson?.quoteSummary?.result?.[0];
            if (qs) {
              out.sector = qs.assetProfile?.sector || void 0;
              const earningsArr = qs.calendarEvents?.earnings?.earningsDate;
              const earningsDate = Array.isArray(earningsArr) && earningsArr[0]?.raw ? new Date(earningsArr[0].raw * 1e3) : void 0;
              const exDividendDate = qs.calendarEvents?.exDividendDate?.raw ? new Date(qs.calendarEvents.exDividendDate.raw * 1e3) : void 0;
              const dividendDate = qs.calendarEvents?.dividendDate?.raw ? new Date(qs.calendarEvents.dividendDate.raw * 1e3) : void 0;
              if (earningsDate || exDividendDate || dividendDate) {
                out.calendarEvents = {
                  earningsDate,
                  exDividendDate,
                  dividendDate,
                  dividendCurrency: currency === Currency.ILA ? Currency.ILS : currency
                };
              }
              out.fundamentals = {
                sector: qs.assetProfile?.sector,
                industry: qs.assetProfile?.industry,
                marketCap: qs.price?.marketCap?.raw ?? qs.summaryDetail?.marketCap?.raw,
                trailingPE: qs.summaryDetail?.trailingPE?.raw,
                forwardPE: qs.summaryDetail?.forwardPE?.raw ?? qs.defaultKeyStatistics?.forwardPE?.raw,
                epsTrailingTwelveMonths: qs.defaultKeyStatistics?.trailingEps?.raw,
                dividendYield: qs.summaryDetail?.dividendYield?.raw,
                dividendRate: qs.summaryDetail?.dividendRate?.raw,
                fiftyTwoWeekHigh: qs.summaryDetail?.fiftyTwoWeekHigh?.raw,
                fiftyTwoWeekLow: qs.summaryDetail?.fiftyTwoWeekLow?.raw,
                beta: qs.summaryDetail?.beta?.raw ?? qs.defaultKeyStatistics?.beta?.raw,
                targetMeanPrice: qs.financialData?.targetMeanPrice?.raw,
                recommendationKey: qs.financialData?.recommendationKey
              };
            }
          }
        } catch {
        }
      }
      return out;
    } catch {
      return null;
    }
  }
  async fetchGlobesData(ticker, exchange, numericId) {
    const globesEx = EXCHANGE_SETTINGS[exchange]?.globesCode;
    if (!globesEx) return null;
    const identifier = exchange === Exchange.TASE && numericId ? String(numericId) : ticker.toUpperCase().replace(/^\^/, "");
    if (exchange === Exchange.TASE && !numericId && !/^\d+$/.test(identifier)) {
      return null;
    }
    try {
      const res = await this.invokeProxy("globes_data", { exchange: globesEx, ticker: identifier });
      if (!res.ok) return null;
      const xml = await res.text();
      if (!xml || !xml.includes("Instrument")) return null;
      const last = extractXmlNumber(xml, "last");
      if (last === void 0) return null;
      const currencyRate = extractXmlNumber(xml, "CurrencyRate") ?? 1;
      const rawCurrency = extractXmlTag(xml, "currency") || "ILS";
      let currency = Currency.ILA;
      try {
        const base = normalizeCurrency(rawCurrency);
        currency = currencyRate === 0.01 && base === Currency.ILS ? Currency.ILA : base;
      } catch {
        currency = Currency.ILA;
      }
      let pct1d = extractXmlNumber(xml, "percentageChange");
      if ((pct1d === void 0 || pct1d === 0) && last !== 0) {
        const chg = extractXmlNumber(xml, "change") || 0;
        const prev = last - chg;
        if (chg !== 0 && prev !== 0) pct1d = chg / prev * 100;
      }
      const calcRel = (prev) => prev && prev > 0 && prev !== last ? (last - prev) / prev : void 0;
      const ytdRaw = extractXmlNumber(xml, "ChangeFromLastYear");
      const koteretAlName = extractXmlTag(xml, "KoteretAlName");
      return {
        ticker: ticker.toUpperCase(),
        exchange,
        price: last,
        openPrice: extractXmlNumber(xml, "openPrice"),
        currency,
        name: extractXmlTag(xml, "name_en") || extractXmlTag(xml, "nameEn") || void 0,
        nameHe: extractXmlTag(xml, "name_he") || void 0,
        changePct1d: pct1d !== void 0 ? pct1d / 100 : void 0,
        changePctRecent: calcRel(extractXmlNumber(xml, "LastWeekClosePrice")),
        changePct1m: calcRel(extractXmlNumber(xml, "LastMonthClosePrice")),
        changePct3m: calcRel(extractXmlNumber(xml, "Last3MonthsAgoClosePrice")),
        changePctYtd: ytdRaw !== void 0 ? ytdRaw / 100 : void 0,
        changePct3y: calcRel(extractXmlNumber(xml, "Last3YearsAgoClosePrice")),
        numericId: numericId || (/^\d+$/.test(identifier) ? Number(identifier) : null),
        isFeeExempt: koteretAlName === "\u05E7\u05E8\u05DF \u05DB\u05E1\u05E4\u05D9\u05EA",
        source: "Globes"
      };
    } catch {
      return null;
    }
  }
  async fetchBoiRate(series = "MNT_RIB_BOI_D.D.RIB_BOI") {
    try {
      const res = await this.invokeProxy("boi_statistics", { series });
      if (!res.ok) return null;
      const csv = await res.text();
      const lines = csv.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length < 2) return null;
      const headers = lines[0].split(",");
      const tIdx = headers.indexOf("TIME_PERIOD");
      const vIdx = headers.indexOf("OBS_VALUE");
      if (tIdx === -1 || vIdx === -1) return null;
      const historical = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const d = new Date(cols[tIdx]);
        const v = parseFloat(cols[vIdx]);
        if (!isNaN(d.getTime()) && !isNaN(v)) {
          historical.push({ date: d, price: v });
        }
      }
      historical.sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!historical.length) return null;
      const latest = historical[historical.length - 1].price;
      return {
        ticker: series,
        exchange: Exchange.BOI,
        numericId: null,
        price: latest,
        currency: Currency.ILS,
        name: "Bank of Israel Interest Rate",
        historical,
        ...computePeriodChangesFromHistory(latest, historical)
      };
    } catch {
      return null;
    }
  }
  async fetchCbsIndex(id = "120010") {
    try {
      const res = await this.invokeProxy("cbs_price_index", { id, page: "1" });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const pts = [];
      for (const m of json?.month || []) {
        for (const d of m?.date || []) {
          if (d?.year && d?.month && d?.currBase?.value !== void 0) {
            pts.push({ year: Number(d.year), month: Number(d.month), val: Number(d.currBase.value) });
          }
        }
      }
      if (!pts.length) return null;
      pts.sort((a, b) => a.year - b.year || a.month - b.month);
      const historical = pts.map((p) => ({
        date: new Date(Date.UTC(p.year, p.month - 1, 15)),
        price: p.val
      }));
      const latest = historical[historical.length - 1].price;
      return {
        ticker: id,
        exchange: Exchange.CBS,
        numericId: Number(id) || null,
        price: latest,
        currency: Currency.ILS,
        name: "Israel Consumer Price Index",
        historical,
        ...computePeriodChangesFromHistory(latest, historical)
      };
    } catch {
      return null;
    }
  }
  async fetchTickerData(ticker, exchange, numericId, includeFundamentals = false) {
    if (exchange === Exchange.BOI) return this.fetchBoiRate(ticker);
    if (exchange === Exchange.CBS) return this.fetchCbsIndex(ticker);
    const yahoo = await this.fetchYahooData(ticker, exchange, includeFundamentals);
    if (yahoo) {
      if (exchange === Exchange.TASE && numericId) {
        const globes = await this.fetchGlobesData(ticker, exchange, numericId);
        if (globes?.nameHe) yahoo.nameHe = globes.nameHe;
      }
      return yahoo;
    }
    if (exchange === Exchange.TASE || exchange === Exchange.FOREX) {
      return this.fetchGlobesData(ticker, exchange, numericId);
    }
    return null;
  }
};
function parsePortfoliosFromRows(rows) {
  return rows.map((row) => {
    const p = mapRowToPortfolio(row, portfolioMapping, portfolioNumericKeys);
    if (!p || !p.id) return null;
    if (typeof p.taxHistory === "string") {
      try {
        p.taxHistory = JSON.parse(p.taxHistory);
      } catch {
        p.taxHistory = [];
      }
    }
    if (typeof p.feeHistory === "string") {
      try {
        p.feeHistory = JSON.parse(p.feeHistory);
      } catch {
        p.feeHistory = [];
      }
    }
    return { ...p, holdings: [] };
  }).filter((p) => p !== null);
}
function parseTransactionsFromRows(rows) {
  const cleanNumber = (val, fallback) => {
    const parse = (v) => {
      if (typeof v === "number") return v;
      if (!v && v !== 0) return NaN;
      return parseFloat(String(v).replace(/[^0-9.-]+/g, ""));
    };
    const c1 = parse(val);
    if (!isNaN(c1)) return c1;
    const c2 = parse(fallback);
    return isNaN(c2) ? 0 : c2;
  };
  return rows.map((row, index) => {
    const raw = mapRowToTransaction(row, transactionMapping, transactionNumericKeys);
    raw.rowIndex = index + 2;
    if (raw.exchange) {
      try {
        raw.exchange = parseExchange(String(raw.exchange));
      } catch {
        raw.exchange = void 0;
      }
    } else {
      raw.exchange = void 0;
    }
    if (raw.type) {
      raw.type = String(raw.type).trim().toUpperCase();
    }
    const normalizedDate = coerceDate(raw.date);
    const normalizedVestDate = raw.vestDate ? coerceDate(raw.vestDate) : null;
    const normalizedCreationDate = raw.creationDate ? coerceDate(raw.creationDate) : null;
    return {
      ...raw,
      date: normalizedDate ? formatYYYYMMDD(normalizedDate) : raw.date,
      vestDate: normalizedVestDate ? formatYYYYMMDD(normalizedVestDate) : raw.vestDate,
      creationDate: normalizedCreationDate ? formatYYYYMMDD(normalizedCreationDate) : raw.creationDate,
      qty: cleanNumber(raw.splitAdjustedQty, raw.originalQty),
      price: cleanNumber(raw.splitAdjustedPrice, raw.originalPrice)
    };
  }).filter((t) => t.date && t.portfolioId && t.ticker);
}
function parseHoldingsSheetPriceMap(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const item = mapRowToHolding(row, holdingMapping, holdingNumericKeys);
    if (!item?.ticker) continue;
    let ex;
    try {
      ex = item.exchange ? parseExchange(String(item.exchange)) : Exchange.NASDAQ;
    } catch {
      continue;
    }
    let currency = ex === Exchange.TASE ? Currency.ILA : Currency.USD;
    const rawCurr = item.currency ? String(item.currency).trim() : "";
    if (rawCurr && !rawCurr.startsWith("=") && !rawCurr.startsWith("#") && rawCurr !== "Loading...") {
      try {
        currency = rawCurr === "ILA" ? Currency.ILA : normalizeCurrency(rawCurr);
      } catch {
      }
    }
    const price = Number(item.price) || 0;
    if (price > 0) {
      map.set(`${ex}:${String(item.ticker).toUpperCase()}`, {
        ticker: String(item.ticker).toUpperCase(),
        exchange: ex,
        price,
        currency,
        name: item.name && item.name !== "Loading..." ? String(item.name).trim() : void 0,
        nameHe: item.nameHe ? String(item.nameHe) : void 0,
        sector: item.sector ? String(item.sector) : void 0,
        type: item.type ? new InstrumentClassification(String(item.type)) : void 0,
        changePct1d: item.changePct1d,
        changePctRecent: item.changePctRecent,
        changePct1m: item.changePct1m,
        changePct3m: item.changePct3m,
        changePctYtd: item.changePctYtd,
        changePct1y: item.changePct1y,
        changePct3y: item.changePct3y,
        changePct5y: item.changePct5y,
        changePct10y: item.changePct10y,
        numericId: item.numericId ?? null,
        source: "GoogleSheets"
      });
    }
  }
  return map;
}
function parseDividendsFromRows(rows) {
  return rows.map((row, index) => {
    let date;
    const rawDate = row[2];
    if (typeof rawDate === "number") {
      date = new Date((rawDate - 25569) * 86400 * 1e3);
    } else {
      date = coerceDate(rawDate) || /* @__PURE__ */ new Date(NaN);
    }
    let exchange;
    try {
      exchange = parseExchange(String(row[0]));
    } catch {
      exchange = void 0;
    }
    return {
      rowIndex: index + 2,
      exchange,
      ticker: String(row[1] || "").toUpperCase(),
      date,
      dateStr: !isNaN(date.getTime()) ? formatYYYYMMDD(date) : "",
      amount: Number(row[3]),
      source: String(row[4] || ""),
      assetPriceAtTime: row[5] !== void 0 && row[5] !== null && String(row[5]).trim() !== "" && !isNaN(Number(row[5])) ? Number(row[5]) : void 0,
      currency: row[7] ? String(row[7]) : void 0
    };
  }).filter((d) => d.exchange && d.ticker && !isNaN(d.date.getTime()) && !isNaN(d.amount));
}
function parseExchangeRatesFromRows(rows) {
  const keyIndex = configHeaders.indexOf("Key");
  const periodIndices = {
    current: configHeaders.indexOf("Value"),
    ago1d: configHeaders.indexOf("1D Ago"),
    ago1w: configHeaders.indexOf("1W Ago"),
    ago1m: configHeaders.indexOf("1M Ago"),
    ago3m: configHeaders.indexOf("3M Ago"),
    ytd: configHeaders.indexOf("YTD"),
    ago1y: configHeaders.indexOf("1Y Ago"),
    ago3y: configHeaders.indexOf("3Y Ago"),
    ago5y: configHeaders.indexOf("5Y Ago")
  };
  const allRates = {};
  const rawPairs = {};
  for (const period in periodIndices) {
    allRates[period] = { USD: 1 };
    rawPairs[period] = {};
  }
  for (const row of rows) {
    const pair = typeof row[keyIndex] === "string" ? row[keyIndex].trim().toUpperCase() : "";
    if (pair.length !== 6) continue;
    for (const period in periodIndices) {
      const val = Number(row[periodIndices[period]]);
      if (!isNaN(val) && val > 0) {
        rawPairs[period][pair] = val;
      }
    }
  }
  const sortedPeriods = ["ago1d", "current", ...Object.keys(periodIndices).filter((p) => p !== "current" && p !== "ago1d")];
  for (const period of sortedPeriods) {
    const periodRaw = rawPairs[period];
    const rates = allRates[period];
    const graph = {};
    const nodes = /* @__PURE__ */ new Set(["USD"]);
    const addEdge = (from, to, rate) => {
      if (!graph[from]) graph[from] = {};
      graph[from][to] = rate;
    };
    for (const pair of Object.keys(periodRaw)) {
      const val = periodRaw[pair];
      if (val > 0) {
        const from = pair.slice(0, 3);
        const to = pair.slice(3, 6);
        addEdge(from, to, val);
        addEdge(to, from, 1 / val);
        nodes.add(from);
        nodes.add(to);
      }
    }
    nodes.forEach((target) => {
      if (target === "USD") return;
      if (graph["USD"]?.[target]) {
        rates[target] = graph["USD"][target];
        return;
      }
      if (graph["USD"]) {
        for (const inter of Object.keys(graph["USD"])) {
          if (graph[inter]?.[target]) {
            rates[target] = graph["USD"][inter] * graph[inter][target];
            return;
          }
        }
      }
    });
    if (period === "current") {
      for (const curr of Object.keys(allRates["ago1d"])) {
        if (curr !== "USD" && (!rates[curr] || rates[curr] === 0) && allRates["ago1d"][curr] > 0) {
          rates[curr] = allRates["ago1d"][curr];
        }
      }
    }
  }
  if (!allRates.current.ILS || allRates.current.ILS <= 0) allRates.current.ILS = 3.7;
  if (!allRates.current.EUR || allRates.current.EUR <= 0) allRates.current.EUR = 0.92;
  if (!allRates.current.GBP || allRates.current.GBP <= 0) allRates.current.GBP = 0.78;
  return allRates;
}
function parseTrackingListsFromRows(rows) {
  const out = [];
  rows.forEach((row, idx) => {
    if (!row[0] || !row[1] || !row[2]) return;
    let exchange;
    try {
      exchange = parseExchange(String(row[2]));
    } catch {
      return;
    }
    let dateAdded;
    if (typeof row[3] === "number") {
      dateAdded = new Date((row[3] - 25569) * 86400 * 1e3);
    } else {
      dateAdded = coerceDate(row[3]) || /* @__PURE__ */ new Date();
    }
    let alerts = [];
    if (row[4]) {
      try {
        alerts = JSON.parse(String(row[4]));
      } catch {
        alerts = [];
      }
    }
    out.push({
      listName: String(row[0]),
      ticker: String(row[1]).toUpperCase(),
      exchange,
      dateAdded,
      rowIndex: idx + 2,
      alerts
    });
  });
  return out;
}
function parseExternalPricesFromRows(rows) {
  const byKey = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!row[0] || !row[1] || !row[3]) continue;
    let exchange;
    try {
      exchange = parseExchange(String(row[1]));
    } catch {
      continue;
    }
    let dateVal;
    if (typeof row[2] === "number") {
      dateVal = new Date((row[2] - 25569) * 86400 * 1e3);
    } else {
      dateVal = coerceDate(row[2]) || /* @__PURE__ */ new Date(NaN);
    }
    if (isNaN(dateVal.getTime())) continue;
    const ticker = String(row[0]).toUpperCase();
    const key = `${exchange}:${ticker}`;
    let curr = Currency.ILS;
    try {
      curr = normalizeCurrency(String(row[4] || "ILS"));
    } catch {
      curr = Currency.ILS;
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ date: dateVal, price: Number(row[3]), currency: curr, ticker, exchange });
  }
  const out = /* @__PURE__ */ new Map();
  for (const [key, list] of byKey.entries()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = list[list.length - 1];
    const historical = list.map((i) => ({ date: i.date, price: i.price }));
    out.set(key, {
      ticker: latest.ticker,
      exchange: latest.exchange,
      numericId: null,
      price: latest.price,
      currency: latest.currency,
      historical,
      source: "ExternalDataset",
      ...computePeriodChangesFromHistory(latest.price, historical)
    });
  }
  return out;
}
function createHoldingSheetRow(h, meta, rowNum) {
  const tickerCell = `A${rowNum}`;
  const priceCell = `C${rowNum}`;
  const gfExchangeCell = `T${rowNum}`;
  const tickerAndExchange = `IF(${gfExchangeCell}="", ${tickerCell}, ${gfExchangeCell}&":"&${tickerCell})`;
  const row = new Array(holdingsHeaders.length).fill("");
  const isTASE = h.exchange === Exchange.TASE;
  const defaultCurrency = meta?.currency || (isTASE ? "ILA" : "");
  row[0] = String(h.ticker).toUpperCase();
  row[1] = toGoogleSheetsExchangeCode(h.exchange);
  row[2] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}))`;
  row[3] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"), "${escapeSheetString(defaultCurrency)}")`;
  row[4] = `=${h.qty}*${priceCell}`;
  row[5] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), " ${escapeSheetString(meta?.name)}")`;
  row[6] = meta?.nameHe || "";
  row[7] = meta?.sector || "";
  row[8] = meta?.type?.type || "";
  row[9] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`;
  const priceFormula = (dateExpr) => getHistoricalPriceFormula(tickerAndExchange, dateExpr);
  row[10] = `=IFERROR((${priceCell}/${priceFormula("TODAY()-7")})-1, "")`;
  row[11] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-1)")})-1, "")`;
  row[12] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-3)")})-1, "")`;
  row[13] = `=IFERROR(${priceCell} / ${priceFormula("DATE(YEAR(TODAY())-1, 12, 31)")} - 1, "")`;
  row[14] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-12)")})-1, "")`;
  row[15] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-36)")})-1, "")`;
  row[16] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-60)")})-1, "")`;
  row[17] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-120)")})-1, "")`;
  row[18] = h.numericId || "";
  row[19] = toGoogleFinanceExchangeCode(h.exchange);
  return row;
}
async function rebuildHoldingsSheetOnWorker(sheets, market) {
  const [currentHoldingsRows, txRows] = await Promise.all([
    sheets.getValues(HOLDINGS_RANGE, "UNFORMATTED_VALUE"),
    sheets.getValues(TX_FETCH_RANGE, "UNFORMATTED_VALUE")
  ]);
  const existingPriceMap = parseHoldingsSheetPriceMap(currentHoldingsRows);
  const transactions = parseTransactionsFromRows(txRows);
  transactions.sort((a, b) => (coerceDate(a.date)?.getTime() || 0) - (coerceDate(b.date)?.getTime() || 0));
  const holdings = {};
  for (const txn of transactions) {
    if (txn.type === "BUY" || txn.type === "SELL" || txn.type === "BUY_TRANSFER" || txn.type === "SELL_TRANSFER") {
      if (!txn.exchange) continue;
      const key = `${txn.exchange}:${txn.ticker.toUpperCase()}`;
      if (!holdings[key]) {
        holdings[key] = { ticker: txn.ticker.toUpperCase(), exchange: txn.exchange, qty: 0, numericId: null };
      }
      if (txn.numericId !== void 0 && txn.numericId !== null) {
        holdings[key].numericId = txn.numericId;
      }
      const mult = txn.type === "BUY" || txn.type === "BUY_TRANSFER" ? 1 : -1;
      const qty = parseFloat(String(txn.splitAdjustedQty || txn.originalQty)) || 0;
      holdings[key].qty += qty * mult;
    }
  }
  const activeHoldings = Object.values(holdings).filter((h) => Math.abs(h.qty) > 1e-8);
  const enriched = await Promise.all(
    activeHoldings.map(async (h) => {
      const key = `${h.exchange}:${h.ticker}`;
      let meta = existingPriceMap.get(key);
      if (!meta || !meta.name) {
        const fresh = await market.fetchTickerData(h.ticker, h.exchange, h.numericId, false);
        if (fresh) meta = { ...meta || {}, ...fresh };
      }
      return { h, meta: meta || null };
    })
  );
  const rowsToWrite = enriched.map(({ h, meta }, idx) => createHoldingSheetRow(h, meta, idx + 2));
  await sheets.clearValues(HOLDINGS_RANGE);
  if (rowsToWrite.length > 0) {
    await sheets.updateValues(`${HOLDINGS_SHEET}!A2`, rowsToWrite, "USER_ENTERED");
  }
  await sheets.setMetadataValue("holdings_rebuild", toGoogleSheetDateFormat(/* @__PURE__ */ new Date()));
}
function buildTransactionSheetRow(t) {
  const rowData = { ...t };
  const parsedDate = coerceDate(t.date);
  if (!parsedDate) {
    throw new AgentApiError(400, `Invalid transaction date: '${t.date}'`);
  }
  rowData.date = toGoogleSheetDateFormat(parsedDate);
  rowData.ticker = String(t.ticker).trim().toUpperCase();
  rowData.exchange = toGoogleSheetsExchangeCode(t.exchange);
  rowData.gfExchange = toGoogleFinanceExchangeCode(t.exchange);
  rowData.vestDate = t.vestDate ? toGoogleSheetDateFormat(coerceDate(t.vestDate)) : "";
  rowData.comment = t.comment || "";
  rowData.source = t.source || "AGENT_API";
  const comm = Number(t.commission) || 0;
  const isILA = String(t.currency || "").toUpperCase() === "ILA";
  rowData.commission = isILA ? comm * 100 : comm;
  const cDate = (t.creationDate ? coerceDate(t.creationDate) : null) || /* @__PURE__ */ new Date();
  rowData.creationDate = toGoogleSheetDateFormat(cDate);
  rowData.numeric_id = t.numericId ?? null;
  return sortedTxnColDefs.map((colDef) => {
    if (colDef.formula) return null;
    const key = colDef.key;
    const val = rowData[key] ?? t[key];
    return val === void 0 ? null : val;
  });
}
function buildTransactionFormulaRequests(txSheetNumericId, rowNumbers) {
  const formulaColDefs = Object.values(TXN_COLS).filter((colDef) => !!colDef.formula);
  const allColDefs = Object.values(TXN_COLS);
  const requests = [];
  for (const rowNum of rowNumbers) {
    for (const colDef of formulaColDefs) {
      const formula = colDef.formula(rowNum, TXN_COLS);
      const colIndex = allColDefs.indexOf(colDef);
      requests.push({
        updateCells: {
          range: {
            sheetId: txSheetNumericId,
            startRowIndex: rowNum - 1,
            endRowIndex: rowNum,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1
          },
          rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
          fields: "userEnteredValue.formulaValue"
        }
      });
    }
  }
  return requests;
}
function computeRecentAndUpcomingEvents(holdings, transactions, dividendRecords) {
  const today = /* @__PURE__ */ new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(today.getDate() - 30);
  const oneMonthFuture = new Date(today);
  oneMonthFuture.setDate(today.getDate() + 30);
  const holdingSymbols = new Set(holdings.map((h) => h.ticker.toUpperCase()));
  const events = [];
  for (const txn of transactions) {
    if (!holdingSymbols.has(txn.ticker.toUpperCase()) || !txn.vestDate) continue;
    const vDate = coerceDate(txn.vestDate);
    if (vDate && vDate >= oneMonthAgo && vDate <= oneMonthFuture) {
      const qty = txn.qty || txn.originalQty || 0;
      events.push({
        date: formatYYYYMMDD(vDate),
        ticker: txn.ticker,
        exchange: txn.exchange,
        type: vDate > today ? "UPCOMING_VEST" : "RECENT_VEST",
        qty,
        portfolioId: txn.portfolioId
      });
    }
  }
  for (const div of dividendRecords || []) {
    if (!holdingSymbols.has(div.ticker.toUpperCase())) continue;
    const dDate = coerceDate(div.date);
    if (dDate && dDate >= oneMonthAgo && dDate <= oneMonthFuture) {
      events.push({
        date: formatYYYYMMDD(dDate),
        ticker: div.ticker,
        exchange: div.exchange,
        type: "DIVIDEND_RECORDED",
        portfolioId: div.portfolioId,
        unitsHeld: div.unitsHeld,
        grossAmount: div.grossAmount,
        netAmount: div.netAmount
      });
    }
  }
  for (const h of holdings) {
    if (h.earningsDate) {
      const eDate = coerceDate(h.earningsDate);
      if (eDate && eDate >= oneMonthAgo && eDate <= oneMonthFuture) {
        events.push({
          date: formatYYYYMMDD(eDate),
          ticker: h.ticker,
          exchange: h.exchange,
          type: eDate >= today ? "UPCOMING_EARNINGS" : "RECENT_EARNINGS"
        });
      }
    }
    if (h.exDividendDate) {
      const exDate = coerceDate(h.exDividendDate);
      if (exDate && exDate >= oneMonthAgo && exDate <= oneMonthFuture) {
        events.push({
          date: formatYYYYMMDD(exDate),
          ticker: h.ticker,
          exchange: h.exchange,
          type: exDate >= today ? "UPCOMING_EX_DIVIDEND" : "RECENT_EX_DIVIDEND"
        });
      }
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
function getAgentApiHelp(baseUrl) {
  return {
    service: "Portfolios Agent API",
    baseUrl: `${baseUrl}/agent`,
    authentication: {
      header: "Authorization: Bearer ptf_<YOUR_PRIVATE_KEY>",
      alternateHeader: "X-Agent-Key: ptf_<YOUR_PRIVATE_KEY>",
      scope: "Scoped strictly to the single Google Sheet where the key was generated. Revocable anytime from Advanced Tools -> Agent API Access or via App_Metadata in Google Sheets."
    },
    endpoints: [
      {
        method: "GET",
        path: "/agent/help",
        description: "Returns API documentation, supported exchanges, currencies, transaction types, and payload schemas."
      },
      {
        method: "GET",
        path: "/agent/state",
        queryParams: {
          portfolioId: "Optional portfolio ID to filter holdings/summary",
          currency: "Display currency for summary & holding values (default: ILS; e.g. USD, ILS, EUR, GBP)",
          fast: 'Set "true" to use cached Google Sheets GOOGLEFINANCE prices without live Yahoo/Globes enrichment',
          includeBenchmarks: 'Set "false" to skip market benchmark indices (default: "true")',
          includeLots: 'Set "false" to omit activeLots/realizedLots arrays on holdings (default: "true")'
        },
        description: "Returns comprehensive portfolio state (identical to & richer than the built-in AI helper): summary stats, tax-adjusted net worth, performance across 1D/1W/1M/3M/YTD/1Y/3Y/5Y, portfolios, holdings with FIFO lots, recent/upcoming events, watchlist & alert states, user profile, and market benchmarks."
      },
      {
        method: "GET",
        path: "/agent/portfolios",
        description: "Lists all configured portfolios and their tax/fee policies."
      },
      {
        method: "GET",
        path: "/agent/transactions",
        queryParams: {
          portfolioId: "Optional filter by portfolioId",
          ticker: "Optional filter by ticker symbol",
          exchange: "Optional filter by exchange (e.g. NASDAQ, NYSE, TASE)",
          type: "Optional filter by type (BUY, SELL, BUY_TRANSFER, SELL_TRANSFER, DEPOSIT, WITHDRAWAL, FEE)",
          fromDate: "Optional YYYY-MM-DD lower bound (inclusive)",
          toDate: "Optional YYYY-MM-DD upper bound (inclusive)",
          limit: "Optional max records to return",
          offset: "Optional pagination offset"
        },
        description: "Lists transactions from Transaction_Log including rowIndex (used for PUT/PATCH/DELETE), original & split-adjusted qty/price, vesting dates, comments, and commissions."
      },
      {
        method: "POST",
        path: "/agent/transactions",
        bodySchema: {
          date: "YYYY-MM-DD (required)",
          portfolioId: "Portfolio ID from /agent/portfolios (required)",
          ticker: 'Ticker symbol, e.g. "AAPL" or "1159250" (required)',
          exchange: "NASDAQ | NYSE | TASE | LSE | FWB | TSE | HKEX | KRX | CRYPTO | FOREX | GEMEL | PENSION | CBS | BOI | CASH | MANUAL (required)",
          type: "BUY | SELL | BUY_TRANSFER | SELL_TRANSFER | DEPOSIT | WITHDRAWAL | FEE (required)",
          originalQty: "Number > 0 (required)",
          originalPrice: "Price per unit in transaction currency (required)",
          currency: "USD | ILS | ILA | EUR | GBP | CAD | JPY | HKD | AUD | CHF | KRW (required; note TASE stocks/funds quoted in Agorot use ILA)",
          vestDate: "Optional YYYY-MM-DD for RSU / unvested grant lots",
          comment: "Optional string note",
          commission: "Optional commission in major currency (or set autoCommission: true to compute from portfolio fee rules)",
          autoCommission: "Optional boolean (default false)",
          numericId: "Optional TASE numeric security ID",
          allowOversell: "Optional boolean (default false; prevents selling more units than held)"
        },
        batchSupport: 'Pass { "transactions": [ ... ] } to add multiple transactions atomically (e.g. RSU vesting schedules or swaps).',
        description: "Appends one or more transactions, populates split-tracking formulas, and rebuilds the Holdings sheet."
      },
      {
        method: "PUT / PATCH",
        path: "/agent/transactions/:rowIndex",
        bodySchema: {
          "...fieldsToUpdate": "Any transaction fields to update (PATCH merges with existing row; PUT replaces)",
          expectedTicker: "Optional safety check: fails with 409 if row ticker does not match",
          expectedQty: "Optional safety check: fails with 409 if row originalQty does not match"
        },
        description: "Edits an existing transaction at rowIndex, updates sheet formulas, and rebuilds Holdings."
      },
      {
        method: "DELETE",
        path: "/agent/transactions/:rowIndex",
        queryOrBodyParams: {
          expectedTicker: "Optional safety check: fails with 409 if row ticker does not match",
          expectedQty: "Optional safety check: fails with 409 if row originalQty does not match"
        },
        description: "Deletes the transaction row at rowIndex from Transaction_Log and rebuilds Holdings."
      },
      {
        method: "GET",
        path: "/agent/dividends",
        queryParams: {
          ticker: "Optional filter by ticker",
          exchange: "Optional filter by exchange",
          source: "Optional filter by source (MANUAL or YAHOO)",
          fromDate: "Optional YYYY-MM-DD",
          toDate: "Optional YYYY-MM-DD"
        },
        description: "Lists all dividend per-share events from the Dividends sheet with their rowIndex."
      },
      {
        method: "POST",
        path: "/agent/dividends",
        bodySchema: {
          ticker: "Ticker symbol (required)",
          exchange: "Exchange code (required)",
          date: "YYYY-MM-DD ex-dividend/payment date (required)",
          amount: "Dividend amount per share (required)",
          currency: "Optional dividend currency (e.g. USD, ILS)",
          source: "Optional source label (default: MANUAL)"
        },
        batchSupport: 'Pass { "dividends": [ ... ] } to add multiple dividend events.',
        description: "Adds manual dividend event(s) to the Dividends sheet."
      },
      {
        method: "PUT / PATCH",
        path: "/agent/dividends/:rowIndex",
        description: "Updates an existing dividend event at rowIndex."
      },
      {
        method: "DELETE",
        path: "/agent/dividends/:rowIndex",
        description: "Deletes a dividend event at rowIndex from the Dividends sheet."
      },
      {
        method: "GET",
        path: "/agent/ticker/:exchange/:ticker",
        description: "Fetches live quote, period returns, fundamentals (P/E, EPS, market cap, target price, upcoming earnings/dividends), and any owned position/transactions for the ticker."
      }
    ]
  };
}
async function getAgentPortfolioState(sheets, market, expectedKeyHash, options = {}) {
  const ranges = [
    PORT_OPT_RANGE,
    TX_FETCH_RANGE,
    HOLDINGS_RANGE,
    CONFIG_RANGE,
    DIVIDENDS_RANGE,
    TRACKING_LISTS_RANGE,
    EXTERNAL_DATASETS_RANGE,
    METADATA_RANGE
  ];
  let batchData;
  try {
    batchData = await sheets.batchGetValues(ranges, "UNFORMATTED_VALUE");
  } catch {
    const results = await Promise.all(ranges.map((r) => sheets.getValues(r, "UNFORMATTED_VALUE")));
    batchData = {};
    ranges.forEach((r, idx) => {
      batchData[r] = results[idx];
    });
  }
  const metaRows = batchData[METADATA_RANGE] || [];
  const metaMap = {};
  for (const r of metaRows) {
    if (r[0]) metaMap[String(r[0])] = r[1] !== void 0 && r[1] !== null ? String(r[1]) : "";
  }
  const activeHash = (metaMap["agent_api_key_hash"] || "").trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, "Agent private key is invalid, revoked, or rotated for this spreadsheet.");
  }
  const portfolios = parsePortfoliosFromRows(batchData[PORT_OPT_RANGE] || []);
  const transactions = parseTransactionsFromRows(batchData[TX_FETCH_RANGE] || []);
  const sheetPriceMap = parseHoldingsSheetPriceMap(batchData[HOLDINGS_RANGE] || []);
  const exchangeRates = parseExchangeRatesFromRows(batchData[CONFIG_RANGE] || []);
  const rawDivs = parseDividendsFromRows(batchData[DIVIDENDS_RANGE] || []);
  const trackingLists = parseTrackingListsFromRows(batchData[TRACKING_LISTS_RANGE] || []);
  const externalPriceMap = parseExternalPricesFromRows(batchData[EXTERNAL_DATASETS_RANGE] || []);
  const tickerInfoMap = /* @__PURE__ */ new Map();
  for (const t of transactions) {
    const ex = t.exchange || Exchange.TASE;
    const key = `${ex}:${t.ticker.toUpperCase()}`;
    if (!tickerInfoMap.has(key)) {
      tickerInfoMap.set(key, { ticker: t.ticker.toUpperCase(), exchange: ex, numericId: t.numericId });
    } else if (t.numericId && !tickerInfoMap.get(key).numericId) {
      tickerInfoMap.get(key).numericId = t.numericId;
    }
  }
  for (const item of trackingLists) {
    const key = `${item.exchange}:${item.ticker.toUpperCase()}`;
    if (!tickerInfoMap.has(key)) {
      tickerInfoMap.set(key, { ticker: item.ticker.toUpperCase(), exchange: item.exchange });
    }
  }
  const livePricesMap = /* @__PURE__ */ new Map();
  for (const [k, v] of externalPriceMap.entries()) livePricesMap.set(k, v);
  for (const [k, v] of sheetPriceMap.entries()) {
    const existing = livePricesMap.get(k);
    livePricesMap.set(k, existing ? { ...existing, ...v } : v);
  }
  if (!options.fast) {
    const entries = Array.from(tickerInfoMap.values());
    const chunkSize = 8;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async ({ ticker, exchange, numericId }) => {
          const key = `${exchange}:${ticker}`;
          const sheetMeta = sheetPriceMap.get(key);
          const fresh = await market.fetchTickerData(ticker, exchange, numericId || sheetMeta?.numericId, true);
          if (fresh && fresh.price > 0) {
            livePricesMap.set(key, {
              ...sheetMeta || {},
              ...fresh,
              name: fresh.name || sheetMeta?.name,
              nameHe: fresh.nameHe || sheetMeta?.nameHe,
              sector: fresh.sector || sheetMeta?.sector
            });
          }
        })
      );
    }
  }
  const txnsNeedingRates = transactions.filter((t) => t.currency === "USD" && !t.originalPriceILA && t.originalPrice && t.date);
  if (txnsNeedingRates.length > 0 && !options.fast) {
    const usdIls = await market.fetchYahooData("USDILS=X", Exchange.FOREX, false);
    if (usdIls?.historical) {
      const rateMap = /* @__PURE__ */ new Map();
      for (const h of usdIls.historical) {
        rateMap.set(h.date.toISOString().split("T")[0], h.price);
      }
      for (const t of txnsNeedingRates) {
        const d = new Date(t.date);
        let rate = rateMap.get(d.toISOString().split("T")[0]);
        for (let back = 1; !rate && back <= 3; back++) {
          d.setDate(d.getDate() - 1);
          rate = rateMap.get(d.toISOString().split("T")[0]);
        }
        if (rate) {
          t.originalPriceILA = t.originalPrice * rate * 100;
        }
      }
    }
  }
  const cpiData = !options.fast ? await market.fetchCbsIndex("120010") : null;
  const dividendEvents = rawDivs.map((d) => {
    let dripPrice = d.assetPriceAtTime;
    if (dripPrice === void 0) {
      const tdata = livePricesMap.get(`${d.exchange}:${d.ticker}`);
      if (tdata?.historical) {
        const ds = d.date.toISOString().split("T")[0];
        const hp = tdata.historical.find((h) => h.date.toISOString().split("T")[0] === ds);
        if (hp) dripPrice = hp.price;
      }
    }
    return {
      ticker: d.ticker,
      exchange: d.exchange,
      date: d.date,
      amount: d.amount,
      source: d.source || "SHEET",
      assetPriceAtDrip: dripPrice
    };
  });
  const engine = new FinanceEngine(portfolios, exchangeRates, cpiData);
  engine.processEvents(transactions, dividendEvents);
  engine.hydrateLivePrices(livePricesMap);
  const holdingsWithFees = Array.from(engine.holdings.values()).filter((h) => {
    const p = engine.portfolios.get(h.portfolioId);
    return p && (p.mgmtType === "percentage" || p.feeHistory && p.feeHistory.some((f) => f.mgmtType === "percentage"));
  });
  if (holdingsWithFees.length > 0) {
    engine.generateRecurringFees((ticker, exchange) => {
      const match = holdingsWithFees.find((h2) => h2.ticker === ticker && h2.exchange === exchange);
      const h = match ? engine.holdings.get(`${match.portfolioId}_${ticker}`) : void 0;
      return h ? h.currentPrice : 0;
    });
  }
  engine.calculateSnapshot();
  let displayCurrency = "ILS";
  if (options.displayCurrency) {
    try {
      displayCurrency = normalizeCurrency(options.displayCurrency);
    } catch {
      displayCurrency = "ILS";
    }
  }
  const allHoldings = Array.from(engine.holdings.values());
  const filteredHoldings = options.portfolioId ? allHoldings.filter((h) => h.portfolioId === options.portfolioId) : allHoldings;
  const portMap = new Map(portfolios.map((p) => [p.id, p]));
  const calc = calculateDashboardSummary(filteredHoldings, displayCurrency, exchangeRates, portMap, engine);
  const getTaxPolicyDesc = (policy) => {
    switch (policy) {
      case "TAX_FREE":
        return "Tax Exempt / Keren Hishtalmut (0% Capital Gains Tax)";
      case "IL_REAL_GAIN":
        return "Israeli Real Gain (Taxed only on capital gains exceeding CPI inflation)";
      case "NOMINAL_GAIN":
        return "Nominal Gain (Taxed on nominal capital gains)";
      case "PENSION":
        return "Pension / Provident Fund";
      case "RSU_ACCOUNT":
        return "RSU Account (Vesting taxed as income; post-vesting gains taxed as capital gains)";
      default:
        return policy || "NA";
    }
  };
  const portfoliosSummary = (options.portfolioId ? portfolios.filter((p) => p.id === options.portfolioId) : portfolios).map((p) => {
    const singleMap = /* @__PURE__ */ new Map([[p.id, p]]);
    const pHoldings = allHoldings.filter((h) => h.portfolioId === p.id);
    const pCalc = calculateDashboardSummary(pHoldings, displayCurrency, exchangeRates, singleMap, engine);
    return {
      id: p.id,
      name: p.name,
      currency: p.currency,
      cgtRate: p.cgt,
      incomeTaxRate: p.incTax,
      taxPolicy: p.taxPolicy,
      taxPolicyDescription: getTaxPolicyDesc(p.taxPolicy),
      divPolicy: p.divPolicy,
      mgmtFee: p.mgmtVal ? `${p.mgmtType === "percentage" ? formatPercent(p.mgmtVal) : p.mgmtVal} ${p.mgmtFreq || ""}`.trim() : "None",
      commRate: p.commRate,
      commMin: p.commMin,
      commMax: p.commMax,
      commExemption: p.commExemption,
      summary: pCalc.summary
    };
  });
  const includeLots = options.includeLots !== false;
  const holdingsOutput = calc.holdings.map((h) => {
    const live = livePricesMap.get(`${h.exchange}:${h.ticker}`);
    return {
      id: h.id,
      symbol: h.ticker,
      exchange: h.exchange,
      name: h.displayName || h.ticker,
      nameHe: h.nameHe,
      sector: h.sector,
      portfolioId: h.portfolioId,
      portfolioName: h.portfolioName,
      stockCurrency: h.stockCurrency,
      currentPrice: h.currentPrice,
      qtyTotal: h.qtyTotal,
      qtyVested: h.qtyVested,
      qtyUnvested: h.qtyUnvested,
      displayCurrency,
      marketValue: h.display.marketValue,
      valueAfterTax: h.display.valueAfterTax,
      costBasis: h.display.costBasis,
      adjustedCostBasis: h.display.adjustedCost,
      unrealizedGain: h.display.unrealizedGain,
      unrealizedGainPct: h.display.unrealizedGainPct,
      realizedGain: h.display.realizedGain,
      realizedGainPct: h.display.realizedGainPct,
      realizedGainAfterTax: h.display.realizedGainAfterTax,
      dividendsTotal: h.display.dividends,
      unrealizedTaxLiability: h.display.unrealizedTax,
      realizedTaxPaid: h.display.realizedTax,
      dayChange: h.display.dayChangeVal,
      dayChangePct: h.display.dayChangePct,
      weightInPortfolio: h.display.weightInPortfolio,
      weightInAllHoldings: h.display.weightInGlobal,
      unvestedMarketValue: h.display.unvestedValue,
      perf1w: h.perf1w,
      perf1m: h.perf1m,
      perf3m: h.perf3m,
      perfYtd: h.perfYtd,
      perf1y: h.perf1y,
      perf3y: h.perf3y,
      perf5y: h.perf5y,
      fundamentals: live?.fundamentals,
      ...includeLots ? {
        activeLots: h.activeLots,
        realizedLots: h.realizedLots
      } : {}
    };
  });
  let userProfile = null;
  if (metaMap["user_financial_profile"]) {
    try {
      const parsed = JSON.parse(metaMap["user_financial_profile"]);
      if (parsed && typeof parsed === "object") {
        userProfile = { ...parsed };
        if (userProfile.birthYear !== void 0) {
          userProfile.age = (/* @__PURE__ */ new Date()).getFullYear() - Number(userProfile.birthYear);
          delete userProfile.birthYear;
        }
      }
    } catch {
      userProfile = null;
    }
  }
  const relevantTxns = options.portfolioId ? engine.transactions.filter((tx) => tx.portfolioId === options.portfolioId) : engine.transactions;
  const relevantDivRecords = options.portfolioId ? engine.dividendRecords.filter((d) => d.portfolioId === options.portfolioId) : engine.dividendRecords;
  for (const h of calc.holdings) {
    const live = livePricesMap.get(`${h.exchange}:${h.ticker}`);
    if (live?.calendarEvents?.earningsDate) h.earningsDate = live.calendarEvents.earningsDate;
    if (live?.calendarEvents?.exDividendDate) h.exDividendDate = live.calendarEvents.exDividendDate;
  }
  const recentAndUpcomingEvents = computeRecentAndUpcomingEvents(calc.holdings, relevantTxns, relevantDivRecords);
  const watchlist = trackingLists.map((item) => {
    const live = livePricesMap.get(`${item.exchange}:${item.ticker}`);
    return {
      listName: item.listName,
      ticker: item.ticker,
      exchange: item.exchange,
      price: live?.price,
      currency: live?.currency,
      changePct1d: live?.changePct1d,
      alerts: (item.alerts || []).map((a) => ({
        ...a,
        triggered: live ? evaluateAlert(a, live) : false
      }))
    };
  });
  let marketOverview = void 0;
  if (options.includeBenchmarks !== false && !options.fast) {
    const benchmarks = [
      { ticker: "^SPX", exchange: Exchange.NYSE, name: "S&P 500" },
      { ticker: "^NDX", exchange: Exchange.NASDAQ, name: "NASDAQ 100" },
      { ticker: "^STOXX", exchange: Exchange.FWB, name: "STOXX Europe 600" },
      { ticker: "^NYETR", exchange: Exchange.NYSE, name: "NYSE Energy Sector" },
      { ticker: "^SP500-45", exchange: Exchange.NYSE, name: "S&P 500 Info Tech" },
      { ticker: "137", exchange: Exchange.TASE, name: "TA-125", numericId: 137 },
      { ticker: "120010", exchange: Exchange.CBS, name: "Israel Consumer Price Index (Inflation)" },
      { ticker: "MNT_RIB_BOI_D.D.RIB_BOI", exchange: Exchange.BOI, name: "Bank of Israel Interest Rate" }
    ];
    const results = await Promise.all(
      benchmarks.map(
        (b) => b.ticker === "120010" && cpiData ? Promise.resolve(cpiData) : market.fetchTickerData(b.ticker, b.exchange, b.numericId, false)
      )
    );
    marketOverview = benchmarks.map((b, idx) => {
      const d = results[idx];
      return {
        name: b.name,
        ticker: b.ticker,
        exchange: b.exchange,
        value: d?.price ?? null,
        perf1d: d?.changePct1d ?? null,
        perf1w: d?.changePctRecent ?? null,
        perf1m: d?.changePct1m ?? null,
        perf3m: d?.changePct3m ?? null,
        perfYtd: d?.changePctYtd ?? null,
        perf1y: d?.changePct1y ?? null,
        perf5y: d?.changePct5y ?? null
      };
    });
  }
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    displayCurrency,
    exchangeRates: exchangeRates.current,
    userProfile,
    summary: calc.summary,
    portfolios: portfoliosSummary,
    holdings: holdingsOutput,
    recentAndUpcomingEvents,
    watchlist,
    ...marketOverview ? { marketOverview } : {}
  };
}
async function listAgentPortfolios(sheets, expectedKeyHash) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rows = await sheets.getValues(PORT_OPT_RANGE, "UNFORMATTED_VALUE");
  return { portfolios: parsePortfoliosFromRows(rows) };
}
async function listAgentTransactions(sheets, expectedKeyHash, filters = {}) {
  const batch = await sheets.batchGetValues([METADATA_RANGE, PORT_OPT_RANGE, TX_FETCH_RANGE], "UNFORMATTED_VALUE");
  const metaRows = batch[METADATA_RANGE] || [];
  const activeHash = String(metaRows.find((r) => String(r[0]) === "agent_api_key_hash")?.[1] || "").trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, "Agent private key is invalid, revoked, or rotated for this spreadsheet.");
  }
  const portfolios = parsePortfoliosFromRows(batch[PORT_OPT_RANGE] || []);
  const portNameMap = new Map(portfolios.map((p) => [p.id, p.name]));
  let txns = parseTransactionsFromRows(batch[TX_FETCH_RANGE] || []);
  if (filters.portfolioId) {
    txns = txns.filter((t) => t.portfolioId === filters.portfolioId);
  }
  if (filters.ticker) {
    const sym = filters.ticker.trim().toUpperCase();
    txns = txns.filter((t) => t.ticker.toUpperCase() === sym);
  }
  if (filters.exchange) {
    const ex = parseExchange(filters.exchange);
    txns = txns.filter((t) => t.exchange === ex);
  }
  if (filters.type) {
    const tp = filters.type.trim().toUpperCase();
    txns = txns.filter((t) => t.type === tp);
  }
  if (filters.fromDate) {
    txns = txns.filter((t) => String(t.date) >= filters.fromDate);
  }
  if (filters.toDate) {
    txns = txns.filter((t) => String(t.date) <= filters.toDate);
  }
  txns.sort((a, b) => {
    const cmp = String(b.date).localeCompare(String(a.date));
    return cmp !== 0 ? cmp : (b.rowIndex || 0) - (a.rowIndex || 0);
  });
  const totalCount = txns.length;
  const offset = Math.max(0, filters.offset || 0);
  const limit = filters.limit && filters.limit > 0 ? filters.limit : txns.length;
  const sliced = txns.slice(offset, offset + limit).map((t) => ({
    ...t,
    portfolioName: portNameMap.get(t.portfolioId) || t.portfolioId
  }));
  return {
    totalCount,
    offset,
    count: sliced.length,
    transactions: sliced
  };
}
function computeDefaultCommission(port, type, totalMajor) {
  if (!Number.isFinite(totalMajor) || totalMajor <= 0) return 0;
  if (!isBuy(type) && !isSell(type)) return 0;
  if (port.commExemption === "all") return 0;
  if (port.commExemption === "sells" && isSell(type)) return 0;
  const raw = totalMajor * (port.commRate || 0);
  const clampedMin = Math.max(raw, port.commMin || 0);
  const max = port.commMax || 0;
  return Number((max > 0 ? Math.min(clampedMin, max) : clampedMin).toFixed(2));
}
var VALID_TXN_TYPES = /* @__PURE__ */ new Set([
  "BUY",
  "SELL",
  "BUY_TRANSFER",
  "SELL_TRANSFER",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE"
]);
async function addAgentTransactions(sheets, market, expectedKeyHash, body) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rawItems = Array.isArray(body?.transactions) ? body.transactions : body?.transaction ? [body.transaction] : [body];
  if (!rawItems.length) {
    throw new AgentApiError(400, "At least one transaction object is required.");
  }
  const [portRows, existingTxRows] = await Promise.all([
    sheets.getValues(PORT_OPT_RANGE, "UNFORMATTED_VALUE"),
    sheets.getValues(TX_FETCH_RANGE, "UNFORMATTED_VALUE")
  ]);
  const portfolios = parsePortfoliosFromRows(portRows);
  const portMap = new Map(portfolios.map((p) => [p.id, p]));
  const existingTxns = parseTransactionsFromRows(existingTxRows);
  const heldQtyMap = /* @__PURE__ */ new Map();
  for (const tx of existingTxns) {
    if (isBuy(tx.type) || isSell(tx.type)) {
      const k = `${tx.portfolioId}:${tx.exchange}:${tx.ticker.toUpperCase()}`;
      const mult = isBuy(tx.type) ? 1 : -1;
      heldQtyMap.set(k, (heldQtyMap.get(k) || 0) + (tx.qty || tx.originalQty || 0) * mult);
    }
  }
  const normalizedTxns = [];
  for (const item of rawItems) {
    const type = String(item.type || "").trim().toUpperCase();
    if (type === "DIVIDEND") {
      throw new AgentApiError(400, "Use POST /agent/dividends to add dividend events instead of /agent/transactions.");
    }
    if (!VALID_TXN_TYPES.has(type)) {
      throw new AgentApiError(400, `Invalid transaction type '${item.type}'. Allowed: ${Array.from(VALID_TXN_TYPES).join(", ")}`);
    }
    const portfolioId = String(item.portfolioId || "").trim();
    const port = portMap.get(portfolioId);
    if (!port) {
      throw new AgentApiError(
        400,
        `Portfolio '${portfolioId}' not found. Available portfolios: ${portfolios.map((p) => `${p.id} (${p.name})`).join(", ")}`
      );
    }
    const ticker = String(item.ticker || "").trim().toUpperCase();
    if (!ticker) throw new AgentApiError(400, "Transaction ticker is required.");
    let exchange;
    try {
      exchange = parseExchange(String(item.exchange || ""));
    } catch {
      throw new AgentApiError(400, `Invalid exchange '${item.exchange}'.`);
    }
    const parsedDate = coerceDate(item.date);
    if (!parsedDate) {
      throw new AgentApiError(400, `Invalid date '${item.date}'. Use YYYY-MM-DD.`);
    }
    const originalQty = Number(item.originalQty ?? item.qty);
    if (!Number.isFinite(originalQty) || originalQty <= 0) {
      throw new AgentApiError(400, "originalQty must be a positive number.");
    }
    const originalPrice = Number(item.originalPrice ?? item.price);
    if (!Number.isFinite(originalPrice) || originalPrice < 0) {
      throw new AgentApiError(400, "originalPrice must be a non-negative number.");
    }
    let currency;
    try {
      currency = String(item.currency || "").toUpperCase() === "ILA" ? Currency.ILA : normalizeCurrency(String(item.currency || (exchange === Exchange.TASE ? "ILA" : port.currency || "USD")));
    } catch {
      throw new AgentApiError(400, `Invalid currency '${item.currency}'.`);
    }
    if (isSell(type) && !item.allowOversell) {
      const k = `${portfolioId}:${exchange}:${ticker}`;
      const available = heldQtyMap.get(k) || 0;
      if (available < originalQty - 1e-6) {
        throw new AgentApiError(
          400,
          `Cannot sell ${originalQty} of ${exchange}:${ticker} in portfolio '${portfolioId}': only ${available} held (pass allowOversell: true to override).`
        );
      }
      heldQtyMap.set(k, available - originalQty);
    } else if (isBuy(type)) {
      const k = `${portfolioId}:${exchange}:${ticker}`;
      heldQtyMap.set(k, (heldQtyMap.get(k) || 0) + originalQty);
    }
    let commission = item.commission !== void 0 ? Number(item.commission) : 0;
    if (item.autoCommission && item.commission === void 0) {
      const rawTotal = originalQty * originalPrice;
      const totalMajor = currency === Currency.ILA ? rawTotal / 100 : rawTotal;
      commission = computeDefaultCommission(port, type, totalMajor);
    }
    let origOpenPrice = item.origOpenPriceAtCreationDate !== void 0 ? Number(item.origOpenPriceAtCreationDate) : void 0;
    let numericId = item.numericId !== void 0 && item.numericId !== null ? Number(item.numericId) : void 0;
    if (origOpenPrice === void 0) {
      const live = await market.fetchTickerData(ticker, exchange, numericId, false);
      if (live?.openPrice && live.openPrice > 0) {
        origOpenPrice = live.openPrice;
      } else if (live?.price && live.price > 0) {
        origOpenPrice = live.price;
      }
      if (!numericId && live?.numericId) {
        numericId = live.numericId;
      }
    }
    normalizedTxns.push({
      date: formatYYYYMMDD(parsedDate),
      portfolioId,
      ticker,
      exchange,
      type,
      originalQty,
      originalPrice,
      qty: originalQty,
      price: originalPrice,
      currency,
      vestDate: item.vestDate ? formatYYYYMMDD(coerceDate(item.vestDate)) : void 0,
      comment: item.comment ? String(item.comment) : void 0,
      commission,
      source: item.source ? String(item.source) : "AGENT_API",
      creationDate: formatYYYYMMDD(/* @__PURE__ */ new Date()),
      origOpenPriceAtCreationDate: origOpenPrice,
      numericId
    });
  }
  const rowsToAppend = normalizedTxns.map(buildTransactionSheetRow);
  const appendRes = await sheets.appendValues(`${TX_SHEET_NAME}!A:A`, rowsToAppend, "USER_ENTERED", "INSERT_ROWS");
  const updatedRange = appendRes?.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  if (!match) {
    throw new AgentApiError(500, `Could not determine appended row range from '${updatedRange}'.`);
  }
  const startRow = parseInt(match[1], 10);
  const rowNumbers = normalizedTxns.map((_, i) => startRow + i);
  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  const formulaRequests = buildTransactionFormulaRequests(txSheetId, rowNumbers);
  if (formulaRequests.length > 0) {
    await sheets.batchUpdate(formulaRequests);
  }
  await rebuildHoldingsSheetOnWorker(sheets, market);
  return {
    success: true,
    addedCount: normalizedTxns.length,
    transactions: normalizedTxns.map((t, idx) => ({ ...t, rowIndex: startRow + idx }))
  };
}
async function updateAgentTransaction(sheets, market, expectedKeyHash, rowIndex, body, isPartial) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, "rowIndex must be an integer >= 2.");
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const [portRows, allTxRows] = await Promise.all([
    sheets.getValues(PORT_OPT_RANGE, "UNFORMATTED_VALUE"),
    sheets.getValues(TX_FETCH_RANGE, "UNFORMATTED_VALUE")
  ]);
  const portfolios = parsePortfoliosFromRows(portRows);
  const portMap = new Map(portfolios.map((p) => [p.id, p]));
  const rawExistingRow = allTxRows[rowIndex - 2];
  if (!rawExistingRow || rawExistingRow.every((c) => c === "" || c === null || c === void 0)) {
    throw new AgentApiError(404, `Transaction at rowIndex ${rowIndex} not found.`);
  }
  const parsedExistingList = parseTransactionsFromRows([rawExistingRow]);
  const existing = parsedExistingList[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} does not contain a valid transaction.`);
  }
  existing.rowIndex = rowIndex;
  if (body.expectedTicker && String(body.expectedTicker).toUpperCase() !== existing.ticker.toUpperCase()) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected ticker '${body.expectedTicker}', found '${existing.ticker}'.`
    );
  }
  if (body.expectedQty !== void 0 && Math.abs(Number(body.expectedQty) - Number(existing.originalQty)) > 1e-4) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected qty ${body.expectedQty}, found ${existing.originalQty}.`
    );
  }
  const merged = isPartial ? { ...existing, ...body } : { ...body, rowIndex };
  if (body.qty !== void 0 && body.originalQty === void 0) merged.originalQty = Number(body.qty);
  if (body.price !== void 0 && body.originalPrice === void 0) merged.originalPrice = Number(body.price);
  const type = String(merged.type || "").trim().toUpperCase();
  if (!VALID_TXN_TYPES.has(type)) {
    throw new AgentApiError(400, `Invalid transaction type '${merged.type}'.`);
  }
  if (!portMap.has(String(merged.portfolioId))) {
    throw new AgentApiError(400, `Portfolio '${merged.portfolioId}' not found.`);
  }
  const exchange = parseExchange(String(merged.exchange || existing.exchange || ""));
  const parsedDate = coerceDate(merged.date);
  if (!parsedDate) throw new AgentApiError(400, `Invalid date '${merged.date}'.`);
  const originalQty = Number(merged.originalQty);
  const originalPrice = Number(merged.originalPrice);
  if (!Number.isFinite(originalQty) || originalQty <= 0) {
    throw new AgentApiError(400, "originalQty must be > 0.");
  }
  if (!Number.isFinite(originalPrice) || originalPrice < 0) {
    throw new AgentApiError(400, "originalPrice must be >= 0.");
  }
  const currency = String(merged.currency || "").toUpperCase() === "ILA" ? Currency.ILA : normalizeCurrency(String(merged.currency || existing.currency || "USD"));
  const updatedTxn = {
    rowIndex,
    date: formatYYYYMMDD(parsedDate),
    portfolioId: String(merged.portfolioId),
    ticker: String(merged.ticker).trim().toUpperCase(),
    exchange,
    type,
    originalQty,
    originalPrice,
    qty: originalQty,
    price: originalPrice,
    currency,
    vestDate: merged.vestDate ? formatYYYYMMDD(coerceDate(merged.vestDate)) : void 0,
    comment: merged.comment !== void 0 ? String(merged.comment) : void 0,
    commission: merged.commission !== void 0 ? Number(merged.commission) : existing.commission || 0,
    source: merged.source ? String(merged.source) : existing.source || "AGENT_API",
    creationDate: existing.creationDate || formatYYYYMMDD(/* @__PURE__ */ new Date()),
    origOpenPriceAtCreationDate: merged.origOpenPriceAtCreationDate !== void 0 ? Number(merged.origOpenPriceAtCreationDate) : existing.origOpenPriceAtCreationDate,
    numericId: merged.numericId !== void 0 ? Number(merged.numericId) : existing.numericId
  };
  const rowValues = buildTransactionSheetRow(updatedTxn);
  await sheets.updateValues(`${TX_SHEET_NAME}!A${rowIndex}`, [rowValues], "USER_ENTERED");
  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  const formulaRequests = buildTransactionFormulaRequests(txSheetId, [rowIndex]);
  if (formulaRequests.length > 0) {
    await sheets.batchUpdate(formulaRequests);
  }
  await rebuildHoldingsSheetOnWorker(sheets, market);
  return {
    success: true,
    transaction: updatedTxn
  };
}
async function deleteAgentTransaction(sheets, market, expectedKeyHash, rowIndex, opts = {}) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, "rowIndex must be an integer >= 2.");
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rowRes = await sheets.getValues(`${TX_SHEET_NAME}!A${rowIndex}:V${rowIndex}`, "UNFORMATTED_VALUE");
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c) => c === "" || c === null || c === void 0)) {
    throw new AgentApiError(404, `Transaction at rowIndex ${rowIndex} not found.`);
  }
  const parsed = parseTransactionsFromRows([rawRow])[0];
  if (!parsed) {
    throw new AgentApiError(404, `Row ${rowIndex} does not contain a valid transaction.`);
  }
  parsed.rowIndex = rowIndex;
  if (opts.expectedTicker && opts.expectedTicker.toUpperCase() !== parsed.ticker.toUpperCase()) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected ticker '${opts.expectedTicker}', found '${parsed.ticker}'.`
    );
  }
  if (opts.expectedQty !== void 0 && opts.expectedQty !== null && Math.abs(Number(opts.expectedQty) - Number(parsed.originalQty)) > 1e-4) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected qty ${opts.expectedQty}, found ${parsed.originalQty}.`
    );
  }
  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  await sheets.batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId: txSheetId,
          dimension: "ROWS",
          startIndex: rowIndex - 1,
          endIndex: rowIndex
        }
      }
    }
  ]);
  await rebuildHoldingsSheetOnWorker(sheets, market);
  return {
    success: true,
    deletedTransaction: parsed
  };
}
function buildDividendSheetRow(exchange, ticker, date, amount, source, currency) {
  const priceFormula = `=IFERROR(INDEX(GOOGLEFINANCE(IF(TRIM(INDIRECT("A"&ROW()))="", INDIRECT("B"&ROW()), INDIRECT("A"&ROW())&":"&INDIRECT("B"&ROW())), "price", INDIRECT("C"&ROW())), 2, 2), "")`;
  const assetPriceCurrencyFormula = `=IFERROR(GOOGLEFINANCE(IF(TRIM(INDIRECT("A"&ROW()))="", INDIRECT("B"&ROW()), INDIRECT("A"&ROW())&":"&INDIRECT("B"&ROW())), "currency"), "")`;
  const divCurrency = currency || (exchange === Exchange.TASE ? "ILS" : "USD");
  return [
    toGoogleSheetsExchangeCode(exchange),
    ticker.toUpperCase(),
    toGoogleSheetDateFormat(date),
    amount,
    source,
    priceFormula,
    assetPriceCurrencyFormula,
    divCurrency
  ];
}
async function listAgentDividends(sheets, expectedKeyHash, filters = {}) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rows = await sheets.getValues(DIVIDENDS_RANGE, "UNFORMATTED_VALUE");
  let divs = parseDividendsFromRows(rows).map((d) => ({
    rowIndex: d.rowIndex,
    exchange: d.exchange,
    ticker: d.ticker,
    date: d.dateStr,
    amount: d.amount,
    currency: d.currency || (d.exchange === Exchange.TASE ? "ILS" : "USD"),
    source: d.source,
    assetPriceAtTime: d.assetPriceAtTime
  }));
  if (filters.ticker) {
    const sym = filters.ticker.trim().toUpperCase();
    divs = divs.filter((d) => d.ticker === sym);
  }
  if (filters.exchange) {
    const ex = parseExchange(filters.exchange);
    divs = divs.filter((d) => d.exchange === ex);
  }
  if (filters.source) {
    const src = filters.source.trim().toUpperCase();
    divs = divs.filter((d) => d.source.toUpperCase() === src);
  }
  if (filters.fromDate) {
    divs = divs.filter((d) => d.date >= filters.fromDate);
  }
  if (filters.toDate) {
    divs = divs.filter((d) => d.date <= filters.toDate);
  }
  divs.sort((a, b) => b.date.localeCompare(a.date) || b.rowIndex - a.rowIndex);
  return {
    count: divs.length,
    dividends: divs
  };
}
async function addAgentDividends(sheets, expectedKeyHash, body) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rawItems = Array.isArray(body?.dividends) ? body.dividends : body?.dividend ? [body.dividend] : [body];
  if (!rawItems.length) {
    throw new AgentApiError(400, "At least one dividend object is required.");
  }
  const existingRows = await sheets.getValues(DIVIDENDS_RANGE, "UNFORMATTED_VALUE");
  if (existingRows.length === 0) {
    const sheetId = await sheets.getSheetNumericId(DIV_SHEET_NAME, true);
    if (sheetId !== void 0) {
      const headerCheck = await sheets.getValues(`${DIV_SHEET_NAME}!A1:H1`, "FORMATTED_VALUE");
      if (!headerCheck.length) {
        await sheets.updateValues(`${DIV_SHEET_NAME}!A1:H1`, [Array.from(dividendHeaders)], "USER_ENTERED");
      }
    }
  }
  const newRows = [];
  const addedSummary = [];
  for (const item of rawItems) {
    const ticker = String(item.ticker || "").trim().toUpperCase();
    if (!ticker) throw new AgentApiError(400, "Dividend ticker is required.");
    let exchange;
    try {
      exchange = parseExchange(String(item.exchange || ""));
    } catch {
      throw new AgentApiError(400, `Invalid dividend exchange '${item.exchange}'.`);
    }
    const parsedDate = coerceDate(item.date);
    if (!parsedDate) throw new AgentApiError(400, `Invalid dividend date '${item.date}'.`);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AgentApiError(400, "Dividend amount must be > 0.");
    }
    const source = item.source ? String(item.source).toUpperCase() : "MANUAL";
    const currency = item.currency ? normalizeCurrency(String(item.currency)) : exchange === Exchange.TASE ? Currency.ILS : Currency.USD;
    newRows.push(buildDividendSheetRow(exchange, ticker, parsedDate, amount, source, currency));
    addedSummary.push({
      ticker,
      exchange,
      date: formatYYYYMMDD(parsedDate),
      amount,
      currency,
      source
    });
  }
  const appendRes = await sheets.appendValues(`${DIV_SHEET_NAME}!A:A`, newRows, "USER_ENTERED", "INSERT_ROWS");
  const updatedRange = appendRes?.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  const startRow = match ? parseInt(match[1], 10) : void 0;
  await sheets.setMetadataValue("dividends_rebuild", toGoogleSheetDateFormat(/* @__PURE__ */ new Date()));
  return {
    success: true,
    addedCount: addedSummary.length,
    dividends: addedSummary.map((d, idx) => ({
      ...d,
      ...startRow !== void 0 ? { rowIndex: startRow + idx } : {}
    }))
  };
}
async function updateAgentDividend(sheets, expectedKeyHash, rowIndex, body) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, "rowIndex must be an integer >= 2.");
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rowRes = await sheets.getValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, "UNFORMATTED_VALUE");
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c) => c === "" || c === null || c === void 0)) {
    throw new AgentApiError(404, `Dividend at rowIndex ${rowIndex} not found.`);
  }
  const existing = parseDividendsFromRows([rawRow])[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} in Dividends is invalid.`);
  }
  if (body.expectedTicker && String(body.expectedTicker).toUpperCase() !== existing.ticker) {
    throw new AgentApiError(409, `Verification failed: expected ticker '${body.expectedTicker}', found '${existing.ticker}'.`);
  }
  if (body.expectedAmount !== void 0 && Math.abs(Number(body.expectedAmount) - existing.amount) > 1e-6) {
    throw new AgentApiError(409, `Verification failed: expected amount ${body.expectedAmount}, found ${existing.amount}.`);
  }
  const exchange = body.exchange ? parseExchange(String(body.exchange)) : existing.exchange;
  const ticker = body.ticker ? String(body.ticker).trim().toUpperCase() : existing.ticker;
  const parsedDate = body.date ? coerceDate(body.date) : existing.date;
  if (!parsedDate) throw new AgentApiError(400, `Invalid dividend date '${body.date}'.`);
  const amount = body.amount !== void 0 ? Number(body.amount) : existing.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AgentApiError(400, "Dividend amount must be > 0.");
  }
  const source = body.source ? String(body.source).toUpperCase() : existing.source || "MANUAL";
  const currency = body.currency ? normalizeCurrency(String(body.currency)) : existing.currency;
  const updatedRow = buildDividendSheetRow(exchange, ticker, parsedDate, amount, source, currency);
  await sheets.updateValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, [updatedRow], "USER_ENTERED");
  return {
    success: true,
    dividend: {
      rowIndex,
      ticker,
      exchange,
      date: formatYYYYMMDD(parsedDate),
      amount,
      currency: currency || (exchange === Exchange.TASE ? "ILS" : "USD"),
      source
    }
  };
}
async function deleteAgentDividend(sheets, expectedKeyHash, rowIndex, opts = {}) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, "rowIndex must be an integer >= 2.");
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rowRes = await sheets.getValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, "UNFORMATTED_VALUE");
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c) => c === "" || c === null || c === void 0)) {
    throw new AgentApiError(404, `Dividend at rowIndex ${rowIndex} not found.`);
  }
  const existing = parseDividendsFromRows([rawRow])[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} in Dividends is invalid.`);
  }
  if (opts.expectedTicker && opts.expectedTicker.toUpperCase() !== existing.ticker) {
    throw new AgentApiError(409, `Verification failed: expected ticker '${opts.expectedTicker}', found '${existing.ticker}'.`);
  }
  if (opts.expectedAmount !== void 0 && opts.expectedAmount !== null && Math.abs(Number(opts.expectedAmount) - existing.amount) > 1e-6) {
    throw new AgentApiError(409, `Verification failed: expected amount ${opts.expectedAmount}, found ${existing.amount}.`);
  }
  const divSheetId = await sheets.getSheetNumericId(DIV_SHEET_NAME);
  await sheets.batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId: divSheetId,
          dimension: "ROWS",
          startIndex: rowIndex - 1,
          endIndex: rowIndex
        }
      }
    }
  ]);
  return {
    success: true,
    deletedDividend: {
      rowIndex,
      ticker: existing.ticker,
      exchange: existing.exchange,
      date: existing.dateStr,
      amount: existing.amount,
      currency: existing.currency,
      source: existing.source
    }
  };
}
async function getAgentTickerStats(sheets, market, expectedKeyHash, exchangeStr, tickerStr, numericId) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  let exchange;
  try {
    exchange = parseExchange(exchangeStr);
  } catch {
    throw new AgentApiError(400, `Invalid exchange '${exchangeStr}'.`);
  }
  const ticker = tickerStr.trim().toUpperCase();
  const [txRows, divRows] = await Promise.all([
    sheets.getValues(TX_FETCH_RANGE, "UNFORMATTED_VALUE"),
    sheets.getValues(DIVIDENDS_RANGE, "UNFORMATTED_VALUE")
  ]);
  const matchingTxns = parseTransactionsFromRows(txRows).filter(
    (t) => t.ticker.toUpperCase() === ticker && (!t.exchange || t.exchange === exchange)
  );
  const resolvedNumericId = numericId || matchingTxns.find((t) => t.numericId)?.numericId || null;
  const live = await market.fetchTickerData(ticker, exchange, resolvedNumericId, true);
  const matchingDivs = parseDividendsFromRows(divRows).filter((d) => d.ticker === ticker && d.exchange === exchange).map((d) => ({
    rowIndex: d.rowIndex,
    date: d.dateStr,
    amount: d.amount,
    currency: d.currency,
    source: d.source
  }));
  return {
    ticker,
    exchange,
    marketData: live ? {
      price: live.price,
      openPrice: live.openPrice,
      currency: live.currency,
      name: live.name,
      nameHe: live.nameHe,
      sector: live.sector,
      changePct1d: live.changePct1d,
      changePct1w: live.changePctRecent,
      changePct1m: live.changePct1m,
      changePct3m: live.changePct3m,
      changePctYtd: live.changePctYtd,
      changePct1y: live.changePct1y,
      changePct3y: live.changePct3y,
      changePct5y: live.changePct5y,
      earningsDate: live.calendarEvents?.earningsDate,
      exDividendDate: live.calendarEvents?.exDividendDate,
      dividendPayDate: live.calendarEvents?.dividendDate,
      fundamentals: live.fundamentals,
      recentHistoryPoints: live.historical ? live.historical.slice(-30) : []
    } : null,
    userTransactions: matchingTxns,
    recordedDividends: matchingDivs
  };
}
export {
  AgentApiError,
  SheetsRestClient,
  WorkerMarketService,
  addAgentDividends,
  addAgentTransactions,
  deleteAgentDividend,
  deleteAgentTransaction,
  getAgentApiHelp,
  getAgentPortfolioState,
  getAgentTickerStats,
  listAgentDividends,
  listAgentPortfolios,
  listAgentTransactions,
  updateAgentDividend,
  updateAgentTransaction,
  verifySheetAgentKey
};
