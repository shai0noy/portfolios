/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGoogleApis } from './gapiLoader';
import { SessionExpiredError } from './errors';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

let gapiInstance: any = null;
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let signInPromise: Promise<void> | null = null;

export async function initializeGapi(): Promise<void> {
    if (gapiInstance) return;
    gapiInstance = await ensureGoogleApis();
    await gapiInstance.client.init({
        discoveryDocs: [
            'https://sheets.googleapis.com/$discovery/rest?version=v4',
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
        ],
    });
}

function storeToken(response: google.accounts.oauth2.TokenResponse) {
    localStorage.setItem('g_access_token', response.access_token!);
    localStorage.setItem('g_expires', (Date.now() + (response.expires_in! - 60) * 1000).toString());
    gapiInstance.client.setToken({ access_token: response.access_token });
    console.log("Token stored and set in gapi client.");
}

function hasValidToken(): boolean {
    const storedToken = localStorage.getItem('g_access_token');
    const storedExpiry = localStorage.getItem('g_expires');
    return !!(storedToken && storedExpiry && Date.now() < parseInt(storedExpiry));
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
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    prompt: 'consent',
                    callback: (response: google.accounts.oauth2.TokenResponse) => {
                        if (response.error) {
                            console.error("Token Client Error:", response);
                            signInPromise = null;
                            return reject(new Error(response.error_description || 'Failed to get token'));
                        }
                        storeToken(response);
                        signInPromise = null;
                        resolve();
                    },
                    error_callback: (error: any) => {
                        console.error("Token Client Error Callback:", error);
                        signInPromise = null;
                        reject(new Error(error.message || 'Google sign-in failed'));
                    },
                });
                tokenClient.requestAccessToken({ prompt: '' });
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
    console.log('User signed out');
    window.location.reload();
}

export const ensureGapi = async (): Promise<any> => {
    await initializeGapi();

    if (hasValidToken()) {
        // Set token if not already set (e.g., after page load)
        if (!gapiInstance.client.getToken()) {
            const storedToken = localStorage.getItem('g_access_token');
            gapiInstance.client.setToken({ access_token: storedToken });
        }
        return gapiInstance;
    }

    console.log('Token missing or expired, attempting silent refresh...');
    return new Promise((resolve, reject) => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            prompt: 'none',
            callback: (response: google.accounts.oauth2.TokenResponse) => {
                if (response.error) {
                    console.warn("Silent refresh failed:", response);
                    return reject(new SessionExpiredError(response.error_description || 'Session Expired'));
                }
                storeToken(response);
                console.log("Silent refresh successful.");
                resolve(gapiInstance);
            },
            error_callback: (error: any) => {
                console.warn("Silent refresh error callback:", error);
                reject(new SessionExpiredError(error.message || 'Session Expired'));
            },
        });
        tokenClient.requestAccessToken({ prompt: 'none' });
    });
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
        throw error; // Re-throw other errors
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
    