"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGapi = void 0;
exports.initializeGapi = initializeGapi;
exports.hasValidToken = hasValidToken;
exports.signIn = signIn;
exports.signOut = signOut;
exports.checkSheetExists = checkSheetExists;
exports.findSpreadsheetByName = findSpreadsheetByName;
/* eslint-disable @typescript-eslint/no-explicit-any */
const gapiLoader_1 = require("./gapiLoader");
const errors_1 = require("./errors");
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
let gapiInstance = null;
let signInPromise = null;
let refreshPromise = null;
let refreshTimeout = null;
let initPromise = null;
async function initializeGapi() {
    if (gapiInstance)
        return gapiInstance;
    if (initPromise)
        return initPromise;
    initPromise = (async () => {
        const gapi = await (0, gapiLoader_1.ensureGoogleApis)();
        await gapi.client.init({
            discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            ],
        });
        gapiInstance = gapi;
        return gapi;
    })();
    return initPromise.catch(err => {
        initPromise = null;
        throw err;
    });
}
function scheduleRefresh(expiresInSeconds) {
    if (refreshTimeout)
        clearTimeout(refreshTimeout);
    // Refresh 5 minutes before expiry
    const refreshBuffer = 5 * 60;
    let delayMs = (expiresInSeconds - refreshBuffer) * 1000;
    if (delayMs < 0)
        delayMs = 0; // Refresh immediately if buffer exceeded
    console.log(`Scheduling background token refresh in ${Math.round(delayMs / 1000)}s`);
    refreshTimeout = setTimeout(() => {
        console.log("Triggering background token refresh...");
        refreshAccessToken().catch(e => console.warn("Background refresh failed", e));
    }, delayMs);
}
function storeToken(response) {
    if (!response.access_token)
        return;
    localStorage.setItem('g_access_token', response.access_token);
    // expires_in is in seconds
    const expiresIn = Number(response.expires_in);
    const expiresAt = Date.now() + (expiresIn - 60) * 1000;
    localStorage.setItem('g_expires', expiresAt.toString());
    gapiInstance.client.setToken({ access_token: response.access_token });
    console.log("Token refreshed and stored.");
    scheduleRefresh(expiresIn);
}
function hasValidToken() {
    const storedToken = localStorage.getItem('g_access_token');
    const storedExpiry = localStorage.getItem('g_expires');
    return !!(storedToken && storedExpiry && Date.now() < parseInt(storedExpiry));
}
async function refreshAccessToken() {
    try {
        const res = await fetch(`${WORKER_URL}/auth/token`, { credentials: 'include' });
        if (!res.ok) {
            if (res.status === 401)
                throw new errors_1.SessionExpiredError("Session expired");
            throw new Error("Failed to refresh token");
        }
        const data = await res.json();
        storeToken(data);
    }
    catch (e) {
        console.error("Refresh failed:", e);
        throw e;
    }
}
function signIn() {
    if (!signInPromise) {
        signInPromise = new Promise(async (resolve, reject) => {
            if (!CLIENT_ID) {
                console.error("VITE_GOOGLE_CLIENT_ID not set");
                return reject(new Error("Google Client ID not configured."));
            }
            try {
                await initializeGapi();
                const client = google.accounts.oauth2.initCodeClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    ux_mode: 'popup',
                    callback: async (response) => {
                        if (response.code) {
                            try {
                                const res = await fetch(`${WORKER_URL}/auth/google`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code: response.code }),
                                    credentials: 'include'
                                });
                                if (!res.ok) {
                                    const err = await res.json();
                                    throw new Error(err.error || 'Failed to exchange code');
                                }
                                // After cookie is set, get the access token
                                await refreshAccessToken();
                                resolve();
                            }
                            catch (err) {
                                console.error("Auth exchange failed:", err);
                                reject(err);
                            }
                            finally {
                                signInPromise = null;
                            }
                        }
                        else {
                            signInPromise = null;
                            reject(new Error(response.error_description || 'Login failed'));
                        }
                    },
                });
                client.requestCode();
            }
            catch (e) {
                console.error("Error in signIn:", e);
                signInPromise = null;
                reject(e);
            }
        });
    }
    return signInPromise;
}
function signOut() {
    if (refreshTimeout)
        clearTimeout(refreshTimeout);
    refreshTimeout = null;
    localStorage.removeItem('g_access_token');
    localStorage.removeItem('g_expires');
    localStorage.removeItem('g_sheet_id');
    if (gapiInstance) {
        gapiInstance.client.setToken(null);
    }
    console.log('User signed out');
    window.location.reload();
}
const ensureGapi = async () => {
    await initializeGapi();
    if (hasValidToken()) {
        if (!gapiInstance.client.getToken()) {
            const storedToken = localStorage.getItem('g_access_token');
            gapiInstance.client.setToken({ access_token: storedToken });
        }
        // Ensure background refresh is scheduled on load
        if (!refreshTimeout) {
            const storedExpiry = localStorage.getItem('g_expires');
            if (storedExpiry) {
                const now = Date.now();
                const validUntil = parseInt(storedExpiry);
                // We added -60s buffer in storeToken.
                // Real expiry ~= validUntil + 60s.
                // We want to refresh 5 mins (300s) before REAL expiry.
                // So target time = validUntil + 60s - 300s = validUntil - 240s.
                const msUntilRefresh = (validUntil - 240000) - now;
                // If less than 0, refresh immediately.
                const delayMs = Math.max(0, msUntilRefresh);
                console.log(`Restoring background refresh schedule. Refresh in ${Math.round(delayMs / 1000)}s`);
                refreshTimeout = setTimeout(() => {
                    console.log("Triggering restored background token refresh...");
                    refreshAccessToken().catch(e => console.warn("Background refresh failed", e));
                }, delayMs);
            }
        }
        return gapiInstance;
    }
    console.log('Token missing or expired, attempting refresh via worker...');
    if (refreshPromise) {
        await refreshPromise;
        return gapiInstance;
    }
    refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    try {
        await refreshPromise;
        return gapiInstance;
    }
    catch (error) {
        if (error instanceof errors_1.SessionExpiredError) {
            console.log("Session expired, requires user interaction.");
            throw error;
        }
        else {
            console.error("Unhandled error during token refresh:", error);
            throw new errors_1.SessionExpiredError("Session expired");
        }
    }
};
exports.ensureGapi = ensureGapi;
async function checkSheetExists(spreadsheetId) {
    try {
        const gapi = await (0, exports.ensureGapi)();
        await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
        });
        return true;
    }
    catch (error) {
        if (error instanceof errors_1.SessionExpiredError)
            throw error;
        if (error.status === 404) {
            console.warn(`Sheet with ID ${spreadsheetId} not found.`);
            return false;
        }
        console.error("Error checking sheet existence:", error);
        throw error;
    }
}
async function findSpreadsheetByName(fileName) {
    try {
        const gapi = await (0, exports.ensureGapi)();
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}' and 'me' in owners and trashed=false`,
            spaces: 'drive',
            fields: 'files(id, name)',
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            console.log(`Found ${files.length} files with name ${fileName}. Taking the first one.`);
            if (!files[0].id) {
                console.error("File ID missing for the found spreadsheet.");
                return null;
            }
            return files[0].id;
        }
        else {
            console.log(`No file named '${fileName}' found.`);
            return null;
        }
    }
    catch (error) {
        if (error instanceof errors_1.SessionExpiredError)
            throw error;
        console.error("Error searching for spreadsheet:", error);
        return null;
    }
}
