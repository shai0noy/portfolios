/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Portfolio, Transaction, Holding } from '../types';
import type { TransactionColumns } from './types'; // Import from a new local types file
import { getUsdIlsFormula } from './formulas';

// --- Column Definitions ---

export const TXN_COLS: TransactionColumns = {
    date: { key: 'date', colName: 'Date', colId: 'A' },
    portfolioId: { key: 'portfolioId', colName: 'Portfolio', colId: 'B' },
    ticker: { key: 'ticker', colName: 'Ticker', colId: 'C' },
    exchange: { key: 'exchange', colName: 'Exchange', colId: 'D' },
    type: { key: 'type', colName: 'Type', colId: 'E' },
    Original_Qty: { key: 'Original_Qty', colName: 'Original_Qty', colId: 'F', numeric: true },
    Original_Price: { key: 'Original_Price', colName: 'Original_Price', colId: 'G', numeric: true },
    currency: { key: 'currency', colName: 'Currency', colId: 'H' },
    
    // Original_Price_ILAG: Converts the original price to ILAG (Agorot).
    // If currency is ILS, price is in ILS, so * 100.
    // If currency is USD, price is USD, so * USDILS * 100.
    // If other, convert to ILS then * 100.
    Original_Price_ILAG: {
        key: 'Original_Price_ILAG',
        colName: 'Original_Price_ILAG',
        colId: 'I',
        numeric: true,
        formula: (rowNum, cols) => {
            const txnCurr = `${cols.currency.colId}${rowNum}`;
            const origPrice = `${cols.Original_Price.colId}${rowNum}`;
            const txnDate = `${cols.date.colId}${rowNum}`;
            const usdToIlsFormula = getUsdIlsFormula(txnDate);
            // ILAG is 1/100 of ILS.
            // If txn in ILS, value is already in ILS major units (e.g. 1.50). In ILAG it is 150.
            return `=IF(${txnCurr}="ILAG", ${origPrice}, IF(${txnCurr}="ILS", ${origPrice}*100, IF(${txnCurr}="USD", ${origPrice} * ${usdToIlsFormula} * 100, ${origPrice} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${txnCurr} & "ILS", "price", ${txnDate}), 2, 2) * 100)))`;
        }
    },
    
    // Original_Price_USD: Converts the original transaction price to USD.
    // Replaces Original_Price_Portfolio_Currency to standardise on USD for intermediate calcs.
    Original_Price_USD: {
        key: 'Original_Price_USD',
        colName: 'Original_Price_USD',
        colId: 'J',
        numeric: true,
        formula: (rowNum, cols) => {
            const txnCurr = `${cols.currency.colId}${rowNum}`;
            const origPrice = `${cols.Original_Price.colId}${rowNum}`;
            const txnDate = `${cols.date.colId}${rowNum}`;
            const usdIlsFormula = getUsdIlsFormula(txnDate);

            // If already USD, return price.
            // If ILS, divide by USDILS rate.
            // Else, look up CROSS to USD.
            return `=IF(${txnCurr}="USD", ${origPrice}, ` +
                   `IF(${txnCurr}="ILAG", ${origPrice} / 100 / ${usdIlsFormula}, ` +
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
    Source: { key: 'Source', colName: 'Source', colId: 'O' },
    Creation_Date: { key: 'Creation_Date', colName: 'Creation_Date', colId: 'P' },
    Orig_Open_Price_At_Creation_Date: { key: 'Orig_Open_Price_At_Creation_Date', colName: 'Orig_Open_Price_At_Creation_Date', colId: 'Q', numeric: true },
    Split_Adj_Open_Price: {
        key: 'Split_Adj_Open_Price',
        colName: 'Split_Adj_Open_Price',
        colId: 'R',
        numeric: true,
        formula: (rowNum, cols) => `=INDEX(GOOGLEFINANCE(${cols.exchange.colId}${rowNum}&":"&${cols.ticker.colId}${rowNum}, "open", ${cols.Creation_Date.colId}${rowNum}), 2, 2)`
    },
    Split_Ratio: {
        key: 'Split_Ratio',
        colName: 'Split_Ratio',
        colId: 'S',
        numeric: true,
        formula: (rowNum, cols) => `=ROUND(IFERROR(IF(OR(ISBLANK(${cols.Split_Adj_Open_Price.colId}${rowNum}), ${cols.Split_Adj_Open_Price.colId}${rowNum}=0, ISBLANK(${cols.Orig_Open_Price_At_Creation_Date.colId}${rowNum})), 1, ${cols.Orig_Open_Price_At_Creation_Date.colId}${rowNum} / ${cols.Split_Adj_Open_Price.colId}${rowNum}), 1), 2)`
    },
    Split_Adjusted_Price: {
        key: 'Split_Adjusted_Price',
        colName: 'Split_Adjusted_Price',
        colId: 'T',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.Original_Price.colId}${rowNum} / ${cols.Split_Ratio.colId}${rowNum}, ${cols.Original_Price.colId}${rowNum})`
    },
    Split_Adjusted_Qty: {
        key: 'Split_Adjusted_Qty',
        colName: 'Split_Adjusted_Qty',
        colId: 'U',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.Original_Qty.colId}${rowNum} * ${cols.Split_Ratio.colId}${rowNum}, ${cols.Original_Qty.colId}${rowNum})`
    },
    numericId: {
        key: 'numericId',
        colName: 'Numeric_ID',
        colId: 'V',
        numeric: true
    },
    Name_Hint: {
        key: 'Name_Hint',
        colName: 'Name_Hint',
        colId: 'W',
    },
};

export const transactionHeaders = Object.values(TXN_COLS).map(c => c.colName) as unknown as readonly string[];
export const transactionMapping: Record<keyof Omit<Transaction, 'grossValue'>, string> =
    Object.keys(TXN_COLS).reduce((acc, key) => {
        const k = key as keyof Omit<Transaction, 'grossValue'>;
        if (TXN_COLS[k]) {
          acc[k] = TXN_COLS[k].colName;
        }
        return acc;
    }, {} as Record<keyof Omit<Transaction, 'grossValue'>, string>);

export const transactionNumericKeys = Object.keys(TXN_COLS).filter(key => TXN_COLS[key as keyof TransactionColumns].numeric).map(key => key) as unknown as (keyof Omit<Transaction, 'grossValue'>)[];

// --- Canonical Headers & Ranges ---

export const portfolioHeaders = ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_%', 'Income_Tax_Vest_%', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Tax_Policy'] as const;

// Merged Price_Unit into Currency logic, removed explicit Price_Unit column
export const holdingsHeaders = [
    'Ticker', 'Exchange', 'Quantity', 'Live_Price', 'Currency', 'Total Holding Value',
    'Name_En', 'Name_He', 'Sector', 'Day_Change',
    'Change_1W', 'Change_1M', 'Change_3M', 'Change_YTD', 'Change_1Y', 'Change_3Y', 'Change_5Y', 'Change_10Y', 'Numeric_ID'
] as const;
export const configHeaders = ['Key', 'Value', '1D Ago', '1W Ago', '1M Ago', '3M Ago', '6M Ago', 'YTD', '1Y Ago', '3Y Ago', '5Y Ago'] as const;
export const holdingsUserOptionsHeaders = ['Ticker', 'Exchange', 'Fallback_Name'] as const;

export type Headers = readonly string[];

export const DEFAULT_SHEET_NAME = 'Portfolios_App_Data';
export const PORT_OPT_RANGE = `Portfolio_Options!A2:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`;
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
export const SHEET_STRUCTURE_VERSION_DATE = '2026-01-13';

// --- Mappings from Sheet Headers to Typescript Object Keys ---

export const portfolioMapping: Record<keyof Omit<Portfolio, 'holdings'>, typeof portfolioHeaders[number]> = {
    id: 'Portfolio_ID', name: 'Display_Name', cgt: 'Cap_Gains_Tax_%', incTax: 'Income_Tax_Vest_%',
    mgmtVal: 'Mgmt_Fee_Val', mgmtType: 'Mgmt_Type', mgmtFreq: 'Mgmt_Freq', commRate: 'Comm_Rate_%',
    commMin: 'Comm_Min', commMax: 'Comm_Max_Fee', currency: 'Currency', divPolicy: 'Div_Policy',
    divCommRate: 'Div_Comm_Rate_%', taxPolicy: 'Tax_Policy'
};
export const portfolioNumericKeys: (keyof Omit<Portfolio, 'holdings'>)[] = ['cgt', 'incTax', 'mgmtVal', 'commRate', 'commMin', 'commMax', 'divCommRate'];

export const holdingMapping: Record<keyof Omit<Holding, 'priceUnit' | 'portfolioId'>, typeof holdingsHeaders[number]> = {
    ticker: 'Ticker', exchange: 'Exchange', qty: 'Quantity',
    price: 'Live_Price', currency: 'Currency', totalValue: 'Total Holding Value',
    name: 'Name_En', name_he: 'Name_He', sector: 'Sector', 
    changePct: 'Day_Change', changePct1w: 'Change_1W', changePct1m: 'Change_1M', changePct3m: 'Change_3M',
    changePctYtd: 'Change_YTD', changePct1y: 'Change_1Y', changePct3y: 'Change_3Y', changePct5y: 'Change_5Y', changePct10y: 'Change_10Y',
    numericId: 'Numeric_ID',
};
export const holdingNumericKeys: (keyof Omit<Holding, 'priceUnit' | 'portfolioId'>)[] = [
    'qty', 'price', 'totalValue', 'changePct', 'changePct1w', 'changePct1m', 'changePct3m',
    'changePctYtd', 'changePct1y', 'changePct3y', 'changePct5y', 'changePct10y', 'numericId'
];