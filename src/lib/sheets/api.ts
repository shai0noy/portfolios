/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, findSpreadsheetByName } from '../google';
import { getTickerData } from '../fetching';
import { toGoogleSheetDateFormat } from '../date';
import type { Portfolio, Transaction, Holding } from '../types';
import {
    TXN_COLS, transactionHeaders, transactionMapping, transactionNumericKeys,
    portfolioHeaders, holdingsHeaders, configHeaders, portfolioMapping, portfolioNumericKeys,
    holdingMapping, holdingNumericKeys, type Headers, DEFAULT_SHEET_NAME, PORT_OPT_RANGE,
    TX_SHEET_NAME, TX_FETCH_RANGE, CONFIG_SHEET_NAME, CONFIG_RANGE, METADATA_SHEET,
    metadataHeaders, METADATA_RANGE, HOLDINGS_SHEET, HOLDINGS_RANGE
} from './config';
import { getHistoricalPriceFormula, getUsdIlsFormula } from './formulas';
import { logIfFalsy } from '../utils';
import { createRowMapper, fetchSheetData, objectToRow, createHeaderUpdateRequest, getSheetId } from './utils';

// --- Mappers for each data type ---
const mapRowToPortfolio = createRowMapper(portfolioHeaders);
const mapRowToTransaction = createRowMapper(transactionHeaders);
const mapRowToHolding = createRowMapper(holdingsHeaders);

export const ensureSchema = async (spreadsheetId: string) => {
    const gapi = await ensureGapi();
    const sheetIds = {
        portfolio: await getSheetId(spreadsheetId, 'Portfolio_Options', true),
        log: await getSheetId(spreadsheetId, TX_SHEET_NAME, true),
        holdings: await getSheetId(spreadsheetId, HOLDINGS_SHEET, true),
        config: await getSheetId(spreadsheetId, CONFIG_SHEET_NAME, true),
        metadata: await getSheetId(spreadsheetId, METADATA_SHEET, true),
    };

    const batchUpdate = {
        spreadsheetId,
        resource: {
            requests: [
                // Update headers for all sheets to ensure schema synchronization.
                // This guarantees the sheet columns match the code's expected structure, 
                // allowing for safe addition or renaming of columns in the future.
                createHeaderUpdateRequest(sheetIds.portfolio, portfolioHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.log, transactionHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.holdings, holdingsHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.config, configHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds.metadata, metadataHeaders as unknown as Headers),
                // Format Date columns (A=date, K=vestDate, P=Creation_Date) to YYYY-MM-DD
                {
                    repeatCell: {
                        range: { sheetId: sheetIds.log, startColumnIndex: 0, endColumnIndex: 1, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: sheetIds.log, startColumnIndex: 10, endColumnIndex: 11, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: sheetIds.log, startColumnIndex: 15, endColumnIndex: 16, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                }
            ]
        }
    };
    await gapi.client.sheets.spreadsheets.batchUpdate(batchUpdate);

    // Initial Config Data
    const createCurrencyRow = (currencyPair: string) => {
        const getFormula = (dateExpr: string) => getHistoricalPriceFormula(currencyPair, dateExpr, true);
        return [
            currencyPair,
            currencyPair === 'USDILS' ? "=" + getUsdIlsFormula("TODAY()") : `=GOOGLEFINANCE("CURRENCY:${currencyPair}")`,
            getFormula("TODAY()-1"), getFormula("TODAY()-7"), getFormula("EDATE(TODAY(),-1)"),
            getFormula("EDATE(TODAY(),-3)"), getFormula("EDATE(TODAY(),-6)"), getFormula("DATE(YEAR(TODAY()),1,1)"),
            getFormula("EDATE(TODAY(),-12)"), getFormula("EDATE(TODAY(),-36)"), getFormula("EDATE(TODAY(),-60)"),
        ];
    };

    const initialConfig = [
        createCurrencyRow('USDILS'), createCurrencyRow('EURILS'), createCurrencyRow('GBPILS'), createCurrencyRow('USDEUR'),
    ];
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: CONFIG_RANGE, valueInputOption: 'USER_ENTERED',
        resource: { values: initialConfig }
    });
    await setMetadataValue(spreadsheetId, 'schema_created', toGoogleSheetDateFormat(new Date()));
};

export const fetchHolding = async (spreadsheetId: string, ticker: string, exchange: string): Promise<Holding | null> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_RANGE,
        });
        const rows = res.result.values || [];
        const tickerIndex = holdingsHeaders.indexOf('Ticker');
        const exchangeIndex = holdingsHeaders.indexOf('Exchange');

        const holdingRow = rows.find((row: any) => row[tickerIndex] === ticker.toUpperCase() && row[exchangeIndex] === exchange.toUpperCase());

        if (holdingRow) {
            return mapRowToHolding<Omit<Holding, 'priceUnit'>>(holdingRow, holdingMapping, holdingNumericKeys);
        }
        return null;
    } catch (error) {
        console.error(`Error fetching holding for ${ticker}:${exchange}:`, error);
        throw error;
    }
};

export const fetchPortfolios = async (spreadsheetId: string): Promise<Portfolio[]> => {
    await ensureGapi();
    const portfolios = await fetchSheetData(spreadsheetId, PORT_OPT_RANGE, (row) =>
        mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys)
    );
    let holdings: Holding[] = [];
    try {
        holdings = await fetchSheetData(spreadsheetId, HOLDINGS_RANGE, (row) =>
            mapRowToHolding<Omit<Holding, 'priceUnit'>>(row, holdingMapping, holdingNumericKeys)
        );
    } catch (e) { console.warn("Holdings sheet not found or error fetching:", e); }

    if (holdings.length > 0) {
        const holdingsByPortId = holdings.reduce((acc, holding) => {
            const portId = holding.portfolioId;
            if (!acc[portId]) acc[portId] = [];
            acc[portId].push(holding);
            return acc;
        }, {} as Record<string, Holding[]>);
        return portfolios.map(p => ({ ...p, holdings: holdingsByPortId[p.id] || [] }));
    }
    return portfolios;
};

export const fetchTransactions = async (spreadsheetId: string): Promise<Transaction[]> => {
    await ensureGapi();
    const transactions = await fetchSheetData(
        spreadsheetId, TX_FETCH_RANGE,
        (row) => mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row, transactionMapping, transactionNumericKeys),
        'FORMATTED_VALUE' // Fetch formulas to get the raw formulas for calculation
    );
    return transactions.map(t => {
        const cleanNumber = (val: any) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };
        return {
            ...t,
            qty: cleanNumber(t.Split_Adjusted_Qty || t.Original_Qty),
            price: cleanNumber(t.Split_Adjusted_Price || t.Original_Price),
            grossValue: cleanNumber(t.Original_Qty) * cleanNumber(t.Original_Price)
        };
    });
};

export const getSpreadsheet = async (): Promise<string | null> => {
    await ensureGapi();
    const storedId = localStorage.getItem('g_sheet_id');
    if (storedId) return storedId;

    console.log("Searching in Google Drive...");
    const foundId = await findSpreadsheetByName(DEFAULT_SHEET_NAME);
    if (foundId) {
        localStorage.setItem('g_sheet_id', foundId);
        return foundId;
    }
    return null;
};

export const createPortfolioSpreadsheet = async (title: string = DEFAULT_SHEET_NAME): Promise<string | null> => {
    const gapi = await ensureGapi();
    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.create({ resource: { properties: { title: title } } });
        const spreadsheetId = spreadsheet.result.spreadsheetId;
        if (spreadsheetId) {
            await ensureSchema(spreadsheetId);
            localStorage.setItem('g_sheet_id', spreadsheetId);
        }
        return spreadsheetId || null; 
    } catch (error) { console.error("Error creating spreadsheet:", error); return null; }
};

export const createEmptySpreadsheet = async (title: string): Promise<string | null> => {
    const gapi = await ensureGapi();
    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.create({ resource: { properties: { title } } });
        const newSpreadsheetId = spreadsheet.result.spreadsheetId;
        return newSpreadsheetId || null;
    } catch (error) {
        console.error('Error creating empty spreadsheet:', error);
        return null;
    }
};

export const addTransaction = async (spreadsheetId: string, t: Transaction) => {
    await batchAddTransactions(spreadsheetId, [t]);
};

export const batchAddTransactions = async (spreadsheetId: string, transactions: Transaction[]) => {
    const gapi = await ensureGapi();
    const allValuesToAppend: any[][] = [];

    transactions.forEach(t => {
        const rowData: { [key: string]: any } = {};
        Object.values(TXN_COLS).forEach(colDef => {
            const key = colDef.key;
            switch (key) {
                case 'date': rowData[key] = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : ''; break;
                case 'ticker': rowData[key] = String(logIfFalsy(t.ticker, `Transaction ticker missing`, t)).toUpperCase(); break;
                case 'exchange': rowData[key] = (t.exchange || '').toUpperCase(); break;
                case 'vestDate': rowData[key] = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : ''; break;
                case 'comment': case 'Source': rowData[key] = (t as any)[key] || ''; break;
                case 'commission': {
                    const comm = (t as any).commission || 0;
                    const isILAG = (t.currency || '').toUpperCase() === 'ILAG';
                    // If currency is ILAG (Agorot), and commission was entered in ILS (standard), store as Agorot.
                    rowData[key] = isILAG ? comm * 100 : comm;
                    break;
                }
                case 'tax': rowData[key] = (t as any)[key] || 0; break;
                case 'Creation_Date': {
                    const cDate = (t as any).Creation_Date ? new Date((t as any).Creation_Date) : new Date();
                    rowData[key] = toGoogleSheetDateFormat(cDate);
                    break;
                }
                case 'Orig_Open_Price_At_Creation_Date': rowData[key] = (t as any)[key]; break; default: if (key in t) rowData[key] = (t as any)[key];
            }
        });
        const rowValues = Object.values(TXN_COLS).map(colDef => colDef.formula ? null : rowData[colDef.key] ?? null);
        allValuesToAppend.push(rowValues);
    });

    if (allValuesToAppend.length === 0) return;

    const appendResult = await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId, range: `${TX_SHEET_NAME}!A:A`, valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', resource: { values: allValuesToAppend }
    });

    const updatedRange = appendResult.result?.updates?.updatedRange;
    if (!updatedRange) throw new Error("Could not determine range of appended rows.");


    // Parse range (e.g. "Transaction_Log!A10:V12") to find start row
    const match = updatedRange.match(/!A(\d+):/);
    if (!match) throw new Error("Could not parse start row number from range: " + updatedRange);
    const startRow = parseInt(match[1]);

    // Apply Formulas
    const formulaColDefs = Object.values(TXN_COLS).filter(colDef => !!colDef.formula);
    const txSheetId = await getSheetId(spreadsheetId, TX_SHEET_NAME);

    // Optimization: Generate one request per column for the entire range, or one request per cell?
        // Using updateCells with a grid range is better.
        
        // Actually, we can't easily do one request per column because formula depends on row number.
            // But we can generate the formulas and send them in one big batchUpdate.
            const formulaRequests: any[] = [];
            
            for (let i = 0; i < transactions.length; i++) {
                const rowNum = startRow + i;
                formulaColDefs.forEach((colDef) => {
                    const formula = colDef.formula!(rowNum, TXN_COLS);
                    const colIndex = Object.values(TXN_COLS).indexOf(colDef);
                    formulaRequests.push({
                        updateCells: {
                            range: { sheetId: txSheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
                            rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
                            fields: 'userEnteredValue.formulaValue'
                        }
                    });
                });
            }
        
            if (formulaRequests.length > 0) {
                // Batch requests in chunks if too large (Google limit is around 100k requests but payload size matters)
                // For test data (few rows), one batch is fine.
                await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: formulaRequests } });
            }

    // Only rebuild holdings once after batch insert
    await rebuildHoldingsSheet(spreadsheetId);
};


function createHoldingRow(h: Omit<Holding, 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'priceUnit' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>, meta: any, rowNum: number): any[] | null {
    const tickerCell = `B${rowNum}`;
    const exchangeCell = `C${rowNum}`;
    const qtyCell = `D${rowNum}`; const priceCell = `E${rowNum}`;
    const tickerAndExchange = `${exchangeCell}&":"&${tickerCell}`;
    const row = new Array(holdingsHeaders.length).fill('');


    const isTASE = (h.exchange || '').toUpperCase() === 'TASE';


    row[0] = h.portfolioId;
    row[1] = String(h.ticker).toUpperCase();
    row[2] = (h.exchange || '').toUpperCase(); row[3] = h.qty;
    row[4] = meta?.price || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "price"))`;
    // Explicitly use 'ILAG' for TASE stocks as they are quoted in Agorot
    row[5] = isTASE ? 'ILAG' : (meta?.currency || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"))`);
    row[6] = `=${qtyCell}*${priceCell}`;
    row[7] = meta?.name || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), "")`;
    row[8] = meta?.name_he || ""; row[9] = meta?.sector || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "sector"), "Other")`;


    // Index 10 is now Day_Change (Price_Unit removed)
    row[10] = meta?.changePct || `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`;

    const priceFormula = (dateExpr: string) => getHistoricalPriceFormula(tickerAndExchange, dateExpr).substring(1);
    row[11] = `=IFERROR((${priceCell}/${priceFormula("TODAY()-7")})-1, "")`; // Change_1W
    row[12] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-1)")})-1, "")`; // Change_1M
    row[13] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-3)")})-1, "")`; // Change_3M
    row[14] = `=IFERROR(${priceCell} / ${priceFormula("DATE(YEAR(TODAY())-1, 12, 31)")} - 1, "")`; // Change_YTD
    row[15] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-12)")})-1, "")`; // Change_1Y
    row[16] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-36)")})-1, "")`; // Change_3Y
    row[17] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-60)")})-1, "")`; // Change_5Y
    row[18] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-120)")})-1, "")`; // Change_10Y
    row[19] = h.numeric_id || '';
    return row;
}

export const rebuildHoldingsSheet = async (spreadsheetId: string) => {
    const gapi = await ensureGapi();
    const transactions = await fetchTransactions(spreadsheetId);
    // Removed priceUnit from Omit type
    const holdings: Record<string, Omit<Holding, 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'priceUnit' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'> & { portfolioId: string }> = {};

    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL') {
            const key = `${txn.portfolioId}-${txn.ticker}-${txn.exchange}`;
            if (!holdings[key]) {
                holdings[key] = { portfolioId: txn.portfolioId, ticker: txn.ticker, exchange: txn.exchange || '', qty: 0 };
            }
        // Initialize optional property if it doesn't exist.
        // We use (txn as any) to access numeric_id which might be added dynamically or is missing from type definition.
        if ((txn as any).numeric_id) {
            holdings[key].numeric_id = (txn as any).numeric_id;
        }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
            const qty = parseFloat(String(txn.Split_Adjusted_Qty || txn.Original_Qty));
            holdings[key].qty += qty * multiplier;
        }
    });

    const uniqueHoldings = Object.values(holdings).filter(h => h.qty > 1e-6);
            const enrichedData = await Promise.all(uniqueHoldings.map(async (h) => {
                let meta: any = null;
                if ((h.exchange || '').toUpperCase() === 'TASE') {
                    try { meta = await getTickerData(h.ticker, h.exchange as any); } catch (e) { console.warn("Failed to fetch TASE metadata for " + h.ticker, e); }
                }
                
                return { h, meta };

    }));


    const data = enrichedData.map(({ h, meta }, i) => createHoldingRow(h, meta, i + 2)).filter((row): row is any[] => row !== null);

    const range = `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}`;
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range, resource: {range: range} });


    if (data.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId, range: HOLDINGS_SHEET + '!A2', valueInputOption: 'USER_ENTERED',
            resource: { values: data }
        });
    }
    await setMetadataValue(spreadsheetId, 'holdings_rebuild', toGoogleSheetDateFormat(new Date()));
};

export const addPortfolio = async (spreadsheetId: string, p: Portfolio) => {
    const gapi = await ensureGapi();
    const row = objectToRow(p, portfolioHeaders, portfolioMapping as any);
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId, range: 'Portfolio_Options!A:A', valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
};

export const updatePortfolio = async (spreadsheetId: string, p: Portfolio) => {
    const gapi = await ensureGapi();
    const { result } = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range: `Portfolio_Options!A1:${String.fromCharCode(65 + portfolioHeaders.length - 1)}`
    });
    const values = result.values || [];
    if (values.length < 2) throw new Error(`Portfolio sheet for ID ${p.id} is empty or missing headers.`);
    const headers = values[0];
    const idColumnIndex = headers.indexOf(portfolioMapping.id);
    if (idColumnIndex === -1) throw new Error(`'${portfolioMapping.id}' column not found in sheet.`);
    const dataRows = values.slice(1);
    const rowIndex = dataRows.findIndex((row: any[]) => row[idColumnIndex] === p.id);
    if (rowIndex === -1) throw new Error(`Portfolio with ID ${p.id} not found`);

    const rowNum = rowIndex + 2;
    const endColumn = String.fromCharCode(65 + portfolioHeaders.length - 1);
    const range = `Portfolio_Options!A${rowNum}:${endColumn}${rowNum}`;
    const rowData = objectToRow(p, portfolioHeaders, portfolioMapping as any);
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: range, valueInputOption: 'USER_ENTERED', resource: { values: [rowData] }
    });
};

export async function getMetadataValue(spreadsheetId: string, key: string): Promise<string | null> {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId, range: METADATA_RANGE });
        const rows: string[][] = res.result.values || [];
        const keyIndex = metadataHeaders.indexOf('Key');
        const valueIndex = metadataHeaders.indexOf('Value');
        const row = rows.find((r: any[]) => r[keyIndex] === key);
        return row ? row[valueIndex] : null;
    } catch (error) { console.error("Error fetching metadata for key " + key + ":", error); throw error; }
}

export async function setMetadataValue(spreadsheetId: string, key: string, value: string): Promise<void> {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId, range: METADATA_RANGE });
        const rows = res.result.values || [];
        const keyIndex = metadataHeaders.indexOf('Key');
        const existingRowIndex = rows.findIndex((r: any[]) => r[keyIndex] === key);
        if (existingRowIndex > -1) {
            const rowNum = existingRowIndex + 1;
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId, range: METADATA_SHEET + '!B' + rowNum, valueInputOption: 'USER_ENTERED', resource: { values: [[value]] }
            });
        } else {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId, range: METADATA_SHEET + '!A:A', valueInputOption: 'USER_ENTERED', resource: { values: [[key, value]] }
            });
        }
    } catch (error) { console.error("Error setting metadata for key " + key + ":", error); throw error; }
}

export async function exportToSheet(spreadsheetId: string, sheetName: string, headers: string[], data: any[][]): Promise<number> {
    const gapi = await ensureGapi();
    const sheetId = await getSheetId(spreadsheetId, sheetName, true);
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName, resource: {} });
    const values = [headers, ...data];
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values }
    });
    return sheetId;
}

export const fetchSheetExchangeRates = async (spreadsheetId: string): Promise<any> => {
    const gapi = await ensureGapi();
    const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range: CONFIG_RANGE, valueRenderOption: 'FORMATTED_VALUE'
    });
    const rows = res.result.values || [];
    const keyIndex = configHeaders.indexOf('Key');

    const periodIndices: Record<string, number> = {
        current: configHeaders.indexOf('Value'),
        ago1d: configHeaders.indexOf('1D Ago'),
        ago1w: configHeaders.indexOf('1W Ago'),
        ago1m: configHeaders.indexOf('1M Ago'),
        ago3m: configHeaders.indexOf('3M Ago'),
        ytd: configHeaders.indexOf('YTD'),
        ago1y: configHeaders.indexOf('1Y Ago'),
        ago3y: configHeaders.indexOf('3Y Ago'),
        ago5y: configHeaders.indexOf('5Y Ago'),
    };

    const allRates: any = {};
    for (const period in periodIndices) {
        allRates[period] = { USD: 1 };
    }

    rows.forEach((r: string[]) => {
        const pair = r[keyIndex];
        if (!pair) return;

        for (const period in periodIndices) {
            const index = periodIndices[period];
            const valueStr = r[index];
            const val = parseFloat(valueStr);

            if (!isNaN(val)) {
                const rates = allRates[period];
                // The goal is to store all rates in a "XXX per USD" format.
                // e.g., rates['EUR'] will hold the number of Euros per 1 US Dollar.
                if (pair.startsWith('USD') && pair.length === 6) {
                    // Handles pairs like 'USDEUR'. The rate value from the sheet is already in "target currency per USD".
                    const targetCurrency = pair.substring(3);
                    rates[targetCurrency] = val;
                } else if (pair.endsWith('USD') && pair.length === 6) {
                    // Handles pairs like 'EURUSD'. The rate value is in "USD per source currency".
                    // We convert it to "source currency per USD" by taking the reciprocal.
                    const sourceCurrency = pair.substring(0, 3);
                    rates[sourceCurrency] = 1 / val;
                }
            }
        }
    });

    for (const period in periodIndices) {
        logIfFalsy(allRates[period]['ILS'], `USDILS rate missing for ${period}`);
        logIfFalsy(allRates[period]['EUR'], `USDEUR rate missing for ${period}`);
    }

    return allRates;
};

// Add this missing function
export { getUsdIlsFormula } from './formulas';
