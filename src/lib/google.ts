/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGoogleApis } from './gapiLoader';
import { SessionExpiredError } from './errors';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';

let gapiInstance: typeof gapi | null = null;
let signInPromise: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;

export async function initializeGapi(): Promise<typeof gapi> {
    if (gapiInstance) return gapiInstance;
    gapiInstance = await ensureGoogleApis();
    await gapiInstance.client.init({
        discoveryDocs: [
            'https://sheets.googleapis.com/$discovery/rest?version=v4',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
        ],
    });
    return gapiInstance;
}

function storeToken(response: any) {
    if (!response.access_token) return;
    localStorage.setItem('g_access_token', response.access_token);
    // expires_in is in seconds
    const expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
    localStorage.setItem('g_expires', expiresAt.toString());
    gapiInstance!.client.setToken({ access_token: response.access_token });
    console.log("Token refreshed and stored.");
}

export function hasValidToken(): boolean {
    const storedToken = localStorage.getItem('g_access_token');
    const storedExpiry = localStorage.getItem('g_expires');
    return !!(storedToken && storedExpiry && Date.now() < parseInt(storedExpiry));
}

async function refreshAccessToken(): Promise<void> {
    try {
        const res = await fetch(`${WORKER_URL}/auth/token`);
        if (!res.ok) {
            if (res.status === 401) throw new SessionExpiredError("Session expired");
            throw new Error("Failed to refresh token");
        }
        const data = await res.json();
        storeToken(data);
    } catch (e) {
        console.error("Refresh failed:", e);
        throw e;
    }
}

export function signIn(): Promise<void> {
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
                    callback: async (response: any) => {
                        if (response.code) {
                            try {
                                const res = await fetch(`${WORKER_URL}/auth/google`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code: response.code })
                                });
                                
                                if (!res.ok) {
                                    const err = await res.json();
                                    throw new Error(err.error || 'Failed to exchange code');
                                }
                                
                                // After cookie is set, get the access token
                                await refreshAccessToken();
                                resolve();
                            } catch (err) {
                                console.error("Auth exchange failed:", err);
                                reject(err);
                            } finally {
                                signInPromise = null;
                            }
                        } else {
                            signInPromise = null;
                            reject(new Error(response.error_description || 'Login failed'));
                        }
                    },
                });
                client.requestCode();
            } catch (e) {
                console.error("Error in signIn:", e);
                signInPromise = null;
                reject(e);
            }
        });
    }
    return signInPromise;
}

export function signOut() {
    localStorage.removeItem('g_access_token');
    localStorage.removeItem('g_expires');
    localStorage.removeItem('g_sheet_id');
    if (gapiInstance) {
        gapiInstance.client.setToken(null);
    }
    // Also hit worker to clear cookie? (Optional but good practice)
    console.log('User signed out');
    window.location.reload();
}

export const ensureGapi = async (): Promise<typeof gapi> => {
    await initializeGapi();

    if (hasValidToken()) {
        if (!gapiInstance!.client.getToken()) {
            const storedToken = localStorage.getItem('g_access_token');
            gapiInstance!.client.setToken({ access_token: storedToken! });
        }
        return gapiInstance!;
    }

    console.log('Token missing or expired, attempting refresh via worker...');

    if (refreshPromise) {
        await refreshPromise;
        return gapiInstance!;
    }

    refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    
    try {
        await refreshPromise;
        return gapiInstance!;
    } catch (error) {
        if (error instanceof SessionExpiredError) {
            console.log("Session expired, requires user interaction.");
            throw error;
        } else {
            console.error("Unhandled error during token refresh:", error);
            throw new SessionExpiredError("Session expired");
        }
    }
};

export async function checkSheetExists(spreadsheetId: string): Promise<boolean> {
    try {
        const gapi = await ensureGapi();
        await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
        });
        return true;
    } catch (error: any) {
        if (error instanceof SessionExpiredError) throw error;
        if (error.status === 404) {
            console.warn(`Sheet with ID ${spreadsheetId} not found.`);
            return false;
        }
        console.error("Error checking sheet existence:", error);
        throw error;
    }
}

export async function findSpreadsheetByName(fileName: string): Promise<string | null> {
    try {
        const gapi = await ensureGapi();
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
        } else {
            console.log(`No file named '${fileName}' found.`);
            return null;
        }
    } catch (error) {
        if (error instanceof SessionExpiredError) throw error;
        console.error("Error searching for spreadsheet:", error);
        return null;
    }
}
