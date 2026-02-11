"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.holdingNumericKeys = exports.holdingMapping = exports.portfolioNumericKeys = exports.portfolioMapping = exports.SHEET_STRUCTURE_VERSION_DATE = exports.EXTERNAL_DATASETS_RANGE = exports.externalDatasetsHeaders = exports.EXTERNAL_DATASETS_SHEET_NAME = exports.DIVIDENDS_RANGE = exports.dividendHeaders = exports.DIV_SHEET_NAME = exports.HOLDINGS_RANGE = exports.HOLDINGS_SHEET = exports.METADATA_RANGE = exports.metadataHeaders = exports.METADATA_SHEET = exports.CONFIG_RANGE = exports.CONFIG_SHEET_NAME = exports.TX_FETCH_RANGE = exports.TX_SHEET_NAME = exports.PORT_OPT_RANGE = exports.PORTFOLIO_SHEET_NAME = exports.DEFAULT_SHEET_NAME = exports.configHeaders = exports.holdingsHeaders = exports.portfolioHeaders = exports.transactionNumericKeys = exports.transactionMapping = exports.transactionHeaders = exports.TXN_COLS = void 0;
const formulas_1 = require("./formulas");
// --- Column Definitions ---
exports.TXN_COLS = {
    date: { key: 'date', colName: 'Date', colId: 'A' },
    portfolioId: { key: 'portfolioId', colName: 'Portfolio', colId: 'B' },
    ticker: { key: 'ticker', colName: 'Ticker', colId: 'C' },
    exchange: { key: 'exchange', colName: 'Exchange', colId: 'D' },
    type: { key: 'type', colName: 'Type', colId: 'E' },
    originalQty: { key: 'originalQty', colName: 'Original_Qty', colId: 'F', numeric: true },
    originalPrice: { key: 'originalPrice', colName: 'Original_Price', colId: 'G', numeric: true },
    currency: { key: 'currency', colName: 'Currency', colId: 'H' },
    // Original_Price_ILA: Converts the original price to ILA (Agorot).
    // If currency is ILS, price is in ILS, so * 100.
    // If currency is USD, price is USD, so * USDILS * 100.
    // If other, convert to ILS then * 100.
    originalPriceILA: {
        key: 'originalPriceILA',
        colName: 'Original_Price_ILA',
        colId: 'I',
        numeric: true,
        formula: (rowNum, cols) => {
            const txnCurr = `${cols.currency.colId}${rowNum}`;
            const origPrice = `${cols.originalPrice.colId}${rowNum}`;
            const txnDate = `${cols.date.colId}${rowNum}`;
            // Use standard formula; robustness handled by having multiple pairs in config or manual overrides if needed for transactions
            const usdToIlsFormula = (0, formulas_1.getHistoricalPriceFormula)('USDILS', txnDate, true);
            // ILA is 1/100 of ILS.
            // If txn in ILS, value is already in ILS major units (e.g. 1.50). In ILA it is 150.
            return `=IF(${txnCurr}="ILA", ${origPrice}, IF(${txnCurr}="ILS", ${origPrice}*100, IF(${txnCurr}="USD", ${origPrice} * ${usdToIlsFormula} * 100, ${origPrice} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${txnCurr} & "ILS", "price", ${txnDate}), 2, 2) * 100)))`;
        }
    },
    // Original_Price_USD: Converts the original transaction price to USD.
    originalPriceUSD: {
        key: 'originalPriceUSD',
        colName: 'Original_Price_USD',
        colId: 'J',
        numeric: true,
        formula: (rowNum, cols) => {
            const txnCurr = `${cols.currency.colId}${rowNum}`;
            const origPrice = `${cols.originalPrice.colId}${rowNum}`;
            const txnDate = `${cols.date.colId}${rowNum}`;
            const usdIlsFormula = (0, formulas_1.getHistoricalPriceFormula)('USDILS', txnDate, true);
            // If already USD, return price.
            // If ILS, divide by USDILS rate.
            // Else, look up CROSS to USD.
            return `=IF(${txnCurr}="USD", ${origPrice}, ` +
                `IF(${txnCurr}="ILA", ${origPrice} / 100 / ${usdIlsFormula}, ` +
                `IF(${txnCurr}="ILS", ${origPrice} / ${usdIlsFormula}, ` +
                `${origPrice} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${txnCurr} & "USD", "price", ${txnDate}), 2, 2)` +
                `)))`;
        }
    },
    vestDate: { key: 'vestDate', colName: 'Vesting_Date', colId: 'K' },
    comment: { key: 'comment', colName: 'Comments', colId: 'L' },
    commission: { key: 'commission', colName: 'Commission', colId: 'M', numeric: true },
    source: { key: 'source', colName: 'Source', colId: 'N' },
    creationDate: { key: 'creationDate', colName: 'Creation_Date', colId: 'O' },
    origOpenPriceAtCreationDate: { key: 'origOpenPriceAtCreationDate', colName: 'Orig_Open_Price_At_Creation_Date', colId: 'P', numeric: true },
    splitAdjOpenPrice: {
        key: 'splitAdjOpenPrice',
        colName: 'Split_Adj_Open_Price',
        colId: 'Q',
        numeric: true,
        formula: (rowNum, cols) => `=INDEX(GOOGLEFINANCE(${cols.exchange.colId}${rowNum}&":"&${cols.ticker.colId}${rowNum}, "open", ${cols.creationDate.colId}${rowNum}), 2, 2)`
    },
    splitRatio: {
        key: 'splitRatio',
        colName: 'Split_Ratio',
        colId: 'R',
        numeric: true,
        formula: (rowNum, cols) => `=ROUND(IFERROR(IF(OR(ISBLANK(${cols.splitAdjOpenPrice.colId}${rowNum}), ${cols.splitAdjOpenPrice.colId}${rowNum}=0, ISBLANK(${cols.origOpenPriceAtCreationDate.colId}${rowNum})), 1, ${cols.origOpenPriceAtCreationDate.colId}${rowNum} / ${cols.splitAdjOpenPrice.colId}${rowNum}), 1), 2)`
    },
    splitAdjustedPrice: {
        key: 'splitAdjustedPrice',
        colName: 'Split_Adjusted_Price',
        colId: 'S',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.originalPrice.colId}${rowNum} / ${cols.splitRatio.colId}${rowNum}, ${cols.originalPrice.colId}${rowNum})`
    },
    splitAdjustedQty: {
        key: 'splitAdjustedQty',
        colName: 'Split_Adjusted_Qty',
        colId: 'T',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.originalQty.colId}${rowNum} * ${cols.splitRatio.colId}${rowNum}, ${cols.originalQty.colId}${rowNum})`
    },
    numericId: {
        key: 'numericId',
        colName: 'Numeric_ID',
        colId: 'U',
        numeric: true
    },
    grossValue: {
        key: 'grossValue',
        colName: 'Gross_Value',
        colId: 'V',
        numeric: true,
        formula: (rowNum, cols) => {
            const exchange = `${cols.exchange.colId}${rowNum}`;
            const ticker = `${cols.ticker.colId}${rowNum}`;
            return `=IFERROR(GOOGLEFINANCE(${exchange}&":"&${ticker})*${cols.splitAdjustedQty.colId}${rowNum})`;
        }
    },
};
exports.transactionHeaders = Object.values(exports.TXN_COLS)
    .sort((a, b) => {
    const lenDiff = a.colId.length - b.colId.length;
    return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
})
    .map(c => c.colName);
exports.transactionMapping = Object.keys(exports.TXN_COLS).reduce((acc, key) => {
    const k = key;
    if (exports.TXN_COLS[k]) {
        acc[k] = exports.TXN_COLS[k].colName;
    }
    return acc;
}, {});
exports.transactionNumericKeys = Object.keys(exports.TXN_COLS).filter(key => exports.TXN_COLS[key].numeric).map(key => key);
// --- Canonical Headers & Ranges ---
exports.portfolioHeaders = ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_Rate', 'Income_Tax_Rate', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Tax_Policy', 'Tax_On_Base', 'Tax_History', 'Fee_History'];
// Merged Price_Unit into Currency logic, removed explicit Price_Unit column
exports.holdingsHeaders = [
    'Ticker', 'Exchange', 'Quantity', 'Live_Price', 'Currency', 'Total Holding Value',
    'Name_En', 'Name_He', 'Sector', 'Type', 'Day_Change',
    'Change_1W', 'Change_1M', 'Change_3M', 'Change_YTD', 'Change_1Y', 'Change_3Y', 'Change_5Y', 'Change_10Y', 'Numeric_ID', 'Recent_Change_Days'
];
exports.configHeaders = ['Key', 'Value', '1D Ago', '1W Ago', '1M Ago', '3M Ago', '6M Ago', 'YTD', '1Y Ago', '3Y Ago', '5Y Ago'];
exports.DEFAULT_SHEET_NAME = 'Portfolios_App_Data';
exports.PORTFOLIO_SHEET_NAME = 'Portfolio_Options';
exports.PORT_OPT_RANGE = `${exports.PORTFOLIO_SHEET_NAME}!A2:${String.fromCharCode(65 + exports.portfolioHeaders.length - 1)}`;
exports.TX_SHEET_NAME = 'Transaction_Log';
exports.TX_FETCH_RANGE = `${exports.TX_SHEET_NAME}!A2:${String.fromCharCode(65 + exports.transactionHeaders.length - 1)}`;
exports.CONFIG_SHEET_NAME = 'Currency_Conversions';
exports.CONFIG_RANGE = `${exports.CONFIG_SHEET_NAME}!A2:K`;
exports.METADATA_SHEET = 'App_Metadata';
exports.metadataHeaders = ['Key', 'Value'];
exports.METADATA_RANGE = exports.METADATA_SHEET + '!A:B';
exports.HOLDINGS_SHEET = 'Holdings';
exports.HOLDINGS_RANGE = `${exports.HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + exports.holdingsHeaders.length - 1)}`;
exports.DIV_SHEET_NAME = 'Dividends';
exports.dividendHeaders = ['Exchange', 'Ticker', 'Date', 'Div_Amount', 'Source'];
exports.DIVIDENDS_RANGE = `${exports.DIV_SHEET_NAME}!A2:E`;
exports.EXTERNAL_DATASETS_SHEET_NAME = 'External_Datasets';
exports.externalDatasetsHeaders = ['Ticker', 'Exchange', 'Date', 'Price', 'Currency'];
exports.EXTERNAL_DATASETS_RANGE = `${exports.EXTERNAL_DATASETS_SHEET_NAME}!A2:E`;
// Manually update this date (YYYY-MM-DD) whenever the schema (columns, formulas) changes.
// The app will verify if the sheet's last setup date is older than this.
exports.SHEET_STRUCTURE_VERSION_DATE = '2026-02-05';
// --- Mappings from Sheet Headers to Typescript Object Keys ---
exports.portfolioMapping = {
    id: 'Portfolio_ID', name: 'Display_Name', cgt: 'Cap_Gains_Tax_Rate', incTax: 'Income_Tax_Rate',
    mgmtVal: 'Mgmt_Fee_Val', mgmtType: 'Mgmt_Type', mgmtFreq: 'Mgmt_Freq', commRate: 'Comm_Rate_%',
    commMin: 'Comm_Min', commMax: 'Comm_Max_Fee', currency: 'Currency', divPolicy: 'Div_Policy',
    divCommRate: 'Div_Comm_Rate_%', taxPolicy: 'Tax_Policy', taxOnBase: 'Tax_On_Base', taxHistory: 'Tax_History', feeHistory: 'Fee_History'
};
exports.portfolioNumericKeys = ['cgt', 'incTax', 'mgmtVal', 'commRate', 'commMin', 'commMax', 'divCommRate'];
exports.holdingMapping = {
    ticker: 'Ticker', exchange: 'Exchange', qty: 'Quantity',
    price: 'Live_Price', currency: 'Currency', totalValue: 'Total Holding Value',
    name: 'Name_En', nameHe: 'Name_He', sector: 'Sector', type: 'Type',
    changePct1d: 'Day_Change', changePctRecent: 'Change_1W', changePct1m: 'Change_1M', changePct3m: 'Change_3M',
    changePctYtd: 'Change_YTD', changePct1y: 'Change_1Y', changePct3y: 'Change_3Y', changePct5y: 'Change_5Y', changePct10y: 'Change_10Y',
    numericId: 'Numeric_ID', recentChangeDays: 'Recent_Change_Days'
};
exports.holdingNumericKeys = [
    'qty', 'price', 'totalValue', 'changePct1d', 'changePctRecent', 'changePct1m', 'changePct3m',
    'changePctYtd', 'changePct1y', 'changePct3y', 'changePct5y', 'changePct10y', 'numericId', 'recentChangeDays'
];
