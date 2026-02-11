"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeSheetString = void 0;
exports.createRowMapper = createRowMapper;
exports.objectToRow = objectToRow;
exports.getSheetId = getSheetId;
exports.ensureSheets = ensureSheets;
exports.createHeaderUpdateRequest = createHeaderUpdateRequest;
exports.fetchSheetData = fetchSheetData;
/* eslint-disable @typescript-eslint/no-explicit-any */
const google_1 = require("../google");
/**
 * Creates a function that maps a sheet row array to an object.
 * @param headers The header row of the sheet.
 */
function createRowMapper(headers) {
    const headerMap = new Map(headers.map((h, i) => [h, i]));
    return (row, mapping, numericKeys = []) => {
        const obj = {};
        for (const key in mapping) {
            const headerName = mapping[key];
            const index = headerMap.get(headerName);
            if (index !== undefined && row[index] !== undefined && row[index] !== null) {
                const value = row[index];
                if (numericKeys.includes(key)) {
                    if (value === undefined || value === null || String(value).trim() === "") {
                        obj[key] = undefined;
                    }
                    else {
                        const numVal = parseFloat(String(value).replace(/,/g, '').replace(/%/, ''));
                        obj[key] = isNaN(numVal) ? undefined : numVal;
                        if (obj[key] !== undefined && mapping[key].includes('%')) {
                            obj[key] = obj[key] / 100;
                        }
                    }
                }
                else {
                    obj[key] = value;
                }
            }
        }
        return obj;
    };
}
/**
 * Converts an object to a sheet row array based on column definitions.
 * @param obj The object to convert.
 * @param headers The header row.
 * @param colDefs The column definitions.
 */
function objectToRow(obj, headers, colDefs) {
    const row = new Array(headers.length).fill(null);
    const headerMap = new Map(headers.map((h, i) => [h, i]));
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const colName = colDefs[key];
            if (colName) {
                const colIndex = headerMap.get(colName);
                if (colIndex !== undefined) {
                    row[colIndex] = obj[key];
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
async function getSheetId(spreadsheetId, sheetName, create = false) {
    await (0, google_1.ensureGapi)();
    const gapi = window.gapi;
    const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheet = res.result.sheets?.find((s) => s.properties.title === sheetName);
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
async function ensureSheets(spreadsheetId, sheetNames) {
    await (0, google_1.ensureGapi)();
    const gapi = window.gapi;
    // 1. Fetch existing sheets
    const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = res.result.sheets || [];
    const sheetMap = {};
    const missingSheets = [];
    sheetNames.forEach(name => {
        const match = existingSheets.find((s) => s.properties.title === name);
        if (match) {
            sheetMap[name] = match.properties.sheetId;
        }
        else {
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
        batchRes.result.replies?.forEach((reply) => {
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
function createHeaderUpdateRequest(sheetId, headers) {
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
async function fetchSheetData(spreadsheetId, range, rowMapper, valueRenderOption = 'FORMATTED_VALUE') {
    await (0, google_1.ensureGapi)();
    const gapi = window.gapi;
    try {
        const res = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
            valueRenderOption,
        });
        const rows = res.result.values || [];
        return rows.map(rowMapper).filter(Boolean);
    }
    catch (error) {
        console.error("Error fetching from range " + range + ":", error);
        throw error; // Re-throw the error to be handled by the caller
    }
}
/**
 * Escapes a string for use in a Google Sheets formula by doubling up double quotes.
 * @param str The string to escape.
 * @returns The escaped string, or an empty string if the input is null or undefined.
 */
const escapeSheetString = (str) => {
    if (!str)
        return "";
    return str.replace(/"/g, '""');
};
exports.escapeSheetString = escapeSheetString;
