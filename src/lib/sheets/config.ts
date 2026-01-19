import type { Portfolio, Transaction, Holding } from '../types';
import type { TransactionColumns } from './types'; // Import from a new local types file
import { getHistoricalPriceFormula } from './formulas';

// --- Column Definitions ---

export const TXN_COLS: TransactionColumns = {
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
            const usdToIlsFormula = getHistoricalPriceFormula('USDILS', txnDate, true);
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
            const usdIlsFormula = getHistoricalPriceFormula('USDILS', txnDate, true);

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
    // Renamed to Commission_In_Txn_Currency
    commission: { key: 'commission', colName: 'Commission', colId: 'M', numeric: true },
    tax: { key: 'tax', colName: 'Tax %', colId: 'N', numeric: true },
    source: { key: 'source', colName: 'Source', colId: 'O' },
    creationDate: { key: 'creationDate', colName: 'Creation_Date', colId: 'P' },
    origOpenPriceAtCreationDate: { key: 'origOpenPriceAtCreationDate', colName: 'Orig_Open_Price_At_Creation_Date', colId: 'Q', numeric: true },
    splitAdjOpenPrice: {
        key: 'splitAdjOpenPrice',
        colName: 'Split_Adj_Open_Price',
        colId: 'R',
        numeric: true,
        formula: (rowNum, cols) => `=INDEX(GOOGLEFINANCE(${cols.exchange.colId}${rowNum}&":"&${cols.ticker.colId}${rowNum}, "open", ${cols.creationDate.colId}${rowNum}), 2, 2)`
    },
    splitRatio: {
        key: 'splitRatio',
        colName: 'Split_Ratio',
        colId: 'S',
        numeric: true,
        formula: (rowNum, cols) => `=ROUND(IFERROR(IF(OR(ISBLANK(${cols.splitAdjOpenPrice.colId}${rowNum}), ${cols.splitAdjOpenPrice.colId}${rowNum}=0, ISBLANK(${cols.origOpenPriceAtCreationDate.colId}${rowNum})), 1, ${cols.origOpenPriceAtCreationDate.colId}${rowNum} / ${cols.splitAdjOpenPrice.colId}${rowNum}), 1), 2)`
    },
    splitAdjustedPrice: {
        key: 'splitAdjustedPrice',
        colName: 'Split_Adjusted_Price',
        colId: 'T',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.originalPrice.colId}${rowNum} / ${cols.splitRatio.colId}${rowNum}, ${cols.originalPrice.colId}${rowNum})`
    },
    splitAdjustedQty: {
        key: 'splitAdjustedQty',
        colName: 'Split_Adjusted_Qty',
        colId: 'U',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.originalQty.colId}${rowNum} * ${cols.splitRatio.colId}${rowNum}, ${cols.originalQty.colId}${rowNum})`
    },
    numericId: {
        key: 'numericId',
        colName: 'Numeric_ID',
        colId: 'V',
        numeric: true
    },
    grossValue: {
        key: 'grossValue',
        colName: 'Gross_Value',
        colId: 'W',
        numeric: true,
        formula: (rowNum, cols) => {
            const exchange = `${cols.exchange.colId}${rowNum}`;
            const ticker = `${cols.ticker.colId}${rowNum}`;
            return `=IFERROR(GOOGLEFINANCE(${exchange}&":"&${ticker}")*${cols.splitAdjustedQty.colId}${rowNum})`;
        }
    },
    valueAfterTax: {
        key: 'valueAfterTax',
        colName: 'Value_After_Tax',
        colId: 'X',
        numeric: true,
        formula: (rowNum, cols) => {
            const type = `${cols.type.colId}${rowNum}`;
            const portId = `${cols.portfolioId.colId}${rowNum}`;
            const grossValue = `${cols.grossValue.colId}${rowNum}`;
            const qty = `${cols.splitAdjustedQty.colId}${rowNum}`;
            const price = `${cols.splitAdjustedPrice.colId}${rowNum}`;
            return `=IF(${type}<>"BUY", "", ` +
                `LET(baseValue, ${price}*${qty},`+
                `cgt, IFERROR(VLOOKUP(${portId}, Portfolio_Options!A:Z, 3, FALSE), 0), ` +
                `incTax, IFERROR(VLOOKUP(${portId}, Portfolio_Options!A:Z, 4, FALSE), 0), ` +
                `(${grossValue} - baseValue) * (1 - cgt) + (baseValue * (1 - incTax))))`;
        }
    },
};

export const transactionHeaders = Object.values(TXN_COLS).map(c => c.colName) as unknown as readonly string[];
export const transactionMapping: Record<keyof Omit<Transaction, 'grossValue'>, string> =
    Object.keys(TXN_COLS).reduce((acc, key) => {
        const k = key as import('./types').TxnKey;
        if (TXN_COLS[k]) {
            (acc as any)[k] = TXN_COLS[k].colName;
        }
        return acc;
    }, {} as Record<keyof Omit<Transaction, 'grossValue'>, string>);

export const transactionNumericKeys = Object.keys(TXN_COLS).filter(key => TXN_COLS[key as import('./types').TxnKey].numeric).map(key => key) as unknown as (keyof Omit<Transaction, 'grossValue'>)[];

// --- Canonical Headers & Ranges ---

export const portfolioHeaders = ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_Rate', 'Income_Tax_Rate', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Tax_Policy'] as const;

// Merged Price_Unit into Currency logic, removed explicit Price_Unit column
export const holdingsHeaders = [
    'Ticker', 'Exchange', 'Quantity', 'Live_Price', 'Currency', 'Total Holding Value',
    'Name_En', 'Name_He', 'Sector', 'Day_Change',
    'Change_1W', 'Change_1M', 'Change_3M', 'Change_YTD', 'Change_1Y', 'Change_3Y', 'Change_5Y', 'Change_10Y', 'Numeric_ID', 'Recent_Change_Days'
] as const;
export const configHeaders = ['Key', 'Value', '1D Ago', '1W Ago', '1M Ago', '3M Ago', '6M Ago', 'YTD', '1Y Ago', '3Y Ago', '5Y Ago'] as const;
export const holdingsUserOptionsHeaders = ['Ticker', 'Exchange', 'Fallback_Name'] as const;

export type Headers = readonly string[];

export const DEFAULT_SHEET_NAME = 'Portfolios_App_Data';
export const PORTFOLIO_SHEET_NAME = 'Portfolio_Options';
export const PORT_OPT_RANGE = `${PORTFOLIO_SHEET_NAME}!A2:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`;
export const TX_SHEET_NAME = 'Transaction_Log';
export const TX_FETCH_RANGE = `${TX_SHEET_NAME}!A2:${String.fromCharCode(65 + transactionHeaders.length - 1)}`;
export const CONFIG_SHEET_NAME = 'Currency_Conversions';
export const CONFIG_RANGE = `${CONFIG_SHEET_NAME}!A2:K`;
export const METADATA_SHEET = 'App_Metadata';
export const metadataHeaders = ['Key', 'Value'] as const;
export const METADATA_RANGE = METADATA_SHEET + '!A:B';
export const HOLDINGS_SHEET = 'Holdings';
export const HOLDINGS_RANGE = `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}`;
export const HOLDINGS_USER_OPTIONS_SHEET_NAME = 'HoldingsUserOptions';
export const HOLDINGS_USER_OPTIONS_RANGE = `${HOLDINGS_USER_OPTIONS_SHEET_NAME}!A2:C`;

// Manually update this date (YYYY-MM-DD) whenever the schema (columns, formulas) changes.
// The app will verify if the sheet's last setup date is older than this.
export const SHEET_STRUCTURE_VERSION_DATE = '2026-01-20';

// --- Mappings from Sheet Headers to Typescript Object Keys ---

export const portfolioMapping: Record<keyof Omit<Portfolio, 'holdings'>, typeof portfolioHeaders[number]> = {
    id: 'Portfolio_ID', name: 'Display_Name', cgt: 'Cap_Gains_Tax_Rate', incTax: 'Income_Tax_Rate',
    mgmtVal: 'Mgmt_Fee_Val', mgmtType: 'Mgmt_Type', mgmtFreq: 'Mgmt_Freq', commRate: 'Comm_Rate_%',
    commMin: 'Comm_Min', commMax: 'Comm_Max_Fee', currency: 'Currency', divPolicy: 'Div_Policy',
    divCommRate: 'Div_Comm_Rate_%', taxPolicy: 'Tax_Policy'
};
export const portfolioNumericKeys: (keyof Omit<Portfolio, 'holdings'>)[] = ['cgt', 'incTax', 'mgmtVal', 'commRate', 'commMin', 'commMax', 'divCommRate'];

// Define a type for the part of Holding that is mapped from the sheet
export type SheetHolding = Omit<Holding, 'portfolioId' | 'changeDate1d' | 'changeDateRecent' | 'changeDate1m' | 'changeDate3m' | 'changeDateYtd' | 'changeDate1y' | 'changeDate3y' | 'changeDate5y' | 'changeDate10y'>;

export const holdingMapping: Record<keyof SheetHolding, typeof holdingsHeaders[number]> = {
    ticker: 'Ticker', exchange: 'Exchange', qty: 'Quantity',
    price: 'Live_Price', currency: 'Currency', totalValue: 'Total Holding Value',
    name: 'Name_En', nameHe: 'Name_He', sector: 'Sector',
    changePct1d: 'Day_Change', changePctRecent: 'Change_1W', changePct1m: 'Change_1M', changePct3m: 'Change_3M',
    changePctYtd: 'Change_YTD', changePct1y: 'Change_1Y', changePct3y: 'Change_3Y', changePct5y: 'Change_5Y', changePct10y: 'Change_10Y',
    numericId: 'Numeric_ID', recentChangeDays: 'Recent_Change_Days'
};
export const holdingNumericKeys: (keyof SheetHolding)[] = [
    'qty', 'price', 'totalValue', 'changePct1d', 'changePctRecent', 'changePct1m', 'changePct3m',
    'changePctYtd', 'changePct1y', 'changePct3y', 'changePct5y', 'changePct10y', 'numericId', 'recentChangeDays'
];