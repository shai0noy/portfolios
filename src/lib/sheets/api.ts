/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, findSpreadsheetByName } from '../google';
import { clearFinanceCache } from '../data/loader';
import { getTickerData, type TickerData } from '../fetching';
import { toGoogleSheetDateFormat } from '../date';
import { type Portfolio, type Transaction, type SheetHolding, Exchange, parseExchange, toGoogleSheetsExchangeCode, Currency } from '../types';
import { normalizeCurrency } from '../currency';
import {
    TXN_COLS, transactionHeaders, transactionMapping, transactionNumericKeys,
    portfolioHeaders, holdingsHeaders, configHeaders, portfolioMapping, portfolioNumericKeys,
    holdingMapping, holdingNumericKeys, type Headers, DEFAULT_SHEET_NAME, PORT_OPT_RANGE, type SheetHolding as MappedSheetHolding,
    TX_SHEET_NAME, TX_FETCH_RANGE, CONFIG_SHEET_NAME, CONFIG_RANGE, METADATA_SHEET, 
    metadataHeaders, METADATA_RANGE, HOLDINGS_SHEET, HOLDINGS_RANGE, SHEET_STRUCTURE_VERSION_DATE,
    EXTERNAL_DATASETS_SHEET_NAME, externalDatasetsHeaders, EXTERNAL_DATASETS_RANGE,
    DIV_SHEET_NAME, dividendHeaders, DIVIDENDS_RANGE
} from './config';
import { getHistoricalPriceFormula } from './formulas';
import { logIfFalsy } from '../utils';
import { createRowMapper, fetchSheetData, objectToRow, createHeaderUpdateRequest, getSheetId, ensureSheets, escapeSheetString } from './utils';
import { PORTFOLIO_SHEET_NAME } from './config';

import type { Dividend } from '../fetching/types';
import { InstrumentClassification } from '../types/instrument';

// --- Mappers for each data type ---
const mapRowToPortfolio = createRowMapper(portfolioHeaders);
const mapRowToTransaction = createRowMapper(transactionHeaders);
const mapRowToHolding = createRowMapper(holdingsHeaders);

interface GapiError {
    result?: {
        error?: {
            status?: string;
            code?: number;
        };
    };
    type?: string;
    error?: string;
}

const isAuthError = (error: GapiError): boolean => {
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

const withAuthHandling = <A extends unknown[], R>(fn: (...args: A) => Promise<R>): ((...args: A) => Promise<R>) => {
    return async (...args: A): Promise<R> => {
        try {
            return await fn(...args);
        } catch (error) {
            if (isAuthError(error as GapiError)) {
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

export const ensureSchema = withAuthHandling(async (spreadsheetId: string) => {
    const gapi = await ensureGapi();
    
    // 1. Batch fetch/create all required sheets
    // We explicitly list all sheets we expect to exist.
    const requiredSheets = [
        PORTFOLIO_SHEET_NAME, 
        TX_SHEET_NAME, 
        HOLDINGS_SHEET, 
        CONFIG_SHEET_NAME, 
        METADATA_SHEET, 
        EXTERNAL_DATASETS_SHEET_NAME,
        DIV_SHEET_NAME
    ] as const;
    
    // ensureSheets returns a map of { SheetName: SheetID }
    // This optimization replaces N sequential 'getSheetId' calls with 1 batch read + 1 batch write (if needed).
    const sheetIds = await ensureSheets(spreadsheetId, requiredSheets);

    // 2. Prepare header updates
    // We update headers every time to ensure the sheet structure matches our code (e.g. if we added a column).
    const batchUpdate = {
        spreadsheetId,
        resource: {
            requests: [
                createHeaderUpdateRequest(sheetIds[PORTFOLIO_SHEET_NAME], portfolioHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[TX_SHEET_NAME], transactionHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[HOLDINGS_SHEET], holdingsHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[CONFIG_SHEET_NAME], configHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[METADATA_SHEET], metadataHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[EXTERNAL_DATASETS_SHEET_NAME], externalDatasetsHeaders as unknown as Headers),
                createHeaderUpdateRequest(sheetIds[DIV_SHEET_NAME], dividendHeaders as unknown as Headers),
                
                // 3. Format Date columns in Transaction Log (A=date, K=vestDate, P=Creation_Date) to YYYY-MM-DD
                // This ensures dates entered via code or UI appear correctly in the sheet.
                {
                    repeatCell: {
                        range: { sheetId: sheetIds[TX_SHEET_NAME], startColumnIndex: 0, endColumnIndex: 1, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: sheetIds[TX_SHEET_NAME], startColumnIndex: 10, endColumnIndex: 11, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: sheetIds[TX_SHEET_NAME], startColumnIndex: 15, endColumnIndex: 16, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: sheetIds[DIV_SHEET_NAME], startColumnIndex: 2, endColumnIndex: 3, startRowIndex: 1 },
                        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } },
                        fields: 'userEnteredFormat.numberFormat'
                    }
                }
            ]
        }
    };
    await gapi.client.sheets.spreadsheets.batchUpdate(batchUpdate);

    // 4. Initialize Config Data (Currency Conversions) if needed
    // This populates the 'Currency_Conversions' sheet with default rows and formulas.
    // Pairs: Direct USD pairs + Major Crosses + Inverses for Robustness
    // New List: USDILS, ILSUSD, USDEUR, EURUSD, USDGBP, GBPUSD, EURILS, ILSEUR, GBPILS, ILSGBP
    const createCurrencyRow = (currencyPair: string) => {
        const getFormula = (dateExpr: string) => '=' + getHistoricalPriceFormula(currencyPair, dateExpr, true);
        
        // We use simple GOOGLEFINANCE formulas. Robustness (fallback to inverted/chain) is handled in the app code.
        return [
            currencyPair,
            // Current Value
            `=GOOGLEFINANCE("CURRENCY:${currencyPair}")`,
            getFormula("TODAY()-1"), getFormula("TODAY()-7"), getFormula("EDATE(TODAY(),-1)"),
            getFormula("EDATE(TODAY(),-3)"), getFormula("EDATE(TODAY(),-6)"), getFormula("DATE(YEAR(TODAY()),1,1)"),
            getFormula("EDATE(TODAY(),-12)"), getFormula("EDATE(TODAY(),-36)"), getFormula("EDATE(TODAY(),-60)"),
        ];
    };

    const initialConfig = [
        createCurrencyRow('USDILS'), createCurrencyRow('ILSUSD'),
        createCurrencyRow('USDEUR'), createCurrencyRow('EURUSD'),
        createCurrencyRow('USDGBP'), createCurrencyRow('GBPUSD'),
        createCurrencyRow('EURILS'), createCurrencyRow('ILSEUR'),
        createCurrencyRow('GBPILS'), createCurrencyRow('ILSGBP'),
    ];
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: CONFIG_RANGE, valueInputOption: 'USER_ENTERED',
        resource: { values: initialConfig }
    });
    
    // Mark schema as created/updated
    await setMetadataValue(spreadsheetId, 'schema_created', SHEET_STRUCTURE_VERSION_DATE);
});

export const fetchHolding = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: string): Promise<SheetHolding | null> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];

        // Map all rows to objects, parsing the exchange string into our enum
        const allHoldings = rows.map(row => {
            const holdingRaw = mapRowToHolding<MappedSheetHolding>(row, holdingMapping, holdingNumericKeys);
            const holding = holdingRaw as SheetHolding;
            try {
                if (holding.exchange) {
                    holding.exchange = parseExchange(String(holding.exchange));
                }
            } catch (e) {
                console.warn(`fetchHolding: invalid exchange for ${holding.ticker}: ${holding.exchange}`);
                // fallback or leave as is, type safety might be compromised if not Exchange enum
                holding.exchange = undefined as unknown as Exchange;
            }

            if (holding.type && typeof holding.type === 'string') {
                holding.type = new InstrumentClassification(holding.type);
            }
            return holding;
        });

        // Search for the holding in the mapped data
        const matchingHoldings = allHoldings.filter(h => h.ticker && String(h.ticker).toUpperCase() === ticker.toUpperCase());
        const targetExchange = parseExchange(exchange);
        
        // Exact match on exchange
        let holding = matchingHoldings.find(h => h.exchange === targetExchange);
        
        // Fallback: If no exact exchange match, but only one result exists for this ticker, use it.
        // This handles cases where the user/system might have inconsistent exchange codes (e.g. 'US' vs 'NASDAQ').
        if (!holding && matchingHoldings.length === 1) {
            holding = matchingHoldings[0];
        }

        if (holding) {
            // Convert date fields from strings/numbers to Date objects
            const dateKeys: (keyof SheetHolding)[] = ['changeDate1d', 'changeDateRecent', 'changeDate1m', 'changeDate3m', 'changeDateYtd', 'changeDate1y', 'changeDate3y', 'changeDate5y', 'changeDate10y'];
            dateKeys.forEach(key => {
                const val = holding![key];
                if (val && !(val instanceof Date)) {
                    (holding as any)[key] = new Date(val as any);
                }
            });
        }

        return holding || null;
    } catch (error) {
        console.error(`Error fetching holding for ${ticker}:${exchange}:`, error);
        throw error;
    }
});

export const fetchPortfolios = withAuthHandling(async (spreadsheetId: string): Promise<Portfolio[]> => {
    const gapi = await ensureGapi();
    
    // Batch fetch: Portfolios, Transactions, and Holdings (for price map)
    const ranges = [PORT_OPT_RANGE, TX_FETCH_RANGE, HOLDINGS_RANGE];
    const res = await gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        // Use FORMATTED_VALUE to support formula retrieval and match original behavior. 
        // Our mappers handle numeric parsing (commas, %, etc) robustly.
        valueRenderOption: 'FORMATTED_VALUE'
    });

    const valueRanges = res.result.valueRanges;
    if (!valueRanges || valueRanges.length !== 3) {
        throw new Error("Failed to fetch all required ranges for portfolios.");
    }

    const portfolioRows = valueRanges[0].values || [];
    const transactionRows = valueRanges[1].values || [];
    const holdingsRows = valueRanges[2].values || [];

    // 1. Process Portfolios
    const portfolios = portfolioRows.map((row: any[]) => {
        const p = mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys);
        if (p && (p as any).taxHistory && typeof (p as any).taxHistory === 'string') {
            try {
                p.taxHistory = JSON.parse((p as any).taxHistory);
            } catch (e) {
                console.warn(`Failed to parse taxHistory for portfolio ${p.id}`, e);
                p.taxHistory = [];
            }
        }
        if (p && (p as any).feeHistory && typeof (p as any).feeHistory === 'string') {
            try {
                p.feeHistory = JSON.parse((p as any).feeHistory);
            } catch (e) {
                console.warn(`Failed to parse feeHistory for portfolio ${p.id}`, e);
                p.feeHistory = [];
            }
        }
        return p;
    }).filter(Boolean);

    // 2. Process Transactions (Logic copied from fetchTransactions to avoid re-fetch, but reusing the mapper)
    const transactions = transactionRows.map((row: unknown[]) => 
        mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row as any[], transactionMapping, transactionNumericKeys)
    ).map((t) => {
        const cleanNumber = (val: unknown) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };
        
        const txn = t as Transaction;
        if (txn.exchange) {
            txn.exchange = parseExchange(String(txn.exchange));
        } else {
            txn.exchange = undefined;
        }

        return {
            ...txn,
            qty: cleanNumber(txn.splitAdjustedQty || txn.originalQty),
            price: cleanNumber(txn.splitAdjustedPrice || txn.originalPrice),
            grossValue: cleanNumber(txn.originalQty) * cleanNumber(txn.originalPrice)
        };
    });

    // 3. Process Holdings (for price map)
    const priceMap: Record<string, Omit<SheetHolding, 'qty'>> = {};
    const priceData = holdingsRows.map((row: unknown[]) =>
        mapRowToHolding<Omit<MappedSheetHolding, 'qty'>>(
            row as any[],
            holdingMapping,
            holdingNumericKeys as any
        )
    );
    
    priceData.forEach(item => {
        try {
            const holding = item as any;
            if (holding.exchange) {
                holding.exchange = parseExchange(String(holding.exchange));
            }
            if (holding.type && typeof holding.type === 'string') {
                holding.type = new InstrumentClassification(holding.type);
            }
            const key = `${holding.ticker}-${holding.exchange}`;
            priceMap[key] = holding;
        } catch (e) {
            console.warn(`Skipping holding with invalid exchange: ${item.ticker}`, e);
        }
    });

    // 4. Calculate holdings quantities from transactions
    // NOTE: This logic for aggregating transactions into holdings MUST be kept in sync with the logic in 
    // Dashboard.tsx (loadData function) which performs a similar client-side aggregation for the UI.
    // Any changes to how transactions affect holdings (e.g. splits, new transaction types) must be applied in both places.
    const holdingsByPortfolio: Record<string, Record<string, SheetHolding & { qty: number }>> = {};
    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL' || txn.type === 'BUY_TRANSFER' || txn.type === 'SELL_TRANSFER') {
            if (!holdingsByPortfolio[txn.portfolioId]) {
                holdingsByPortfolio[txn.portfolioId] = {};
            }
            const key = `${txn.ticker}-${txn.exchange}`;
            if (!holdingsByPortfolio[txn.portfolioId][key]) {
                holdingsByPortfolio[txn.portfolioId][key] = {
                    portfolioId: txn.portfolioId,
                    ticker: txn.ticker,
                    exchange: txn.exchange!,
                    qty: 0,
                    numericId: txn.numericId || null
                };
            }
            const multiplier = (txn.type === 'BUY' || txn.type === 'BUY_TRANSFER') ? 1 : -1;
            const qty = parseFloat(String(txn.splitAdjustedQty || txn.originalQty));
            holdingsByPortfolio[txn.portfolioId][key].qty += qty * multiplier;
        }
    });

    // 5. Attach calculated holdings, enriched with price data, to portfolios
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
    const transactionsRaw = await fetchSheetData(
        spreadsheetId, TX_FETCH_RANGE,
        (row, index) => {
            const t = mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row, transactionMapping, transactionNumericKeys) as any;
            t.rowIndex = index + 2;
            return t;
        },
        'FORMATTED_VALUE' // Fetch formulas to get the raw formulas for calculation
    );
    return transactionsRaw.map(t_raw => {
        const t = t_raw as Transaction; 
        const cleanNumber = (val: unknown) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };
        
        if (t.exchange) {
            t.exchange = parseExchange(String(t.exchange));
        } else {
            t.exchange = undefined;
        }

        return {
            ...t,
            qty: cleanNumber(t.splitAdjustedQty || t.originalQty),
            price: cleanNumber(t.splitAdjustedPrice || t.originalPrice),
            grossValue: cleanNumber(t.originalQty) * cleanNumber(t.originalPrice)
        } as Transaction;
    }).filter(t => t.date && t.portfolioId && t.ticker);
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
    if (t.type === 'DIVIDEND') {
        throw new Error("Dividend transactions are no longer supported in the Transaction Log. Please use the Dividends sheet.");
    }
    await batchAddTransactions(spreadsheetId, [t]);
});

export const batchAddTransactions = withAuthHandling(async (spreadsheetId: string, transactions: Transaction[]) => {
    const gapi = await ensureGapi();

    const allValuesToAppend: (string | number | null)[][] = [];
    
    // 2. Prepare data for appending
    transactions.forEach(t => {
        const rowData: Record<string, string | number | null | undefined> = { ...t as any };
        
        // Normalize specific fields for the sheet
        rowData.date = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : '';
        rowData.ticker = String(logIfFalsy(t.ticker, `Transaction ticker missing`, t)).toUpperCase();
        rowData.exchange = toGoogleSheetsExchangeCode(t.exchange!);
        rowData.vestDate = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : '';
        rowData.comment = t.comment || '';
        rowData.source = t.source || '';
        
        // Commission handling: Convert to Agorot if currency is ILA
        const comm = t.commission || 0;
        const isILA = (t.currency || '').toUpperCase() === 'ILA';
        rowData.commission = isILA ? comm * 100 : comm;

        // Creation Date
        const cDate = t.creationDate ? new Date(t.creationDate) : new Date();
        rowData.creationDate = toGoogleSheetDateFormat(cDate);
        
        // Numeric ID mapping
        rowData.numeric_id = t.numericId;

        // Map to columns in correct order explicitly
        // Object.values is not guaranteed to be sorted, so we verify sort by colId
        const sortedColDefs = Object.values(TXN_COLS).sort((a, b) => {
            const lenDiff = a.colId.length - b.colId.length;
            return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
        });

        const rowValues = sortedColDefs.map(colDef => {
            if (colDef.formula) return null; // Formulas are added separately in step 3
            const key = colDef.key;
            // Use the normalized values from rowData if available, otherwise fallback to t[key]
            const val = rowData[key] ?? (t as any)[key];
            return (val === undefined) ? null : (val as string | number | null);
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

    // Parse range (e.g. "Transaction_Log!A10:V12") to find start row for formula application
    const match = updatedRange.match(/!A(\d+):/);
    if (!match) throw new Error("Could not parse start row number from range: " + updatedRange);
    const startRow = parseInt(match[1]);

    // 3. Apply Formulas
    // We update the formulas for the newly added rows. 
    // We batch these updates to reduce API calls, though for now we construct one request per cell/formula.
    const formulaColDefs = Object.values(TXN_COLS).filter(colDef => !!colDef.formula);
    const txSheetId = await getSheetId(spreadsheetId, TX_SHEET_NAME);

    const formulaRequests: any[] = [];

    // Note: We could potentially optimize this to one request per column block, 
    // but formula generation logic currently depends on `rowNum` individually.
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
        await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests: formulaRequests } });
    }

    // 4. Rebuild Holdings
    // This is a full sync of the holdings sheet based on all transactions.
    await rebuildHoldingsSheet(spreadsheetId);
});

type HoldingNonGeneratedData = Omit<SheetHolding, 'portfolioId' | 'totalValue' | 'price' | 'currency' | 'name' | 'nameHe' | 'sector' | 'changePct1d' | 'changePctRecent' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>;

// Note: h is typed as HoldingNonGeneratedData but we expect it to have 'qty' from the calculation in rebuildHoldingsSheet
function createHoldingRow(h: HoldingNonGeneratedData & { qty: number }, meta: TickerData | null, rowNum: number): any[] {
    const tickerCell = `A${rowNum}`;
    const exchangeCell = `B${rowNum}`;
    const priceCell = `C${rowNum}`; // Moved from D to C
    const tickerAndExchange = `${exchangeCell}&":"&${tickerCell}`;
    const row = new Array(holdingsHeaders.length).fill('');

    const isTASE = h.exchange === Exchange.TASE;

    row[0] = String(h.ticker).toUpperCase();
    row[1] = toGoogleSheetsExchangeCode(h.exchange);
    // Quantity column (index 2) is removed.
    row[2] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}))`; // Live_Price
    const defaultCurrency = meta?.currency || (isTASE ? 'ILA' : '');
    row[3] = (`=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"), "${escapeSheetString(defaultCurrency)}")`); // Currency
    row[4] = `=${h.qty}*${priceCell}`; // Total Holding Value (Inlined quantity)
    row[5] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), " ${escapeSheetString(meta?.name)}")`; // Name_En
    row[6] = meta?.nameHe || "";
    row[7] = meta?.sector || "";
    row[8] = meta?.type?.type || "";
    row[9] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`; // Day_Change

    const priceFormula = (dateExpr: string) => getHistoricalPriceFormula(tickerAndExchange, dateExpr);
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

// In-memory deduplication for dividend syncing in the current session
const dividendSyncLock = new Set<string>();

export const fetchDividends = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: Exchange): Promise<Dividend[]> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: DIVIDENDS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];
        
        const targetExchange = toGoogleSheetsExchangeCode(exchange);
        const targetTicker = ticker.toUpperCase();

        return rows
            .filter(row => String(row[0]) === targetExchange && String(row[1]) === targetTicker)
            .map(row => {
                let date: Date;
                const rawDate = row[2];
                if (typeof rawDate === 'number') {
                    date = new Date((rawDate - 25569) * 86400 * 1000);
                } else {
                    date = new Date(rawDate);
                }
                return {
                    date,
                    amount: Number(row[3])
                };
            })
            .filter(div => !isNaN(div.date.getTime()) && !isNaN(div.amount));
    } catch (error: any) {
        if (error.result?.error?.code === 400) {
            return [];
        }
        throw error;
    }
});

export const fetchAllDividends = withAuthHandling(async (spreadsheetId: string): Promise<{ ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex: number }[]> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: DIVIDENDS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];
        
        return rows.map((row, index) => {
                let date: Date;
                const rawDate = row[2];
                if (typeof rawDate === 'number') {
                    date = new Date((rawDate - 25569) * 86400 * 1000);
                } else {
                    date = new Date(rawDate);
                }
                
                let exchange: Exchange | undefined;
                try { exchange = parseExchange(String(row[0])); } catch {}

                return {
                    exchange,
                    ticker: String(row[1]).toUpperCase(),
                    date,
                    amount: Number(row[3]),
                    source: String(row[4] || ''),
                    rowIndex: index + 2
                };
            })
            .filter(div => div.exchange && !isNaN(div.date.getTime()) && !isNaN(div.amount)) as { ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex: number }[];
    } catch (error: any) {
        if (error.result?.error?.code === 400) {
            return [];
        }
        throw error;
    }
});

export const syncDividends = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: Exchange, dividends: Dividend[], source: string) => {
    if (!dividends || dividends.length === 0) return;
    
    const lockKey = `${exchange}:${ticker.toUpperCase()}`;
    if (dividendSyncLock.has(lockKey)) return;
    dividendSyncLock.add(lockKey);

    // Normalize source
    const effectiveSource = source.toUpperCase().includes('MANUAL') ? 'MANUAL' : 'YAHOO';

    const gapi = await ensureGapi();
    try {
        // 1. Fetch existing dividends for this ticker from the DIVIDENDS sheet
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: DIVIDENDS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];
        
        const manualDates = new Set<string>();
        const exactMatches = new Set<string>();

        rows.forEach(row => {
            const rowEx = String(row[0]);
            const rowTicker = String(row[1]);
            
            let rowDate: string;
            if (typeof row[2] === 'number') {
                const date = new Date((row[2] - 25569) * 86400 * 1000);
                rowDate = date.toISOString().split('T')[0];
            } else {
                rowDate = new Date(row[2]).toISOString().split('T')[0];
            }
            
            const rowAmount = Number(row[3]).toFixed(6);
            const rowSource = String(row[4] || '').toUpperCase();

            const commonPrefix = `${rowEx}:${rowTicker}:${rowDate}`;
            
            if (rowSource === 'MANUAL') {
                manualDates.add(commonPrefix);
            }
            exactMatches.add(`${commonPrefix}:${rowAmount}`);
        });

        const newRows = dividends
            .map(div => {
                const dateStr = div.date.toISOString().split('T')[0];
                const amountStr = div.amount.toFixed(6);
                const prefix = `${toGoogleSheetsExchangeCode(exchange)}:${ticker.toUpperCase()}:${dateStr}`;
                
                // Rule 1: If a MANUAL entry exists for this date, ignore the incoming auto-dividend.
                // This allows users to "override" Yahoo data by entering a manual row.
                if (manualDates.has(prefix)) return null;

                // Rule 2: If an exact match exists (same amount), ignore to prevent duplicates.
                if (exactMatches.has(`${prefix}:${amountStr}`)) return null;
                
                return [
                    toGoogleSheetsExchangeCode(exchange),
                    ticker.toUpperCase(),
                    dateStr,
                    div.amount,
                    effectiveSource
                ];
            })
            .filter((row): row is any[] => row !== null);

        if (newRows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${DIV_SHEET_NAME}!A:A`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: newRows }
            });
            // Update metadata
            await setMetadataValue(spreadsheetId, 'dividends_rebuild', toGoogleSheetDateFormat(new Date()));
            clearFinanceCache(spreadsheetId);
        }
    } catch (error: unknown) {
        const err = error as GapiError;
        if (err.result?.error?.code === 400) {
             console.warn("Dividends sheet not found, skipping sync.");
             return;
        }
        throw error;
    }
});

export const addDividendEvent = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: Exchange, date: Date, amount: number) => {
    // Clear lock for this ticker so it can re-fetch/re-sync if needed, though syncDividends handles dupes
    const lockKey = `${exchange}:${ticker.toUpperCase()}`;
    dividendSyncLock.delete(lockKey);

    await syncDividends(spreadsheetId, ticker, exchange, [{ date, amount }], 'MANUAL');
});

export const updateTransaction = withAuthHandling(async (spreadsheetId: string, t: Transaction, originalTxn: Transaction) => {
    if (!t.rowIndex) throw new Error("Transaction missing rowIndex for update");
    const gapi = await ensureGapi();

    // Verification: Fetch row to check consistency before update
    const rowIndex = t.rowIndex;
    const rangeVerify = `${TX_SHEET_NAME}!A${rowIndex}:G${rowIndex}`; // Fetch up to Price
    const resVerify = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range: rangeVerify, valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rowVerify = resVerify.result.values?.[0];
    
    if (!rowVerify) throw new Error("Row not found for update verification.");

    const sheetTicker = String(rowVerify[2]).toUpperCase();
    const origTicker = originalTxn.ticker.toUpperCase();
    
    if (sheetTicker !== origTicker) {
        throw new Error(`Verification failed: Ticker mismatch. Expected ${origTicker}, found ${sheetTicker}. The sheet may have been modified externally.`);
    }

    const sheetQty = Number(rowVerify[5]);
    const origQty = Number(originalTxn.originalQty);
    if (Math.abs(sheetQty - origQty) > 0.0001) {
         throw new Error(`Verification failed: Quantity mismatch. Expected ${origQty}, found ${sheetQty}.`);
    }

    // Prepare row data (same logic as batchAddTransactions)
    const rowData: Record<string, string | number | null | undefined> = { ...t as any };
    rowData.date = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : '';
    rowData.ticker = String(logIfFalsy(t.ticker, `Transaction ticker missing`, t)).toUpperCase();
    rowData.exchange = toGoogleSheetsExchangeCode(t.exchange!);
    rowData.vestDate = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : '';
    rowData.comment = t.comment || '';
    rowData.source = t.source || '';
    
    const comm = t.commission || 0;
    const isILA = (t.currency || '').toUpperCase() === 'ILA';
    rowData.commission = isILA ? comm * 100 : comm;

    const cDate = t.creationDate ? new Date(t.creationDate) : new Date();
    rowData.creationDate = toGoogleSheetDateFormat(cDate);
    rowData.numeric_id = t.numericId;

    const sortedColDefs = Object.values(TXN_COLS).sort((a, b) => {
        const lenDiff = a.colId.length - b.colId.length;
        return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
    });

    const rowValues = sortedColDefs.map(colDef => {
        if (colDef.formula) return null;
        const key = colDef.key;
        const val = rowData[key] ?? (t as any)[key];
        return (val === undefined) ? null : (val as string | number | null);
    });

    // Update the row
    const range = `${TX_SHEET_NAME}!A${t.rowIndex}`;
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range, valueInputOption: 'USER_ENTERED',
        resource: { values: [rowValues] }
    });

    // Re-apply formulas for this row
    const formulaColDefs = Object.values(TXN_COLS).filter(colDef => !!colDef.formula);
    const txSheetId = await getSheetId(spreadsheetId, TX_SHEET_NAME);
    const requests = formulaColDefs.map((colDef) => {
        const formula = colDef.formula!(t.rowIndex!, TXN_COLS);
        const colIndex = Object.values(TXN_COLS).indexOf(colDef);
        return {
            updateCells: {
                range: { sheetId: txSheetId, startRowIndex: t.rowIndex! - 1, endRowIndex: t.rowIndex!, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
                rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
                fields: 'userEnteredValue.formulaValue'
            }
        };
    });

    if (requests.length > 0) {
        await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
    }

    await rebuildHoldingsSheet(spreadsheetId);
});

export const updateDividend = withAuthHandling(async (spreadsheetId: string, rowIndex: number, ticker: string, exchange: Exchange, date: Date, amount: number, source: string, originalDiv: { ticker: string, amount: number }) => {
    const gapi = await ensureGapi();
    
    // Verification
    const rangeVerify = `${DIV_SHEET_NAME}!A${rowIndex}:D${rowIndex}`;
    const resVerify = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range: rangeVerify, valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const rowVerify = resVerify.result.values?.[0];
    if (!rowVerify) throw new Error("Row not found for update verification.");

    const sheetTicker = String(rowVerify[1]).toUpperCase();
    const origTicker = originalDiv.ticker.toUpperCase();
    
    if (sheetTicker !== origTicker) {
        throw new Error(`Verification failed: Ticker mismatch. Expected ${origTicker}, found ${sheetTicker}.`);
    }
    
    const sheetAmount = Number(rowVerify[3]);
    if (Math.abs(sheetAmount - originalDiv.amount) > 0.000001) {
         throw new Error(`Verification failed: Amount mismatch. Expected ${originalDiv.amount}, found ${sheetAmount}.`);
    }

    const dateStr = toGoogleSheetDateFormat(date);
    const row = [
        toGoogleSheetsExchangeCode(exchange),
        ticker.toUpperCase(),
        dateStr,
        amount,
        source
    ];
    
    const range = `${DIV_SHEET_NAME}!A${rowIndex}:E${rowIndex}`;
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range, valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
    clearFinanceCache(spreadsheetId);
});

export const deleteTransaction = withAuthHandling(async (spreadsheetId: string, rowIndex: number, originalTxn: Transaction) => {
    const gapi = await ensureGapi();
    
    // Verification: Fetch row to check consistency
    const range = `${TX_SHEET_NAME}!A${rowIndex}:G${rowIndex}`; // Fetch up to Price
    // Use FORMATTED_VALUE to easily compare date string if possible, or UNFORMATTED for numbers.
    // Let's use UNFORMATTED and fuzzy compare numbers.
    const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const row = res.result.values?.[0];
    
    if (!row) throw new Error("Row not found for deletion verification.");

    // Row Indices (A=0): A=Date, B=Portfolio, C=Ticker, D=Exchange, E=Type, F=Qty, G=Price
    const sheetTicker = String(row[2]).toUpperCase();
    const origTicker = originalTxn.ticker.toUpperCase();
    
    if (sheetTicker !== origTicker) {
        throw new Error(`Verification failed: Ticker mismatch. Expected ${origTicker}, found ${sheetTicker}. The sheet may have been modified externally.`);
    }

    const sheetQty = Number(row[5]);
    const origQty = Number(originalTxn.originalQty);
    if (Math.abs(sheetQty - origQty) > 0.0001) {
         throw new Error(`Verification failed: Quantity mismatch. Expected ${origQty}, found ${sheetQty}.`);
    }

    const txSheetId = await getSheetId(spreadsheetId, TX_SHEET_NAME);
    
    await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: txSheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        }
    });

    await rebuildHoldingsSheet(spreadsheetId);
});

export const deleteDividend = withAuthHandling(async (spreadsheetId: string, rowIndex: number, originalDiv: { ticker: string, amount: number }) => {
    const gapi = await ensureGapi();
    
    // Verification
    const range = `${DIV_SHEET_NAME}!A${rowIndex}:D${rowIndex}`; // Exchange(A), Ticker(B), Date(C), Amount(D)
    const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const row = res.result.values?.[0];
    if (!row) throw new Error("Row not found for deletion verification.");

    const sheetTicker = String(row[1]).toUpperCase();
    const origTicker = originalDiv.ticker.toUpperCase();
    
    if (sheetTicker !== origTicker) {
        throw new Error(`Verification failed: Ticker mismatch. Expected ${origTicker}, found ${sheetTicker}.`);
    }
    
    const sheetAmount = Number(row[3]);
    if (Math.abs(sheetAmount - originalDiv.amount) > 0.000001) {
         throw new Error(`Verification failed: Amount mismatch. Expected ${originalDiv.amount}, found ${sheetAmount}.`);
    }

    const divSheetId = await getSheetId(spreadsheetId, DIV_SHEET_NAME);
    
    await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: divSheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        }
    });
    clearFinanceCache(spreadsheetId);
});



export const batchSyncDividends = withAuthHandling(async (spreadsheetId: string, items: { ticker: string, exchange: Exchange, dividends: Dividend[], source: string }[]) => {
    if (!items || items.length === 0) return;

    const gapi = await ensureGapi();
    try {
        // 1. Fetch existing dividends ONCE
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: DIVIDENDS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        });
        const rows = res.result.values || [];

        const manualDates = new Set<string>();
        const exactMatches = new Set<string>();

        rows.forEach(row => {
            const rowEx = String(row[0]);
            const rowTicker = String(row[1]);

            let rowDate: string;
            if (typeof row[2] === 'number') {
                const date = new Date((row[2] - 25569) * 86400 * 1000);
                rowDate = date.toISOString().split('T')[0];
            } else {
                rowDate = new Date(row[2]).toISOString().split('T')[0];
            }

            const rowAmount = Number(row[3]).toFixed(6);
            const rowSource = String(row[4] || '').toUpperCase();

            const commonPrefix = `${rowEx}:${rowTicker}:${rowDate}`;

            if (rowSource === 'MANUAL') {
                manualDates.add(commonPrefix);
            }
            exactMatches.add(`${commonPrefix}:${rowAmount}`);
        });

        const allNewRows: any[][] = [];

        items.forEach(item => {
            const effectiveSource = item.source.toUpperCase().includes('MANUAL') ? 'MANUAL' : 'YAHOO';
            const exc = toGoogleSheetsExchangeCode(item.exchange);
            const tic = item.ticker.toUpperCase();

            item.dividends.forEach(div => {
                const dateStr = div.date.toISOString().split('T')[0];
                const amountStr = div.amount.toFixed(6);
                const prefix = `${exc}:${tic}:${dateStr}`;

                if (manualDates.has(prefix)) return;
                if (exactMatches.has(`${prefix}:${amountStr}`)) return;

                // Avoid adding duplicates within the same batch
                if (exactMatches.has(`${prefix}:${amountStr}`)) return;
                exactMatches.add(`${prefix}:${amountStr}`); // Mark as added for this batch

                allNewRows.push([
                    exc,
                    tic,
                    dateStr,
                    div.amount,
                    effectiveSource
                ]);
            });
        });

        if (allNewRows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${DIV_SHEET_NAME}!A:A`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: allNewRows }
            });
            await setMetadataValue(spreadsheetId, 'dividends_rebuild', toGoogleSheetDateFormat(new Date()));
            clearFinanceCache(spreadsheetId);
        }

    } catch (error: unknown) {
        const err = error as GapiError;
        if (err.result?.error?.code === 400) {
            console.warn("Dividends sheet not found, skipping sync.");
            return;
        }
        throw error;
    }
});

export const rebuildHoldingsSheet = withAuthHandling(async (spreadsheetId: string) => {
    const gapi = await ensureGapi();

    // 1. Parallel Fetch: CURRENT Holdings (for cache) AND Transactions
    const [currentHoldingsRes, transactions] = await Promise.all([
        gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: HOLDINGS_RANGE,
            valueRenderOption: 'UNFORMATTED_VALUE',
        }),
        fetchTransactions(spreadsheetId)
    ]);

    const currentRows = currentHoldingsRes.result.values || [];

    // Map: "TICKER:EXCHANGE" -> Metadata
    const metadataCache = new Map<string, TickerData>();

    currentRows.forEach((row: any[]) => {
        const ticker = String(row[0] || '').toUpperCase();
        const exchangeStr = String(row[1] || '');
        if (!ticker || !exchangeStr) return;

        let exchange: Exchange;
        try { exchange = parseExchange(exchangeStr); } catch { return; }

        const key = `${ticker}:${exchange}`;

        const cachedMeta: any = {
            ticker,
            exchange,
            name: row[6] === 'Loading...' ? undefined : row[6],
            nameHe: row[7],
            sector: row[8],
            type: row[9] ? new InstrumentClassification(row[9]) : undefined,
            numericId: row[19] ? Number(row[19]) : null,
            recentChangeDays: row[20] ? Number(row[20]) : 7
        };

        if (cachedMeta.name && cachedMeta.name.trim() !== '') {
            metadataCache.set(key, cachedMeta);
        }
    });

    const holdings: Record<string, { ticker: string, exchange: Exchange, qty: number, numericId: number | null }> = {};

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL' || txn.type === 'BUY_TRANSFER' || txn.type === 'SELL_TRANSFER') {
            const key = `${txn.ticker}-${txn.exchange}`;
            if (!holdings[key]) {
                if (!txn.exchange) throw new Error(`Transaction missing exchange for ticker: ${txn.ticker}`);
                holdings[key] = { ticker: txn.ticker, exchange: txn.exchange, qty: 0, numericId: null };
            }
            if (txn.numericId !== undefined) {
                holdings[key].numericId = txn.numericId ?? null;
            }
            const multiplier = (txn.type === 'BUY' || txn.type === 'BUY_TRANSFER') ? 1 : -1;
            const qty = parseFloat(String(txn.splitAdjustedQty || txn.originalQty));
            holdings[key].qty += qty * multiplier;
        }
    });

    // Collect dividends to sync
    const dividendsToSync: { ticker: string, exchange: Exchange, dividends: Dividend[], source: string }[] = [];

    const enrichedData = await Promise.all(Object.values(holdings).map(async (h) => {
        const cacheKey = `${h.ticker.toUpperCase()}:${h.exchange}`;
        let meta: TickerData | null | undefined = metadataCache.get(cacheKey);

        if (meta) {
            if (h.numericId && !meta.numericId) {
                meta.numericId = h.numericId;
            }
        } else {
            try {
                meta = await getTickerData(h.ticker, h.exchange, h.numericId);
                if (meta?.dividends && meta.dividends.length > 0) {
                    dividendsToSync.push({
                        ticker: h.ticker,
                        exchange: h.exchange,
                        dividends: meta.dividends,
                        source: 'YAHOO'
                    });
                }
            } catch (e) {
                console.warn("Failed to fetch metadata for " + h.ticker, e);
            }
        }

        return { h, meta: meta || null };
    }));

    // Batch sync all collected dividends
    if (dividendsToSync.length > 0) {
        await batchSyncDividends(spreadsheetId, dividendsToSync);
    }

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
    clearFinanceCache(spreadsheetId);
});

export const addPortfolio = withAuthHandling(async (spreadsheetId: string, p: Portfolio) => {
    const gapi = await ensureGapi();
    const pForSheet = { ...p };
    if (pForSheet.taxHistory) {
        (pForSheet as any).taxHistory = JSON.stringify(pForSheet.taxHistory);
    }
    if (pForSheet.feeHistory) {
        (pForSheet as any).feeHistory = JSON.stringify(pForSheet.feeHistory);
    }
    const row = objectToRow(pForSheet, portfolioHeaders, portfolioMapping as any);
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId, range: `${PORTFOLIO_SHEET_NAME}!A:A`, valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });
    clearFinanceCache(spreadsheetId);
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
    const pForSheet = { ...p };
    if (pForSheet.taxHistory) {
        (pForSheet as any).taxHistory = JSON.stringify(pForSheet.taxHistory);
    }
    if (pForSheet.feeHistory) {
        (pForSheet as any).feeHistory = JSON.stringify(pForSheet.feeHistory);
    }
    const rowData = objectToRow(pForSheet, portfolioHeaders, portfolioMapping as any);
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId, range: range, valueInputOption: 'USER_ENTERED', resource: { values: [rowData] }
    });
    clearFinanceCache(spreadsheetId);
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

export const fetchSheetExchangeRates = withAuthHandling(async (spreadsheetId: string): Promise<Record<string, Record<string, number>>> => {
    const gapi = await ensureGapi();
    const res = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId, range: CONFIG_RANGE, valueRenderOption: 'UNFORMATTED_VALUE'
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

    const allRates: Record<string, Record<string, number>> = {};
    const rawPairs: Record<string, Record<string, number>> = {};

    // Initialize period objects
    for (const period in periodIndices) {
        allRates[period] = { USD: 1 };
        rawPairs[period] = {};
    }

    if (rows.length === 0) {
        console.warn('fetchSheetExchangeRates: No rows returned from sheet.');
        return allRates;
    }

    // 1. Collect Raw Pairs
    rows.forEach((r: unknown[]) => {
        const row = r as any[];
        const rawKey = row[keyIndex];
        const pair = typeof rawKey === 'string' ? rawKey.trim().toUpperCase() : '';
        if (!pair || pair.length !== 6) return;

        for (const period in periodIndices) {
            const index = periodIndices[period];
            const val = Number(row[index]);
            if (!isNaN(val) && val !== 0) {
                rawPairs[period][pair] = val;
            }
        }
    });

    // 2. Resolve Rates using Graph for each period
    // We process 'ago1d' and 'current' first to establish baselines
    const sortedPeriods = ['ago1d', 'current', ...Object.keys(periodIndices).filter(p => p !== 'current' && p !== 'ago1d')];

    for (const period of sortedPeriods) {
        const periodRaw = rawPairs[period];
        const rates = allRates[period];
        
        // Build adjacency list for this period
        const graph: Record<string, Record<string, number>> = {};
        const nodes = new Set<string>(['USD']);
        
        // Helper to add edge
        const addEdge = (from: string, to: string, rate: number) => {
            if (!graph[from]) graph[from] = {};
            graph[from][to] = rate;
        };

        Object.keys(periodRaw).forEach(pair => {
            const val = periodRaw[pair];
            if (val > 0) {
                const from = pair.substring(0, 3);
                const to = pair.substring(3, 6);
                addEdge(from, to, val);
                addEdge(to, from, 1/val);
                nodes.add(from);
                nodes.add(to);
            }
        });

        // BFS/Lookup to find rate from USD to every other node
        nodes.forEach(target => {
            if (target === 'USD') return;

            // 1. Direct?
            if (graph['USD']?.[target]) {
                rates[target] = graph['USD'][target];
                return;
            }

            // 2. Length 2 Chain? (USD -> Inter -> Target)
            if (graph['USD']) {
                for (const inter in graph['USD']) {
                    if (graph[inter]?.[target]) {
                        const rate1 = graph['USD'][inter];
                        const rate2 = graph[inter][target];
                        rates[target] = rate1 * rate2;
                        return;
                    }
                }
            }
        });

        // 3. Fallback logic:
        // If 'current' rate is missing, fallback to 'ago1d'. 
        // We do NOT fallback for other historical periods (user preference).
        if (period === 'current') {
             const fallbackRates = allRates['ago1d'];
             const knownCurrencies = Object.keys(fallbackRates);
             knownCurrencies.forEach(curr => {
                 // If current rate is missing (0 or undefined), but we have a 1-day-old rate, use it.
                 if (curr !== 'USD' && (!rates[curr] || rates[curr] === 0)) {
                     const fallback = fallbackRates[curr];
                     if (fallback && fallback > 0) {
                         rates[curr] = fallback;
                     }
                 }
             });
        }
    }

    // 4. Validate Critical Currencies
    const currentRates = allRates['current'];
    const missing = ['ILS', 'EUR', 'GBP'].filter(c => !currentRates[c]);

    if (missing.length > 0) {
        console.warn(`fetchSheetExchangeRates: Missing rates for ${missing.join(', ')}. Check 'Currency_Conversions' sheet.`);
    }

    // Default missing major currencies to 0 to avoid crashes
    ['ILS', 'EUR', 'GBP'].forEach(curr => {
        for (const period in periodIndices) {
            if (!allRates[period][curr] || isNaN(allRates[period][curr])) {
                allRates[period][curr] = 0;
            }
        }
    });

    return allRates;
});

export const addExternalPrice = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: Exchange, date: Date, price: number, currency: Currency) => {
    const gapi = await ensureGapi();
    const row = [ticker, toGoogleSheetsExchangeCode(exchange), toGoogleSheetDateFormat(date), price, currency];
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId, range: EXTERNAL_DATASETS_RANGE, valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', resource: { values: [row] }
    });
    clearFinanceCache(spreadsheetId);
});

export const getExternalPrices = withAuthHandling(async (spreadsheetId: string): Promise<Record<string, { date: Date, price: number, currency: Currency }[]>> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId, range: EXTERNAL_DATASETS_RANGE, valueRenderOption: 'UNFORMATTED_VALUE'
        });
        const rows = res.result.values || [];
        const prices: Record<string, { date: Date, price: number, currency: Currency }[]> = {};

        rows.forEach((r: unknown[]) => {
            const row = r as any[];
            if (!row[0] || !row[1] || !row[3]) return; // Ticker, Exchange, Price required
            
            let exchange: Exchange;
            try {
                 exchange = parseExchange(String(row[1]));
            } catch (e) {
                return;
            }
            
            const key = `${exchange}:${row[0].toString().toUpperCase()}`;
            if (!prices[key]) prices[key] = [];
            
            // Date handling: Sheets might return number (OADate) or string
            let dateVal: Date;
            const rawDate = row[2];
            if (typeof rawDate === 'number') {
                 // OADate conversion (approximate, Google Sheets base date Dec 30 1899)
                 dateVal = new Date((rawDate - 25569) * 86400 * 1000);
            } else {
                 dateVal = new Date(rawDate);
            }
            
            if (isNaN(dateVal.getTime())) return; // Invalid date

            prices[key].push({
                date: dateVal,
                price: Number(row[3]),
                currency: normalizeCurrency(row[4] || '')
            });
        });
        
        // Sort by date descending
        Object.values(prices).forEach(list => list.sort((a, b) => b.date.getTime() - a.date.getTime()));
        
        return prices;
    } catch (e: unknown) {
        const err = e as GapiError;
        // If sheet/range not found (e.g. older schema), return empty instead of failing
        if (err.result?.error?.code === 400) {
            console.warn("External_Datasets sheet not found or invalid range. Returning empty prices.");
            return {};
        }
        throw e;
    }
});

export {};
