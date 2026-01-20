/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, findSpreadsheetByName } from '../google';
import { getTickerData, type TickerData } from '../fetching';
import { toGoogleSheetDateFormat } from '../date';
import { type Portfolio, type Transaction, type Holding, Exchange, parseExchange, toGoogleSheetsExchangeCode, Currency } from '../types';
import { normalizeCurrency } from '../currency';
import {
    TXN_COLS, transactionHeaders, transactionMapping, transactionNumericKeys,
    portfolioHeaders, holdingsHeaders, configHeaders, portfolioMapping, portfolioNumericKeys,
    holdingMapping, holdingNumericKeys, type Headers, DEFAULT_SHEET_NAME, PORT_OPT_RANGE, type SheetHolding,
    TX_SHEET_NAME, TX_FETCH_RANGE, CONFIG_SHEET_NAME, CONFIG_RANGE, METADATA_SHEET, 
    metadataHeaders, METADATA_RANGE, HOLDINGS_SHEET, HOLDINGS_RANGE, SHEET_STRUCTURE_VERSION_DATE,
    EXTERNAL_DATASETS_SHEET_NAME, externalDatasetsHeaders, EXTERNAL_DATASETS_RANGE
} from './config';
import { getHistoricalPriceFormula } from './formulas';
import { logIfFalsy } from '../utils';
import { createRowMapper, fetchSheetData, objectToRow, createHeaderUpdateRequest, getSheetId, ensureSheets } from './utils';
import { PORTFOLIO_SHEET_NAME } from './config';
import { fetchGlobesStockQuote } from '../fetching/globes';

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
        EXTERNAL_DATASETS_SHEET_NAME
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
        const getFormula = (dateExpr: string) => getHistoricalPriceFormula(currencyPair, dateExpr, true);
        
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

export const fetchHolding = withAuthHandling(async (spreadsheetId: string, ticker: string, exchange: string): Promise<Holding | null> => {
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
            const holdingRaw = mapRowToHolding<SheetHolding>(row, holdingMapping, holdingNumericKeys);
            try {
                if ((holdingRaw as any).exchange) {
                    (holdingRaw as any).exchange = parseExchange((holdingRaw as any).exchange);
                }
            } catch (e) {
                console.warn(`fetchHolding: invalid exchange for ${holdingRaw.ticker}: ${(holdingRaw as any).exchange}`);
                // fallback or leave as is, type safety might be compromised if not Exchange enum
                (holdingRaw as any).exchange = undefined;
            }
            return holdingRaw as Holding;
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
    const portfolios = portfolioRows.map((row: any[]) => 
        mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys)
    ).filter(Boolean);

    // 2. Process Transactions (Logic copied from fetchTransactions to avoid re-fetch, but reusing the mapper)
    const transactions = transactionRows.map((row: any[]) => 
        mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row, transactionMapping, transactionNumericKeys)
    ).map((t: any) => {
        const cleanNumber = (val: any) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };
        
        if (t.exchange) {
            t.exchange = parseExchange(t.exchange);
        } else {
            t.exchange = undefined;
        }

        return {
            ...t,
            qty: cleanNumber(t.splitAdjustedQty || t.originalQty),
            price: cleanNumber(t.splitAdjustedPrice || t.originalPrice),
            grossValue: cleanNumber(t.originalQty) * cleanNumber(t.originalPrice)
        } as Transaction;
    });

    // 3. Process Holdings (for price map)
    const priceMap: Record<string, Omit<SheetHolding, 'qty'>> = {};
    const priceData = holdingsRows.map((row: any[]) =>
        mapRowToHolding<Omit<SheetHolding, 'qty'>>(
            row,
            holdingMapping,
            holdingNumericKeys.filter(k => k !== 'qty') as any
        )
    );
    
    priceData.forEach(item => {
        try {
            if ((item as any).exchange) {
                (item as any).exchange = parseExchange((item as any).exchange);
            }
            const key = `${item.ticker}-${item.exchange}`;
            priceMap[key] = item;
        } catch (e) {
            console.warn(`Skipping holding with invalid exchange: ${(item as any).ticker}`, e);
        }
    });

    // 4. Calculate holdings quantities from transactions
    // NOTE: This logic for aggregating transactions into holdings MUST be kept in sync with the logic in 
    // Dashboard.tsx (loadData function) which performs a similar client-side aggregation for the UI.
    // Any changes to how transactions affect holdings (e.g. splits, new transaction types) must be applied in both places.
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
                    exchange: txn.exchange!,
                    qty: 0,
                    numericId: txn.numericId || null
                };
            }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
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
        (row) => mapRowToTransaction<Omit<Transaction, 'grossValue'>>(row, transactionMapping, transactionNumericKeys),
        'FORMATTED_VALUE' // Fetch formulas to get the raw formulas for calculation
    );
    return transactionsRaw.map(t_raw => {
        const t = t_raw as any; // Allow modifying exchange
        const cleanNumber = (val: any) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        };
        
        if (t.exchange) {
            t.exchange = parseExchange(t.exchange);
        } else {
            t.exchange = undefined;
        }

        return {
            ...t,
            qty: cleanNumber(t.splitAdjustedQty || t.originalQty),
            price: cleanNumber(t.splitAdjustedPrice || t.originalPrice),
            grossValue: cleanNumber(t.originalQty) * cleanNumber(t.originalPrice)
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

export const batchAddTransactions = withAuthHandling(async (spreadsheetId: string, transactions: Transaction[]) => {
    const gapi = await ensureGapi();

    const allValuesToAppend: any[][] = [];
    
    // 2. Prepare data for appending
    transactions.forEach(t => {
        const rowData: { [key: string]: any } = { ...t };
        
        // Normalize specific fields for the sheet
        rowData.date = t.date ? toGoogleSheetDateFormat(new Date(t.date)) : '';
        rowData.ticker = String(logIfFalsy(t.ticker, `Transaction ticker missing`, t)).toUpperCase();
        rowData.exchange = toGoogleSheetsExchangeCode(t.exchange!);
        rowData.vestDate = t.vestDate ? toGoogleSheetDateFormat(new Date(t.vestDate)) : '';
        rowData.comment = t.comment || '';
        rowData.source = t.source || '';
        rowData.tax = t.tax || 0;
        
        // Commission handling: Convert to Agorot if currency is ILA
        const comm = t.commission || 0;
        const isILA = (t.currency || '').toUpperCase() === 'ILA';
        rowData.commission = isILA ? comm * 100 : comm;

        // Creation Date
        const cDate = t.creationDate ? new Date(t.creationDate) : new Date();
        rowData.creationDate = toGoogleSheetDateFormat(cDate);
        
        // Numeric ID mapping
        rowData.numeric_id = t.numericId;

        // Map to columns in correct order
        const rowValues = Object.values(TXN_COLS).map(colDef => {
            if (colDef.formula) return null; // Formulas are added separately in step 3
            const key = colDef.key;
            // Use the normalized values from rowData if available, otherwise fallback to t[key]
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

type HoldingNonGeneratedData = Omit<Holding, 'portfolioId' | 'totalValue' | 'price' | 'currency' | 'name' | 'nameHe' | 'sector' | 'changePct1d' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>;
function createHoldingRow(h: HoldingNonGeneratedData, meta: TickerData | null, rowNum: number): any[] {
    const tickerCell = `A${rowNum}`;
    const exchangeCell = `B${rowNum}`;
    const qtyCell = `C${rowNum}`;
    const priceCell = `D${rowNum}`;
    const tickerAndExchange = `${exchangeCell}&":"&${tickerCell}`;
    const row = new Array(holdingsHeaders.length).fill('');

    const isTASE = h.exchange === Exchange.TASE;

    row[0] = String(h.ticker).toUpperCase();
    row[1] = toGoogleSheetsExchangeCode(h.exchange);
    row[2] = h.qty;
    row[3] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}))`;
    const defaultCurrency = meta?.currency || (isTASE ? 'ILA' : '');
    row[4] = (`=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"), "${defaultCurrency}")`);
    row[5] = `=${qtyCell}*${priceCell}`;
    row[6] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), " ${meta?.name || ""}")`;
    row[7] = meta?.nameHe || "";
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
    const holdings: Record<string, Omit<Holding, 'portfolioId' | 'totalValue' | 'price' | 'currency' | 'name' | 'nameHe' | 'sector' | 'changePct1d' | 'changePct1w' | 'changePct1m' | 'changePct3m' | 'changePctYtd' | 'changePct1y' | 'changePct3y' | 'changePct5y' | 'changePct10y'>> = {};

    // Sort transactions by date to ensure we get the latest numericId for a holding
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    transactions.forEach(txn => {
        if (txn.type === 'BUY' || txn.type === 'SELL') {
            const key = `${txn.ticker}-${txn.exchange}`;
            if (!holdings[key]) {
                if (!txn.exchange) throw new Error(`Transaction missing exchange for ticker: ${txn.ticker}`);
                holdings[key] = { ticker: txn.ticker, exchange: txn.exchange, qty: 0, numericId: null };
            }
            // Since transactions are sorted, this will overwrite with the latest numericId for each holding
            if (txn.numericId) {
                holdings[key].numericId = txn.numericId;
            }
            const multiplier = txn.type === 'BUY' ? 1 : -1;
            const qty = parseFloat(String(txn.splitAdjustedQty || txn.originalQty));
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

    const allRates: any = {};
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
    rows.forEach((r: any[]) => {
        const rawKey = r[keyIndex];
        const pair = typeof rawKey === 'string' ? rawKey.trim().toUpperCase() : '';
        if (!pair || pair.length !== 6) return;

        for (const period in periodIndices) {
            const index = periodIndices[period];
            const val = Number(r[index]);
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

    // 4. External Fallback (Globes) for Critical Currencies
    const currentRates = allRates['current'];
    const missing = ['ILS', 'EUR', 'GBP'].filter(c => !currentRates[c]);

    if (missing.length > 0) {
        console.warn(`fetchSheetExchangeRates: Missing rates for ${missing.join(', ')}. Attempting Globes fallback.`);
        const getRate = async (pair: string) => (await fetchGlobesStockQuote(pair, undefined, Exchange.FOREX))?.price;

        // Recover ILS first (critical pivot)
        if (!currentRates['ILS']) currentRates['ILS'] = await getRate('USDILS');

        await Promise.all(missing.filter(c => c !== 'ILS').map(async c => {
            // Try direct: USD -> Target
            let r = await getRate(`USD${c}`);
            if (r) { currentRates[c] = r; return; }

            // Try inverted: Target -> USD
            r = await getRate(`${c}USD`);
            if (r) { currentRates[c] = 1 / r; return; }

            // Try Cross via ILS: Target -> ILS
            // Rate[Target] (Target/USD) = Rate[ILS] (ILS/USD) / (ILS/Target)
            if (currentRates['ILS']) {
                r = await getRate(`${c}ILS`);
                if (r) currentRates[c] = currentRates['ILS'] / r;
            }
        }));
    }

    // Default missing major currencies to 0 to avoid crashes, but log warning
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
});

export const getExternalPrices = withAuthHandling(async (spreadsheetId: string): Promise<Record<string, { date: Date, price: number, currency: Currency }[]>> => {
    const gapi = await ensureGapi();
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId, range: EXTERNAL_DATASETS_RANGE, valueRenderOption: 'UNFORMATTED_VALUE'
        });
        const rows = res.result.values || [];
        const prices: Record<string, { date: Date, price: number, currency: Currency }[]> = {};

        rows.forEach((row: any[]) => {
            if (!row[0] || !row[1] || !row[3]) return; // Ticker, Exchange, Price required
            
            let exchange: Exchange;
            try {
                 exchange = parseExchange(row[1]);
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
    } catch (e: any) {
        // If sheet/range not found (e.g. older schema), return empty instead of failing
        if (e.result?.error?.code === 400 || e.status === 400) {
            console.warn("External_Datasets sheet not found or invalid range. Returning empty prices.");
            return {};
        }
        throw e;
    }
});

// Remove unused function export
export {};
