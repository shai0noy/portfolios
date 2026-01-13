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
                    const numVal = parseFloat(String(value).replace(/,/g, '').replace(/%/, ''));
                    (obj as any)[key] = isNaN(numVal) ? 0 : numVal;
                    if (mapping[key].includes('%')) (obj as any)[key] = ((obj as any)[key] as number) / 100;
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
