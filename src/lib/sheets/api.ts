/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, findSpreadsheetByName } from '../google';
import { getTickerData, type TickerData } from '../fetching';
import { toGoogleSheetDateFormat } from '../date';
import type { Portfolio, Transaction, Holding } from '../types';
import {
    TXN_COLS, transactionHeaders, transactionMapping, transactionNumericKeys,
    portfolioHeaders, holdingsHeaders, configHeaders, portfolioMapping, portfolioNumericKeys,
    holdingMapping, holdingNumericKeys, holdingsUserOptionsHeaders, type Headers, DEFAULT_SHEET_NAME, PORT_OPT_RANGE,
    TX_SHEET_NAME, TX_FETCH_RANGE, CONFIG_SHEET_NAME, CONFIG_RANGE, METADATA_SHEET, HOLDINGS_USER_OPTIONS_SHEET_NAME, HOLDINGS_USER_OPTIONS_RANGE,
    metadataHeaders, METADATA_RANGE, HOLDINGS_SHEET, HOLDINGS_RANGE
} from './config';
import { getHistoricalPriceFormula, getUsdIlsFormula } from './formulas';
import { logIfFalsy } from '../utils';
import { createRowMapper, fetchSheetData, objectToRow, createHeaderUpdateRequest, getSheetId } from './utils';

// --- Mappers for each data type ---
const mapRowToPortfolio = createRowMapper(portfolioHeaders);
const mapRowToTransaction = createRowMapper(transactionHeaders);
const mapRowToHolding = createRowMapper(holdingsHeaders);

const isAuthError = (error: any): boolean => {
    if (!error) return false;
    // Google API client error for expired/invalid token
    if (error.result?.error?.status === 'UNAUTHENTICATED' || error.result?.error?.code === 401) {
        return true;
    }
    // Google Identity Services token client error
    if (error.type === 'error' || (error.error && ['popup_closed_by_user', 'access_denied', 'invalid_grant'].includes(error.error))) {
        return true;
    }
    return false;
};

const withAuthHandling = <A extends any[], R>(fn: (...args: A) => Promise<R>): ((...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
        try {
            return await fn(...args);
        } catch (error) {
            if (isAuthError(error)) {
                console.warn('Authentication error detected. Clearing session and reloading.', error);
                localStorage.removeItem('g_sheet_id');
                // Reload the page. The application's entry point should handle
                // redirecting to a login page if the user is not authenticated.
                window.location.reload();
                // Return a promise that never resolves to prevent further execution.
                return new Promise(() => { });
            }
            throw error;
        }
    };
};

const toExchangeId = (str: string): string => {
    if (!str) return '';
    // convert input to uppercase, replace TLV and TA with TASE
    const upperStr = str.trim().toUpperCase();
    if (upperStr === 'TLV' || upperStr === 'TA') {
        return 'TASE';
    }
    return upperStr;
};

const toSheetsExchange = (str: string): string => {
    if (!str) return '';
    // converts to uppercase; replaces TA, TASE to TLV
    const upperStr = str.toUpperCase();
    if (upperStr === 'TASE' || upperStr === 'TA') {
        return 'TLV';
    }
    return upperStr;
};

export const ensureSchema = withAuthHandling(async (spreadsheetId: string) => {
    const gapi = await ensureGapi();
    const sheetIds = {
        portfolio: await getSheetId(spreadsheetId, 'Portfolio_Options', true),
        log: await getSheetId(spreadsheetId, TX_SHEET_NAME, true),
        holdings: await getSheetId(spreadsheetId, HOLDINGS_SHEET, true),
        config: await getSheetId(spreadsheetId, CONFIG_SHEET_NAME, true),
        metadata: await getSheetId(spreadsheetId, METADATA_SHEET, true),
        holdingsUserOptions: await getSheetId(spreadsheetId, HOLDINGS_USER_OPTIONS_SHEET_NAME, true),
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
                createHeaderUpdateRequest(sheetIds.holdingsUserOptions, holdingsUserOptionsHeaders as unknown as Headers),
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
});

export const fetchHolding = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: string): Promise<Holding | null> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];
        
        // Map all rows to objects first for robust searching
        const allHoldings = rows.map(row => 
            mapRowToHolding<Omit<Holding, 'portfolioId'>>(row, holdingMapping, holdingNumericKeys)
        );

        console.log(`fetchHolding: Searching for ${ticker} on ${exchange}.`);

        const matchingHoldings = allHoldings.filter(h => h.ticker && String(h.ticker).toUpperCase() === ticker.toUpperCase());
        console.log(`fetchHolding: Found ${matchingHoldings.length} matching holdings for ticker ${ticker}`, matchingHoldings);
        
        const targetExchangeId = toExchangeId(exchange);
        
        let holding = matchingHoldings.find(h => toExchangeId(h.exchange) === targetExchangeId);
        
        if (!holding) {
             console.log(`fetchHolding: No exact exchange match for ${exchange}. Checking empty exchange...`);
             // Fallback 1: Match if sheet exchange is empty
             holding = matchingHoldings.find(h => !toExchangeId(h.exchange));
        }
        
        if (!holding && matchingHoldings.length === 1) {
            console.log(`fetchHolding: Single result fallback used.`);
            // Fallback 2: If only one holding with this ticker exists, assume it's the one
            holding = matchingHoldings[0];
        }

        if (holding) {
             // Ensure exchange is normalized in the returned object
             if (holding.exchange) holding.exchange = toExchangeId(holding.exchange);
             console.log('fetchHolding: Match found:', holding);
             return holding as Holding;
        } else {
             console.log('fetchHolding: No match found.');
             return null;
        }
    } catch (error) {
        console.error(`Error fetching holding for ${ticker}:${exchange}:`, error);
        throw error;
    }
});

export const fetchPortfolios = withAuthHandling(async (spreadsheetId: string): Promise<Portfolio[]> => {
    await ensureGapi();
    const portfolios = await fetchSheetData(spreadsheetId, PORT_OPT_RANGE, (row) =>
        mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys)
    );

    // 1. Fetch all transactions to calculate holdings from scratch
    const transactions = await fetchTransactions(spreadsheetId);

    // 2. Calculate holdings quantities from transactions
    const holdingsByPortfolio: Record<string, Record<string, Holding>> = {};
    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL') {
            if (!holdingsByPortfolio[txn.portfolioId]) {
                holdingsByPortfolio[txn.portfolioId] = {};
            }
            const key = `${txn.ticker}-${txn.exchange}`;
            if (!holdingsByPortfolio[txn.portfolioId][key]) {
                holdingsByPortfolio[txn.portfolioId][key] = {
                    portfolioId: txn.portfolioId,
                    ticker: txn.ticker,
                    exchange: txn.exchange || '',
                    qty: 0,
                    numericId: txn.numericId || null
                };
            }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
            const qty = parseFloat(String(txn.Split_Adjusted_Qty || txn.Original_Qty));
            holdingsByPortfolio[txn.portfolioId][key].qty += qty * multiplier;
        }
    });

    // 3. Fetch the aggregated holdings sheet to use as a price map
    let priceMap: Record<string, Omit<Holding, 'portfolioId' | 'qty'>> = {};
    try {
        const priceData = await fetchSheetData(spreadsheetId, HOLDINGS_RANGE, (row: any[]) =>
            mapRowToHolding<Omit<Holding, 'portfolioId' | 'qty'>>(
                row,
                holdingMapping,
                holdingNumericKeys.filter(k => k !== 'qty') as any
            )
        );
        priceData.forEach(item => {
            if (item.exchange) item.exchange = toExchangeId(item.exchange);
            const key = `${item.ticker}-${item.exchange}`;
            priceMap[key] = item;
        });
    } catch (e) {
        console.warn("Holdings sheet (for price data) not found or error fetching:", e);
    }

    // 4. Attach calculated holdings, enriched with price data, to portfolios
    return portfolios.map(p => {
        const portfolioHoldingsRaw = holdingsByPortfolio[p.id] ? Object.values(holdingsByPortfolio[p.id]) : [];
        const enrichedHoldings = portfolioHoldingsRaw
            .filter(h => h.qty > 1e-6) // Filter out zero-quantity holdings
            .map(h => {
                const key = `${h.ticker}-${h.exchange}`;
                const priceInfo = priceMap[key];
                return {
                    ...h,
                    ...priceInfo, // Add price, currency, name etc. from the price map
                    totalValue: h.qty * (priceInfo?.price || 0)
                };
            });
        return { ...p, holdings: enrichedHoldings };
    });
});

export const fetchTransactions = withAuthHandling(async (spreadsheetId: string): Promise<Transaction[]> => {
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
        if (t.exchange) {
            t.exchange = toExchangeId(t.exchange);
        }
        return {
            ...t,
            qty: cleanNumber(t.Split_Adjusted_Qty || t.Original_Qty),
            price: cleanNumber(t.Split_Adjusted_Price || t.Original_Price),
            grossValue: cleanNumber(t.Original_Qty) * cleanNumber(t.Original_Price)
        };
    });
});

export const getSpreadsheet = withAuthHandling(async (): Promise<string | null> => {
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
});

export const createPortfolioSpreadsheet = withAuthHandling(async (title: string = DEFAULT_SHEET_NAME): Promise<string | null> => {
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
});

export const createEmptySpreadsheet = withAuthHandling(async (title: string): Promise<string | null> => {
    const gapi = await ensureGapi();
    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.create({ resource: { properties: { title } } });
        const newSpreadsheetId = spreadsheet.result.spreadsheetId;
        return newSpreadsheetId || null;
    } catch (error) {
        console.error('Error creating empty spreadsheet:', error);
        return null;
    }
});

export const addTransaction = withAuthHandling(async (spreadsheetId: string, t: Transaction) => {
    await batchAddTransactions(spreadsheetId, [t]);
});

export const updateHoldingsUserOptions = withAuthHandling(async (spreadsheetId: string, optionsToUpdate: { ticker: string, exchange: string, name: string }[]) => {
    if (!optionsToUpdate || optionsToUpdate.length === 0) {
        return;
    }

    const gapi = await ensureGapi();

    const existingOptions: { ticker: string, exchange: string, name: string }[] = [];
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_USER_OPTIONS_RANGE,
        });
        (res.result.values || []).forEach((row: any[]) => {
            if (row[0] && row[1]) { // Must have ticker and exchange
                existingOptions.push({ ticker: row[0], exchange: row[1], name: row[2] || '' });
            }
        });
    } catch (e: any) {
        if (e.result?.error?.code === 400 && e.result?.error?.message.includes('Unable to parse range')) {
            console.log('HoldingsUserOptions sheet not found, will create.');
        } else {
            console.error('Error fetching HoldingsUserOptions:', e);
            throw e;
        }
    }

    const finalOptions = new Map<string, { ticker: string, exchange: string, name: string }>();
    existingOptions.forEach(opt => finalOptions.set(`${opt.ticker}-${opt.exchange}`, opt));
    optionsToUpdate.forEach(opt => {
        if (opt.name) {
            finalOptions.set(`${opt.ticker}-${toSheetsExchange(opt.exchange)}`, { ticker: opt.ticker, exchange: toSheetsExchange(opt.exchange), name: opt.name });
        }
    });

    const dataToWrite = Array.from(finalOptions.values()).map(opt => [opt.ticker, opt.exchange, opt.name]);
    if (dataToWrite.length === 0) return;

    const range = `${HOLDINGS_USER_OPTIONS_SHEET_NAME}!A2:${String.fromCharCode(65 + holdingsUserOptionsHeaders.length - 1)}`;
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range, resource: {} });
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: `${HOLDINGS_USER_OPTIONS_SHEET_NAME}!A2`, valueInputOption: 'USER_ENTERED', resource: { values: dataToWrite }
    });
});

export const batchAddTransactions = withAuthHandling(async (spreadsheetId: string, transactions: Transaction[]) => {
    const gapi = await ensureGapi();

    const optionsToUpdate: { ticker: string, exchange: string, name: string }[] = [];

    const allValuesToAppend: any[][] = [];
    transactions.forEach(t => {
        const rowData: { [key: string]: any } = {};
        Object.values(TXN_COLS).forEach(colDef => {
            const key = colDef.key;
            switch (key) {
                case 'date': rowData[key] = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : ''; break;
                case 'ticker': rowData[key] = String(logIfFalsy(t.ticker, `Transaction ticker missing`, t)).toUpperCase(); break;
                case 'exchange': rowData[key] = toSheetsExchange(t.exchange || ''); break;
                case 'vestDate': rowData[key] = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : ''; break;
                case 'comment': case 'Source': rowData[key] = (t as any)[key] || ''; break;
                case 'commission': {
                    const comm = (t as any).commission || 0;
                    const isILA = (t.currency || '').toUpperCase() === 'ILA';
                    // If currency is ILA (Agorot), and commission was entered in ILS (standard), store as Agorot.
                    rowData[key] = isILA ? comm * 100 : comm;
                    break;
                }
                case 'tax': rowData[key] = (t as any)[key] || 0; break;
                case 'Creation_Date': {
                    const cDate = (t as any).Creation_Date ? new Date((t as any).Creation_Date) : new Date();
                    rowData[key] = toGoogleSheetDateFormat(cDate);
                    break;
                }
                case 'Orig_Open_Price_At_Creation_Date': rowData[key] = (t as any)[key]; break;
                default:
                    if (key in t) {
                        rowData[key] = (t as any)[key];
                    }
            }
        });
    });

    if (optionsToUpdate.length > 0) await updateHoldingsUserOptions(spreadsheetId, optionsToUpdate);

    transactions.forEach(t => {
        const rowData: { [key: string]: any } = { ...t };
        // The Transaction object from the UI uses 'numericId', but the sheet schema expects 'numeric_id'.
        // This ensures the value is correctly picked up when building the row for the sheet.
        rowData.numeric_id = t.numericId;

        const rowValues = Object.values(TXN_COLS).map(colDef => {
            if (colDef.formula) return null;
            const key = colDef.key;
            if (key === 'date' || key === 'vestDate' || key === 'Creation_Date') {
                return rowData[key] ? toGoogleSheetDateFormat(new Date(rowData[key])) : '';
            }
            if (key === 'exchange') return toSheetsExchange(rowData[key] || '');
            return rowData[key] ?? null;
        });
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
});

type HoldingNonGeneratedData = Omit<Holding, 'portfolioId' | 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>;
function createHoldingRow(h: HoldingNonGeneratedData, meta: TickerData | null, rowNum: number): any[] {
    const tickerCell = `A${rowNum}`;
    const exchangeCell = `B${rowNum}`;
    const qtyCell = `C${rowNum}`;
    const priceCell = `D${rowNum}`;
    const tickerAndExchange = `${exchangeCell}&":"&${tickerCell}`;
    const row = new Array(holdingsHeaders.length).fill('');

    const isTASE = (h.exchange || '').toUpperCase() === 'TASE';

    row[0] = String(h.ticker).toUpperCase();
    row[1] = toSheetsExchange(h.exchange || '');
    row[2] = h.qty;
    row[3] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "price"))`;
    const defaultCurrency = meta?.currency || (isTASE ? 'ILA' : '');
    row[4] = (`=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"), "${defaultCurrency}")`);
    row[5] = `=${qtyCell}*${priceCell}`;
    row[6] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), " ${meta?.name || ""}")`;
    row[7] = meta?.name_he || "";
    row[8] = meta?.sector || "";
    row[9] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`;

    const priceFormula = (dateExpr: string) => getHistoricalPriceFormula(tickerAndExchange, dateExpr).substring(1);
    row[10] = `=IFERROR((${priceCell}/${priceFormula("TODAY()-7")})-1, "")`; // Change_1W
    row[11] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-1)")})-1, "")`; // Change_1M
    row[12] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-3)")})-1, "")`; // Change_3M
    row[13] = `=IFERROR(${priceCell} / ${priceFormula("DATE(YEAR(TODAY())-1, 12, 31)")} - 1, "")`; // Change_YTD
    row[14] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-12)")})-1, "")`; // Change_1Y
    row[15] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-36)")})-1, "")`; // Change_3Y
    row[16] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-60)")})-1, "")`; // Change_5Y
    row[17] = `=IFERROR((${priceCell}/${priceFormula("EDATE(TODAY(),-120)")})-1, "")`; // Change_10Y
    row[18] = h.numericId || '';
    row[19] = meta?.recentChangeDays || 7;
    return row;
}

export const rebuildHoldingsSheet = withAuthHandling(async (spreadsheetId: string) => {
    const gapi = await ensureGapi();
    const transactions = await fetchTransactions(spreadsheetId);
    const holdings: Record<string, Omit<Holding, 'portfolioId' | 'totalValue' | 'price' | 'currency' | 'name' | 'name_he' | 'sector' | 'changePct' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>> = {};

    // Sort transactions by date to ensure we get the latest numericId for a holding
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL') {
            const key = `${txn.ticker}-${txn.exchange}`;
            if (!holdings[key]) {
                holdings[key] = { ticker: txn.ticker, exchange: txn.exchange || '', qty: 0, numericId: null };
            }
            // Since transactions are sorted, this will overwrite with the latest numericId for each holding
            if (txn.numericId) {
                holdings[key].numericId = txn.numericId;
            }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
            const qty = parseFloat(String(txn.Split_Adjusted_Qty || txn.Original_Qty));
            holdings[key].qty += qty * multiplier;
        }
    });

    const enrichedData = await Promise.all(Object.values(holdings).map(async (h) => {
        let meta: TickerData | null = null;
        try { meta = await getTickerData(h.ticker, h.exchange, h.numericId); } catch (e) { console.warn("Failed to fetch metadata for " + h.ticker, e); }
        return { h, meta };
    }));

    const data = enrichedData.map(({ h, meta }, i) => createHoldingRow(h, meta, i + 2)).filter((row): row is any[] => row !== null);

    const range = `${HOLDINGS_SHEET}!A2:${String.fromCharCode(65 + holdingsHeaders.length - 1)}`;
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range, resource: {} });

    if (data.length > 0) {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId, range: HOLDINGS_SHEET + '!A2', valueInputOption: 'USER_ENTERED',
            resource: { values: data }
        });
    }
    await setMetadataValue(spreadsheetId, 'holdings_rebuild', toGoogleSheetDateFormat(new Date()));
});

export const addPortfolio = withAuthHandling(async (spreadsheetId: string, p: Portfolio) => {
    const gapi = await ensureGapi();
    const row = objectToRow(p, portfolioHeaders, portfolioMapping as any);
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId, range: 'Portfolio_Options!A:A', valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
});

export const updatePortfolio = withAuthHandling(async (spreadsheetId: string, p: Portfolio) => {
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
});

export const getMetadataValue = withAuthHandling(async function (spreadsheetId: string, key: string): Promise<string | null> {
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
);

export const setMetadataValue = withAuthHandling(async function (spreadsheetId: string, key: string, value: string): Promise<void> {
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
);

export const exportToSheet = withAuthHandling(async function (spreadsheetId: string, sheetName: string, headers: string[], data: any[][]): Promise<number> {
    const gapi = await ensureGapi();
    const sheetId = await getSheetId(spreadsheetId, sheetName, true);
    await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: sheetName, resource: {} });
    const values = [headers, ...data];
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'USER_ENTERED', resource: { values }
    });
    return sheetId;
}
);

export const fetchSheetExchangeRates = withAuthHandling(async (spreadsheetId: string): Promise<any> => {
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
});

// Add this missing function
export { getUsdIlsFormula } from './formulas';
