/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/sheets.ts
import type { Portfolio, Transaction, Holding } from './types';
import { ensureGapi, signIn, findSpreadsheetByName } from './google';
import { getTickerData, fetchYahooStockQuote } from './fetching';
import { toGoogleSheetDateFormat } from './date';

const DEFAULT_SHEET_NAME = 'Portfolios_App_Data';

// --- Formula Generators ---

function getGoogleFinanceFormula(query: string, attribute: string, dateExpression?: string) {
    const dateArg = dateExpression ? `, ${dateExpression}` : "";
    return `=IFERROR(INDEX(GOOGLEFINANCE(${query}, "${attribute}"${dateArg}), 2, 2), "")`;
}

function getHistoricalPriceFormula(tickerOrPair: string, dateExpression: string, isCurrency: boolean = false) {
    const query = isCurrency ? `"CURRENCY:${tickerOrPair}"` : tickerOrPair;
    return getGoogleFinanceFormula(query, "price", dateExpression);
}

// --- Column Definitions ---
interface TxnColumnDef {
    key: keyof Omit<Transaction, 'grossValue'> | string;
    colName: string;
    colId: string;
    numeric?: boolean;
    formula?: (rowNum: number, cols: TransactionColumns) => string;
}

// Utility type to enforce all keys of Transaction are present
type TransactionColumns = {
    [K in keyof Omit<Transaction, 'grossValue'>]: TxnColumnDef;
} & {
    [key: string]: TxnColumnDef;
};

const TXN_COLS: TransactionColumns = {
    date: { key: 'date', colName: 'Date', colId: 'A' },
    portfolioId: { key: 'portfolioId', colName: 'Portfolio', colId: 'B' },
    ticker: { key: 'ticker', colName: 'Ticker', colId: 'C' },
    exchange: { key: 'exchange', colName: 'Exchange', colId: 'D' },
    type: { key: 'type', colName: 'Type', colId: 'E' },
    Original_Qty: { key: 'Original_Qty', colName: 'Original_Qty', colId: 'F', numeric: true },
    Original_Price: { key: 'Original_Price', colName: 'Original_Price', colId: 'G', numeric: true },
    currency: { key: 'currency', colName: 'Currency', colId: 'H' },
    Original_Price_NIS: {
        key: 'Original_Price_NIS',
        colName: 'Original_Price_NIS',
        colId: 'I',
        numeric: true,
        formula: (rowNum, cols) => `=IF(${cols.currency.colId}${rowNum}="ILS", ${cols.Original_Price.colId}${rowNum}, ${cols.Original_Price.colId}${rowNum} * INDEX(GOOGLEFINANCE("CURRENCY:" & ${cols.currency.colId}${rowNum} & "ILS", "price", ${cols.date.colId}${rowNum}), 2, 2))`
    },
    vestDate: { key: 'vestDate', colName: 'Vesting_Date', colId: 'J' },
    comment: { key: 'comment', colName: 'Comments', colId: 'K' },
    commission: { key: 'commission', colName: 'Commission', colId: 'L', numeric: true },
    tax: { key: 'tax', colName: 'Tax %', colId: 'M', numeric: true },
    Source: { key: 'Source', colName: 'Source', colId: 'N' },
    Creation_Date: { key: 'Creation_Date', colName: 'Creation_Date', colId: 'O' },
    Orig_Open_Price_At_Creation_Date: { key: 'Orig_Open_Price_At_Creation_Date', colName: 'Orig_Open_Price_At_Creation_Date', colId: 'P', numeric: true },
    Split_Adj_Open_Price: {
        key: 'Split_Adj_Open_Price',
        colName: 'Split_Adj_Open_Price',
        colId: 'Q',
        numeric: true,
        // TODO: This formula likely fetches current price, not historical on date. Needs to be INDEX(GOOGLEFINANCE(..., "all", date), 2, 2) or similar
        formula: (rowNum, cols) => `=INDEX(GOOGLEFINANCE(${cols.exchange.colId}${rowNum}&":"&${cols.ticker.colId}${rowNum}, "open", ${cols.Creation_Date.colId}${rowNum}), 2, 2)`
    },
    Split_Ratio: {
        key: 'Split_Ratio',
        colName: 'Split_Ratio',
        colId: 'R',
        numeric: true,
        formula: (rowNum, cols) => `=ROUND(IFERROR(IF(OR(ISBLANK(${cols.Split_Adj_Open_Price.colId}${rowNum}), ${cols.Split_Adj_Open_Price.colId}${rowNum}=0, ISBLANK(${cols.Orig_Open_Price_At_Creation_Date.colId}${rowNum})), 1, ${cols.Orig_Open_Price_At_Creation_Date.colId}${rowNum} / ${cols.Split_Adj_Open_Price.colId}${rowNum}), 1), 2)`
    },
    Split_Adjusted_Price: {
        key: 'Split_Adjusted_Price',
        colName: 'Split_Adjusted_Price',
        colId: 'S',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.Original_Price.colId}${rowNum} / ${cols.Split_Ratio.colId}${rowNum}, ${cols.Original_Price.colId}${rowNum})`
    },
    Split_Adjusted_Qty: {
        key: 'Split_Adjusted_Qty',
        colName: 'Split_Adjusted_Qty',
        colId: 'T',
        numeric: true,
        formula: (rowNum, cols) => `=IFERROR(${cols.Original_Qty.colId}${rowNum} * ${cols.Split_Ratio.colId}${rowNum}, ${cols.Original_Qty.colId}${rowNum})`
    },
};

const transactionHeaders = Object.values(TXN_COLS).map(c => c.colName) as unknown as readonly string[];
const transactionMapping: Record<keyof Omit<Transaction, 'grossValue'>, string> =
    Object.keys(TXN_COLS).reduce((acc, key) => {
        const k = key as keyof Omit<Transaction, 'grossValue'>;
        acc[k] = TXN_COLS[k].colName;
        return acc;
    }, {} as Record<keyof Omit<Transaction, 'grossValue'>, string>);

const transactionNumericKeys = Object.keys(TXN_COLS).filter(key => TXN_COLS[key as keyof Transaction].numeric).map(key => key) as unknown as (keyof Omit<Transaction, 'grossValue'>)[];

// --- Canonical Headers & Ranges ---

const portfolioHeaders = ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_%', 'Income_Tax_Vest_%', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Tax_Policy'] as const;

const holdingsHeaders = [
    'PortfolioId', 'Ticker', 'Exchange', 'Quantity', 'Live_Price', 'Currency', 'Total Holding Value',
    'Name_En', 'Name_He', 'Sector', 'Price_Unit', 'Day_Change',
    'Change_1W', 'Change_1M', 'Change_3M', 'Change_YTD', 'Change_1Y', 'Change_3Y', 'Change_5Y', 'Change_10Y'
] as const;
const configHeaders = ['Key', 'Value', '1D Ago', '1W Ago', '1M Ago', '3M Ago', '6M Ago', 'YTD', '1Y Ago', '3Y Ago', '5Y Ago'] as const;

type Headers = readonly string[];

const PORT_OPT_RANGE = `Portfolio_Options!A2:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`;
const TX_SHEET_NAME = 'Transaction_Log';
const TX_FETCH_RANGE = `${TX_SHEET_NAME}!A2:${String.fromCharCode(65 + transactionHeaders.length - 1)}`;
const CONFIG_RANGE = `Currency_Conversions!A2:B`;
const METADATA_SHEET = 'App_Metadata';
const metadataHeaders = ['Key', 'Value'] as const;
const METADATA_RANGE = METADATA_SHEET + '!A:B';
const HOLDINGS_SHEET = 'Holdings';
const HOLDINGS_RANGE = `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}`;

// --- Data Mapping Utilities ---

function createRowMapper<T extends readonly string[]>(headers: T) {
    const headerMap = new Map(headers.map((h, i) => [h, i]));
    return <U>(row: any[], mapping: Record<keyof U, typeof headers[number]>, numericKeys: (keyof U)[] = []) => {
        const obj: Partial<U> = {};
        for (const key in mapping) {
            const headerName = mapping[key];
            const index = headerMap.get(headerName);
            if (index !== undefined && row[index] !== undefined && row[index] !== null) {
                let value: any = row[index];
                if (numericKeys.includes(key)) {
                    const numVal = parseFloat(String(value).replace(/,/g, '').replace(/%/, ''));
                    obj[key] = isNaN(numVal) ? 0 : numVal;
                    if (mapping[key].includes('%')) obj[key] = (obj[key] as number) / 100;
                } else {
                    obj[key] = value;
                }
            }
        }
        return obj as U;
    };
}

function objectToRow<T extends object>(obj: T, headers: readonly string[], colDefs: TransactionColumns): any[] {
    const row = new Array(headers.length).fill(null);
    const keys = Object.keys(colDefs) as Array<keyof TransactionColumns>;

    keys.forEach((key, i) => {
        const colDef = colDefs[key];
        const value = (obj as any)[key];

        if (value !== undefined && value !== null) {
            row[i] = value;
        }
        // Formulas are added in a separate update step
    });
    return row;
}

// --- Mappings from Sheet Headers to Typescript Object Keys ---

const portfolioMapping: Record<keyof Omit<Portfolio, 'holdings'>, typeof portfolioHeaders[number]> = {
    id: 'Portfolio_ID', name: 'Display_Name', cgt: 'Cap_Gains_Tax_%', incTax: 'Income_Tax_Vest_%',
    mgmtVal: 'Mgmt_Fee_Val', mgmtType: 'Mgmt_Type', mgmtFreq: 'Mgmt_Freq', commRate: 'Comm_Rate_%',
    commMin: 'Comm_Min', commMax: 'Comm_Max_Fee', currency: 'Currency', divPolicy: 'Div_Policy',
    divCommRate: 'Div_Comm_Rate_%', taxPolicy: 'Tax_Policy'
};
const portfolioNumericKeys: (keyof Omit<Portfolio, 'holdings'>)[] = ['cgt', 'incTax', 'mgmtVal', 'commRate', 'commMin', 'commMax', 'divCommRate'];

const holdingMapping: Record<keyof Holding, typeof holdingsHeaders[number]> = {
    portfolioId: 'PortfolioId', ticker: 'Ticker', exchange: 'Exchange', qty: 'Quantity',
    price: 'Live_Price', currency: 'Currency', totalValue: 'Total Holding Value',
    name: 'Name_En', name_he: 'Name_He', sector: 'Sector', priceUnit: 'Price_Unit',
    changePct: 'Day_Change', changePct1w: 'Change_1W', changePct1m: 'Change_1M', changePct3m: 'Change_3M',
    changePctYtd: 'Change_YTD', changePct1y: 'Change_1Y', changePct3y: 'Change_3Y', changePct5y: 'Change_5Y', changePct10y: 'Change_10Y',
};
const holdingNumericKeys: (keyof Holding)[] = [
    'qty', 'price', 'totalValue', 'changePct', 'changePct1w', 'changePct1m', 'changePct3m',
    'changePctYtd', 'changePct1y', 'changePct3y', 'changePct5y', 'changePct10y'
];

// --- Mappers for each data type ---

const mapRowToPortfolio = createRowMapper(portfolioHeaders);
const mapRowToTransaction = createRowMapper(transactionHeaders);
const mapRowToHolding = createRowMapper(holdingsHeaders);

// Helper to get Sheet ID by Name
async function getSheetId(spreadsheetId: string, sheetName: string, create = false): Promise<number> {
    await ensureGapi();
    const res = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    let sheet = res.result.sheets?.find((s: any) => s.properties.title === sheetName);
    if (!sheet && create) {
        const addSheetRequest = {
            spreadsheetId,
            resource: {
                requests: [{ addSheet: { properties: { title: sheetName } } }]
            }
        };
        const response = await window.gapi.client.sheets.spreadsheets.batchUpdate(addSheetRequest);
        const newSheetId = response.result.replies[0].addSheet.properties.sheetId;
        return newSheetId;
    }
    return sheet?.properties.sheetId || 0;
}

// Function to create header rows
function createHeaderUpdateRequest(sheetId: number, headers: Headers) {
    return {
        updateCells: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: headers.map(h => ({ userEnteredValue: { stringValue: h } })) }],
            fields: 'userEnteredValue'
        }
    };
}

export const ensureSchema = async (spreadsheetId: string) => {
    await ensureGapi();
    const sheetIds = {
        portfolio: await getSheetId(spreadsheetId, 'Portfolio_Options', true),
        log: await getSheetId(spreadsheetId, TX_SHEET_NAME, true),
        holdings: await getSheetId(spreadsheetId, HOLDINGS_SHEET, true),
        config: await getSheetId(spreadsheetId, 'Currency_Conversions', true),
        metadata: await getSheetId(spreadsheetId, METADATA_SHEET, true),
    };

    // Rename Live_Data to Holdings if it exists
    try {
        const liveDataSheetId = await getSheetId(spreadsheetId, 'Live_Data');
        if (liveDataSheetId) {
            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        updateSheetProperties: {
                            properties: { sheetId: liveDataSheetId, title: HOLDINGS_SHEET },
                            fields: 'title'
                        }
                    }]
                }
            });
            sheetIds.holdings = liveDataSheetId;
            console.log(`Renamed sheet 'Live_Data' to '${HOLDINGS_SHEET}'`);
        }
    } catch (e) {
        console.warn("Could not rename Live_Data sheet, likely doesn't exist.");
    }

    const batchUpdate = {
        spreadsheetId,
        resource: {
            requests: [
                createHeaderUpdateRequest(sheetIds.portfolio, portfolioHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.log, transactionHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.holdings, holdingsHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.config, configHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.metadata, metadataHeaders as unknown as Headers),
            ]
        }
    };


    await window.gapi.client.sheets.spreadsheets.batchUpdate(batchUpdate);
    // Initial Config Data
    const createCurrencyRow = (currencyPair: string) => {
        return [
            currencyPair,
            `=GOOGLEFINANCE("CURRENCY:${currencyPair}")`, // Current Value
            getHistoricalPriceFormula(currencyPair, "TODAY()-1", true),    // 1D Ago
            getHistoricalPriceFormula(currencyPair, "TODAY()-7", true),    // 1W Ago
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-1)", true),  // 1M Ago
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-3)", true),  // 3M Ago
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-6)", true),  // 6M Ago
            getHistoricalPriceFormula(currencyPair, "DATE(YEAR(TODAY()),1,1)", true), // YTD
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-12)", true), // 1Y Ago
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-36)", true), // 3Y Ago
            getHistoricalPriceFormula(currencyPair, "EDATE(TODAY(),-60)", true), // 5Y Ago
        ];
    };

    const initialConfig = [
        createCurrencyRow('USDILS'),
        createCurrencyRow('EURUSD'),
        createCurrencyRow('GBPUSD'),
        createCurrencyRow('ILSUSD'),
    ];

    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Currency_Conversions!A2',
        valueInputOption: 'USER_ENTERED',
        resource: { values: initialConfig }
    });

    // Store schema creation date
    await setMetadataValue(spreadsheetId, 'schema_created', toGoogleSheetDateFormat(new Date()));
};

// --- Data Fetching Functions ---

async function fetchSheetData<T>(
    spreadsheetId: string,
    range: string,
    rowMapper: (row: any[]) => T,
    valueRenderOption = 'FORMATTED_VALUE'
): Promise<T[]> {
    await ensureGapi();
    try {
        const res = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
            valueRenderOption,
        });
        const rows = res.result.values || [];
        return rows.map(rowMapper).filter(Boolean);
    } catch (error) {
        console.error("Error fetching from range " + range + ":", error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

export const fetchPortfolios = async (spreadsheetId: string): Promise<Portfolio[]> => {
    const portfolios = await fetchSheetData(spreadsheetId, PORT_OPT_RANGE, (row) =>
        mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys)
    );

    let holdings: Holding[] = [];
    try {
        holdings = await fetchSheetData(spreadsheetId, HOLDINGS_RANGE, (row) =>
            mapRowToHolding<Holding>(row, holdingMapping, holdingNumericKeys)
        );
    } catch (e) {
        console.warn("Holdings sheet not found or error fetching, continuing without holdings data:", e);
    }

    if (holdings.length > 0) {
        const holdingsByPortId = holdings.reduce((acc, holding) => {
            const portId = holding.portfolioId;
            if (!acc[portId]) {
                acc[portId] = [];
            }
            acc[portId].push(holding);
            return acc;
        }, {} as Record<string, Holding[]>);

        return portfolios.map(p => ({
            ...p,
            holdings: holdingsByPortId[p.id] || []
        }));
    }

    return portfolios;
};

export const fetchTransactions = async (spreadsheetId: string): Promise<Transaction[]> => {
    const transactions = await fetchSheetData(
        spreadsheetId,
        TX_FETCH_RANGE,
        (row) => mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row, transactionMapping, transactionNumericKeys),
        'FORMATTED_VALUE' // Fetch formatted values to get results of formulas
    );
    return transactions.map(t => ({ 
        ...t,
        qty: parseFloat(t.Split_Adjusted_Qty || t.Original_Qty || 0),
        price: parseFloat(t.Split_Adjusted_Price || t.Original_Price || 0),
        grossValue: (t.Original_Qty || 0) * (t.Original_Price || 0) 
    }));
};

export const getSpreadsheet = async (): Promise<string | null> => {
    await ensureGapi(); // Ensure GAPI is loaded and user is signed in
    const storedId = localStorage.getItem('g_sheet_id');
    if (storedId) {
        return storedId;
    }

    console.log("No sheet ID in local storage, searching in Google Drive...");
    const foundId = await findSpreadsheetByName(DEFAULT_SHEET_NAME);

    if (foundId) {
        console.log(`Found sheet with ID: ${foundId}. Storing it in local storage.`);
        localStorage.setItem('g_sheet_id', foundId);
        return foundId;
    }

    console.log("No existing spreadsheet found in Drive.");
    return null;
};

export const createPortfolioSpreadsheet = async (title: string = DEFAULT_SHEET_NAME): Promise<string | null> => {
    await ensureGapi();
    try {
        const spreadsheet = await window.gapi.client.sheets.spreadsheets.create({
            properties: {
                title: title,
            },
        });
        const spreadsheetId = spreadsheet.result.spreadsheetId;
        if (spreadsheetId) {
            await ensureSchema(spreadsheetId);
        }
        return spreadsheetId;
    } catch (error) {
        console.error("Error creating spreadsheet:", error);
        return null;
    }
};

export const createEmptySpreadsheet = async (title: string): Promise<string | null> => {
    await ensureGapi();
    try {
        const spreadsheet = await window.gapi.client.sheets.spreadsheets.create({
            properties: { title }
        });
        const newSpreadsheetId = spreadsheet.result.spreadsheetId;
        return newSpreadsheetId;
    } catch (error) {
        console.error('Error creating empty spreadsheet:', error);
        return null;
    }
};

export const fetchHolding = async (spreadsheetId: string, ticker: string, exchange: string): Promise<Holding | null> => {
    await ensureGapi();
    try {
        const res = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_RANGE,
        });
        const rows = res.result.values || [];
        const tickerIndex = holdingsHeaders.indexOf('Ticker');
        const exchangeIndex = holdingsHeaders.indexOf('Exchange');

        const holdingRow = rows.find(row => row[tickerIndex] === ticker.toUpperCase() && row[exchangeIndex] === exchange.toUpperCase());

        if (holdingRow) {
            return mapRowToHolding<Holding>(holdingRow, holdingMapping, holdingNumericKeys);
        }
        return null;
    } catch (error) {
        console.error(`Error fetching holding for ${ticker}:${exchange}:`, error);
        throw error;
    }
};

// --- Data Writing Functions ---

export const addPortfolio = async (spreadsheetId: string, p: Portfolio) => {
    await ensureGapi();
    const row = objectToRow(p, portfolioMapping, portfolioHeaders);
    await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Portfolio_Options!A:A', // Append to the first column to add a new row
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
};

export const updatePortfolio = async (spreadsheetId: string, p: Portfolio) => {
    await ensureGapi();
    // Fetch header and all data to find the row index reliably
    const { result } = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Portfolio_Options!A1:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`
    });

    const values = result.values || [];
    if (values.length < 2) { // Need header + at least one data row
        throw new Error(`Portfolio sheet for ID ${p.id} is empty or missing headers.`);
    }

    const headers = values[0];
    const idColumnIndex = headers.indexOf(portfolioMapping.id);
    if (idColumnIndex === -1) {
        throw new Error(`'${portfolioMapping.id}' column not found in sheet.`);
    }

    const dataRows = values.slice(1);
    const rowIndex = dataRows.findIndex((row: any[]) => row[idColumnIndex] === p.id);

    if (rowIndex === -1) {
        throw new Error(`Portfolio with ID ${p.id} not found`);
    }

    const rowNum = rowIndex + 2; // +2 because sheets are 1-indexed and data starts at row 2
    const endColumn = String.fromCharCode(65 + portfolioHeaders.length - 1);
    const range = `Portfolio_Options!A${rowNum}:${endColumn}${rowNum}`;
    const rowData = objectToRow(p, portfolioMapping, portfolioHeaders);

    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
    });
};


export const addTransaction = async (spreadsheetId: string, t: Transaction) => {
    await ensureGapi();

    const rowData: { [key: string]: any } = {};

    Object.values(TXN_COLS).forEach(colDef => {
        const key = colDef.key as keyof Transaction;

        switch (key) {
            case 'date':
                rowData[key] = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : '';
                break;
            case 'ticker':
                rowData[key] = t.ticker.toUpperCase();
                break;
            case 'exchange':
                rowData[key] = (t.exchange || '').toUpperCase();
                break;
            case 'vestDate':
                rowData[key] = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : '';
                break;
            case 'comment':
            case 'Source':
                rowData[key] = t[key] || '';
                break;
            case 'commission':
            case 'tax':
                rowData[key] = t[key] || 0;
                break;
            case 'Creation_Date':
                rowData[key] = toGoogleSheetDateFormat(new Date());
                break;
            case 'Orig_Open_Price_At_Creation_Date':
                rowData[key] = t[key];
                break;
            // Calculated fields are handled by formulas in the sheet, so we don't provide a value here
            case 'Split_Adj_Open_Price':
            case 'Split_Ratio':
            case 'Split_Adjusted_Price':
            case 'Split_Adjusted_Qty':
                break;
            default:
                if (key in t) {
                    rowData[key] = t[key as keyof Transaction];
                }
        }
    });

    // Step 1: Append only the values that are not formulas
    const valuesToAppend = Object.values(TXN_COLS).map(colDef => {
        return colDef.formula ? null : rowData[colDef.key] ?? null;
    });

    const appendResult = await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${TX_SHEET_NAME}!A:A`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [valuesToAppend] }
    });

    const updatedRange = appendResult.result.updates.updatedRange;
    if (!updatedRange) {
        throw new Error("Could not determine range of appended row.");
    }

    const rowNumMatch = updatedRange.match(/(\d+):/);
    if (!rowNumMatch) {
        throw new Error("Could not parse row number from range: " + updatedRange);
    }
    const rowNum = parseInt(rowNumMatch[1]);

    // Step 2: Update the formula cells in the new row
    const formulaColDefs = Object.values(TXN_COLS).filter(colDef => !!colDef.formula);
    const txSheetId = await getSheetId(spreadsheetId, TX_SHEET_NAME);

    const requests = formulaColDefs.map((colDef) => {
        const formula = colDef.formula!(rowNum, TXN_COLS);
        const colIndex = Object.values(TXN_COLS).indexOf(colDef);
        return {
            updateCells: {
                range: {
                    sheetId: txSheetId,
                    startRowIndex: rowNum - 1,
                    endRowIndex: rowNum,
                    startColumnIndex: colIndex,
                    endColumnIndex: colIndex + 1,
                },
                rows: [
                    { values: [{ userEnteredValue: { formulaValue: formula } }] }
                ],
                fields: 'userEnteredValue.formulaValue'
            }
        };
    });

    if (requests.length > 0) {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
    }

    await rebuildHoldingsSheet(spreadsheetId);
};

// Helper function to create a row for the Holdings sheet
function createHoldingRow(h: Omit<Holding, 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'priceUnit' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>, meta: any, rowNum: number) {
    const tickerCell = `B${rowNum}`;
    const exchangeCell = `C${rowNum}`;
    const qtyCell = `D${rowNum}`;
    const priceCell = `E${rowNum}`;
    const tickerAndExchange = `${exchangeCell}&":"&${tickerCell}`;

    const row = new Array(holdingsHeaders.length).fill('');

    row[0] = h.portfolioId;
    row[1] = h.ticker.toUpperCase();
    row[2] = (h.exchange || '').toUpperCase();
    row[3] = h.qty;
    row[4] = meta?.price || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "price"))`; // Live_Price
    row[5] = meta?.currency || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"))`; // Currency
    row[6] = `=${qtyCell}*${priceCell}`; // Total Holding Value
    row[7] = meta?.name || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), "")`; // Name_En
    row[8] = meta?.name_he || ""; // Name_He
    row[9] = meta?.sector || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "sector"), "Other")`; // Sector
    row[10] = meta?.priceUnit || ""; // Price_Unit
    row[11] = meta?.changePct || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`; // Day_Change

    // Performance Columns - Always write formulas
    const priceFormula = (dateExpr: string) => getHistoricalPriceFormula(tickerAndExchange, dateExpr).substring(1);
    row[12] = `=IFERROR((${priceCell}/${priceFormula("TODAY()-7")})-1, "")`; // Change_1W
    row[13] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-1)")})-1, "")`; // Change_1M
    row[14] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-3)")})-1, "")`; // Change_3M
    row[15] = `=IFERROR(${priceCell} / ${priceFormula("DATE(YEAR(TODAY())-1, 12, 31)")} - 1, "")`; // Change_YTD
    row[16] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-12)")})-1, "")`; // Change_1Y
    row[17] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-36)")})-1, "")`; // Change_3Y
    row[18] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-60)")})-1, "")`; // Change_5Y
    row[19] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-120)")})-1, "")`; // Change_10Y

    return row;
}

// Rebuild Holdings sheet
export const rebuildHoldingsSheet = async (spreadsheetId: string) => {
    await ensureGapi();
    const transactions = await fetchTransactions(spreadsheetId);

    const holdings: Record<string, Omit<Holding, 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'priceUnit' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'> & { portfolioId: string }> = {};

    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL') {
            const key = `${txn.portfolioId}-${txn.ticker}-${txn.exchange}`;
            if (!holdings[key]) {
                holdings[key] = { portfolioId: txn.portfolioId, ticker: txn.ticker, exchange: txn.exchange || '', qty: 0 };
            }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
            const qty = parseFloat(txn.Split_Adjusted_Qty || txn.Original_Qty.toString());
            holdings[key].qty += qty * multiplier;
        }
    });

    const uniqueHoldings = Object.values(holdings).filter(h => h.qty > 1e-6);

    const enrichedData = await Promise.all(uniqueHoldings.map(async (h) => {
        let meta = null;
        if ((h.exchange || '').toUpperCase() === 'TASE') {
            try {
                meta = await getTickerData(h.ticker, h.exchange);
            } catch (e) {
                console.warn("Failed to fetch metadata for " + h.ticker, e);
            }
        }
        return { h, meta };
    }));

    const data = enrichedData.map(({ h, meta }, i) => createHoldingRow(h, meta, i + 2));

    await window.gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}` });
    if (data.length > 0) {
        await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: HOLDINGS_SHEET + '!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: data }
        });
    }
    await setMetadataValue(spreadsheetId, 'holdings_rebuild', toGoogleSheetDateFormat(new Date()));
};

export const fetchSheetExchangeRates = async (spreadsheetId: string): Promise<Record<string, number>> => {
    await ensureGapi();
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CONFIG_RANGE,
    });

    const rows = res.result.values || [];
    const rates: Record<string, number> = { USD: 1 };

    const keyIndex = configHeaders.indexOf('Key');
    const valueIndex = configHeaders.indexOf('Value');

    rows.forEach((r: string[]) => {
        const pair = r[keyIndex];
        const val = parseFloat(r[valueIndex]);

        if (pair && !isNaN(val)) {
            if (pair.startsWith('USD') && pair.length === 6) {
                const target = pair.substring(3);
                rates[target] = val;
            } else if (pair.endsWith('USD') && pair.length === 6) {
                const source = pair.substring(0, 3);
                rates[source] = 1 / val;
            }
        }
    });
    return rates;
};

export async function getMetadataValue(spreadsheetId: string, key: string): Promise<string | null> {
    await ensureGapi();
    try {
        const res = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: METADATA_RANGE,
        });
        const rows: string[][] = res.result.values || [];
        const keyIndex = metadataHeaders.indexOf('Key');
        const valueIndex = metadataHeaders.indexOf('Value');
        const row = rows.find((r: any[]) => r[keyIndex] === key);
        return row ? row[valueIndex] : null;
    } catch (error) {
        console.error("Error fetching metadata for key " + key + ":", error);
        throw error;
    }
}

export async function setMetadataValue(spreadsheetId: string, key: string, value: string): Promise<void> {
    await ensureGapi();
    try {
        const res = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: METADATA_RANGE,
        });
        const rows = res.result.values || [];
        const keyIndex = metadataHeaders.indexOf('Key');
        const existingRowIndex = rows.findIndex((r: any[]) => r[keyIndex] === key);

        if (existingRowIndex > -1) {
            // Update existing key
            const rowNum = existingRowIndex + 1; // 1-based index
            await window.gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: METADATA_SHEET + '!B' + rowNum,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[value]] }
            });
        } else {
            // Append new key
            await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: METADATA_SHEET + '!A:A',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[key, value]] }
            });
        }
    } catch (error) {
        console.error("Error setting metadata for key " + key + ":", error);
        throw error;
    }
}

export async function exportToSheet(spreadsheetId: string, sheetName: string, headers: string[], data: any[][]): Promise<number> {
    await ensureGapi();

    const sheetId = await getSheetId(spreadsheetId, sheetName, true);

    await window.gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: sheetName,
    });

    const values = [headers, ...data];

    await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
    });

    return sheetId;
}

// Populate the spreadsheet with 3 sample portfolios and several transactions each
export const populateTestData = async (spreadsheetId: string) => {
    await ensureGapi();
    try { await signIn(); } catch (e) { console.error("Sign-in failed", e) }
    try { await ensureSchema(spreadsheetId); } catch (e) { console.error("Schema creation failed", e) }

    const portfolios: Portfolio[] = [
        { id: 'P-IL-GROWTH', name: 'Growth ILS', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0.001, commMin: 5, commMax: 0, currency: 'ILS', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'REAL_GAIN' },
        { id: 'P-USD-CORE', name: 'Core USD', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-RSU', name: 'RSU Account', cgt: 0.25, incTax: 0.5, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'hybrid_rsu', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-GEMMEL', name: 'Gemmel', cgt: 0, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'ILS', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'REAL_GAIN' }
    ];

    for (const p of portfolios) {
        try { await addPortfolio(spreadsheetId, p); } catch (e) { console.warn("Could not add portfolio (it might already exist)", e) }
    }

    const transactions: Transaction[] = [
        // P-IL-GROWTH Portfolio
        { date: '01/02/2025', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', Original_Qty: 100, Original_Price: 180, currency: 'ILS', comment: 'Initial buy Leumi', commission: 5, tax: 0, Source: 'MANUAL', Creation_Date: '01/02/2025', Orig_Open_Price_At_Creation_Date: 179.5, vestDate: '' },
        { date: '02/15/2025', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 10, currency: 'ILS', comment: 'Dividend payout', commission: 0, tax: 0.25, Source: 'MANUAL', Creation_Date: '02/15/2025', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '06/10/2025', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', Original_Qty: 50, Original_Price: 190, currency: 'ILS', comment: 'Add to Leumi', commission: 10, tax: 0, Source: 'BROKER_CSV', Creation_Date: '06/10/2025', Orig_Open_Price_At_Creation_Date: 189, vestDate: '' },
        { date: '07/15/2025', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'SELL', Original_Qty: 30, Original_Price: 200, currency: 'ILS', comment: 'Sell some Leumi', commission: 8, tax: 0.25, Source: 'MANUAL', Creation_Date: '07/15/2025', Orig_Open_Price_At_Creation_Date: 200, vestDate: '' },

        // P-USD-CORE Portfolio
        { date: '03/01/2025', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 10, Original_Price: 150, currency: 'USD', comment: 'Core buy', commission: 1, tax: 0, Source: 'MANUAL', Creation_Date: '03/01/2025', Orig_Open_Price_At_Creation_Date: 149, vestDate: '' },
        { date: '08/01/2025', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 5, currency: 'USD', comment: 'Quarterly dividend', commission: 0, tax: 0.25, Source: 'MANUAL', Creation_Date: '08/01/2025', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '11/20/2025', portfolioId: 'P-USD-CORE', ticker: 'META', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 5, Original_Price: 300, currency: 'USD', comment: 'Speculative buy', commission: 1, tax: 0, Source: 'MANUAL', Creation_Date: '11/20/2025', Orig_Open_Price_At_Creation_Date: 298, vestDate: '' },
        { date: '11/21/2025', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'SELL', Original_Qty: 5, Original_Price: 200, currency: 'USD', comment: 'Trim position', commission: 1, tax: 0.25, Source: 'MANUAL', Creation_Date: '11/21/2025', Orig_Open_Price_At_Creation_Date: 201, vestDate: '' },

        // P-RSU Portfolio (vesting GOOG shares)
        { date: '04/10/2025', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 10, Original_Price: 0.01, currency: 'USD', comment: 'RSU vested', commission: 0, tax: 0, Source: 'BROKER_CSV', Creation_Date: '04/10/2025', Orig_Open_Price_At_Creation_Date: 140, vestDate: '04/10/2025' },
        { date: '07/10/2025', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 2, currency: 'USD', comment: 'RSU dividend', commission: 0, tax: 0.5, Source: 'BROKER_CSV', Creation_Date: '07/10/2025', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '12/01/2025', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'SELL', Original_Qty: 2, Original_Price: 155, currency: 'USD', comment: 'Sell vested RSUs for tax', commission: 1, tax: 0.25, Source: 'BROKER_CSV', Creation_Date: '12/01/2025', Orig_Open_Price_At_Creation_Date: 155, vestDate: '' },
        
        // P-GEMMEL Portfolio
        { date: '04/01/2025', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', Original_Qty: 100, Original_Price: 100, currency: 'ILS', comment: 'Gemmel buy 1', commission: 0, tax: 0, Source: 'MANUAL', Creation_Date: '04/01/2025', Orig_Open_Price_At_Creation_Date: 100, vestDate: '' },
        { date: '05/01/2025', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', Original_Qty: 50, Original_Price: 105, currency: 'ILS', comment: 'Gemmel buy 2', commission: 0, tax: 0, Source: 'MANUAL', Creation_Date: '05/01/2025', Orig_Open_Price_At_Creation_Date: 105, vestDate: '' },
    ];

    for (const t of transactions) {
        try { await addTransaction(spreadsheetId, t); } catch (e) { console.warn("Could not add transaction (it might already exist)", e) }
    }

    await rebuildHoldingsSheet(spreadsheetId);
};