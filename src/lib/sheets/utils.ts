/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi } from '../google';
import type { Headers } from './config';

/**
 * Creates a function that maps a sheet row array to an object.
 * @param headers The header row of the sheet.
 */
export function createRowMapper<T extends readonly string[]>(headers: T) {
    const headerMap = new Map(headers.map((h, i) => [h, i]));
    return <U>(row: any[], mapping: Record<keyof U, typeof headers[number]>, numericKeys: (keyof U)[] = []) => {
        const obj: Partial<U> = {};
        for (const key in mapping) {
            const headerName = mapping[key];
            const index = headerMap.get(headerName);
            if (index !== undefined && row[index] !== undefined && row[index] !== null) {
                const value: any = row[index];
                if (numericKeys.includes(key)) {
                    if (value === undefined || value === null || String(value).trim() === "") {
                        (obj as any)[key] = undefined;
                    } else {
                        const numVal = parseFloat(String(value).replace(/,/g, '').replace(/%/, ''));
                        (obj as any)[key] = isNaN(numVal) ? undefined : numVal;
                        if ((obj as any)[key] !== undefined && mapping[key].includes('%')) {
                            (obj as any)[key] = ((obj as any)[key] as number) / 100;
                        }
                    }
                } else {
                    obj[key] = value;
                }
            }
        }
        return obj as U;
    };
}

/**
 * Converts an object to a sheet row array based on column definitions.
 * @param obj The object to convert.
 * @param headers The header row.
 * @param colDefs The column definitions.
 */
export function objectToRow<T extends object>(obj: T, headers: readonly string[], colDefs: Record<string, string>): any[] {
    const row = new Array(headers.length).fill(null);
    const headerMap = new Map(headers.map((h, i) => [h, i]));

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const colName = colDefs[key];
            if (colName) {
                const colIndex = headerMap.get(colName);
                if (colIndex !== undefined) {
                    row[colIndex] = (obj as any)[key];
                }
            }
        }
    }
    return row;
}

/**
 * Gets the ID of a sheet by its name, optionally creating it if it doesn't exist.
 * @param spreadsheetId The ID of the spreadsheet.
 * @param sheetName The name of the sheet.
 * @param create Whether to create the sheet if not found.
 */
export async function getSheetId(spreadsheetId: string, sheetName: string, create = false): Promise<number> {
    await ensureGapi();
    const gapi = (window as any).gapi;
    const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheet = res.result.sheets?.find((s: any) => s.properties.title === sheetName);
    if (!sheet && create) {
        const addSheetRequest = {
            spreadsheetId,
            resource: {
                requests: [{ addSheet: { properties: { title: sheetName } } }]
            }
        };
        const response = await gapi.client.sheets.spreadsheets.batchUpdate(addSheetRequest);
        const newSheetId = response.result.replies[0].addSheet.properties.sheetId;
        return newSheetId;
    }
    return sheet?.properties.sheetId || 0;
}

/**
 * Ensures that the specified sheets exist in the spreadsheet, creating them if necessary.
 * Returns a map of sheet names to their IDs.
 * @param spreadsheetId The ID of the spreadsheet.
 * @param sheetNames The list of sheet names to ensure exist.
 */
export async function ensureSheets(spreadsheetId: string, sheetNames: readonly string[]): Promise<Record<string, number>> {
    await ensureGapi();
    const gapi = (window as any).gapi;
    
    // 1. Fetch existing sheets
    const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = res.result.sheets || [];
    const sheetMap: Record<string, number> = {};
    const missingSheets: string[] = [];

    sheetNames.forEach(name => {
        const match = existingSheets.find((s: any) => s.properties.title === name);
        if (match) {
            sheetMap[name] = match.properties.sheetId;
        } else {
            missingSheets.push(name);
        }
    });

    // 2. Create missing sheets in batch
    if (missingSheets.length > 0) {
        const requests = missingSheets.map(title => ({ addSheet: { properties: { title } } }));
        const batchRes = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
        
        batchRes.result.replies?.forEach((reply: any) => {
             const props = reply.addSheet.properties;
             // We assume the order matches, but we can also trust the title in the response if available
             // (The addSheet response contains the properties of the created sheet)
             sheetMap[props.title] = props.sheetId;
        });
    }
    
    return sheetMap;
}

/**
 * Creates a request object to update the header row of a sheet.
 * @param sheetId The ID of the sheet.
 * @param headers The headers to set.
 */
export function createHeaderUpdateRequest(sheetId: number, headers: Headers) {
    return {
        updateCells: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: headers.map(h => ({ userEnteredValue: { stringValue: h } })) }],
            fields: 'userEnteredValue'
        }
    };
}

/**
 * Fetches data from a sheet range and maps it using the provided rowMapper.
 * @param spreadsheetId The ID of the spreadsheet.
 * @param range The A1 notation of the range to fetch.
 * @param rowMapper The function to map each row array to an object.
 * @param valueRenderOption How values should be rendered in the output.
 */
export async function fetchSheetData<T>(
    spreadsheetId: string,
    range: string,
    rowMapper: (row: any[]) => T,
    valueRenderOption = 'FORMATTED_VALUE'
): Promise<T[]> {
    await ensureGapi();
    const gapi = (window as any).gapi;
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
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
