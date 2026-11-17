/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGoogleApis } from './gapiLoader';
import { SessionExpiredError } from './errors';

const WORKER_URL = (import.meta as any).env?.VITE_WORKER_URL || 'https://portfolios.noy-shai.workers.dev';

let gapiInstance: typeof gapi | null = null;
let refreshPromise: Promise<void> | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let initPromise: Promise<typeof gapi> | null = null;
let pendingOAuthError: string | null = null;

function decodeBase64UrlJson(input: string): any {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
}

function consumeRedirectAuthFromHash() {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!rawHash) return;

    const params = new URLSearchParams(rawHash);
    const callbackData = params.get('oauth_callback');
    const oauthError = params.get('oauth_error');

    if (!callbackData && !oauthError) return;

    if (callbackData) {
        try {
            const data = decodeBase64UrlJson(callbackData);
            if (data?.access_token) {
                const expiresIn = Number(data.expires_in) || 3600;
                const expiresAt = Date.now() + (expiresIn - 60) * 1000;
                localStorage.setItem('g_access_token', data.access_token);
                localStorage.setItem('g_expires', expiresAt.toString());
            }
            if (data?.session_token) {
                localStorage.setItem('g_session_token', data.session_token);
            }
        } catch (e) {
            console.error('Failed to parse OAuth callback payload:', e);
            pendingOAuthError = 'Failed to complete Google sign-in response.';
        }
    } else if (oauthError) {
        pendingOAuthError = oauthError;
    }

    // Clean OAuth parameters from URL hash without triggering navigation
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// Immediately process redirect callback tokens before React mounts
consumeRedirectAuthFromHash();

export function consumePendingOAuthError(): string | null {
    const err = pendingOAuthError;
    pendingOAuthError = null;
    return err;
}

export function getSessionToken(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('g_session_token') : null;
}

export async function initializeGapi(): Promise<typeof gapi> {
    if (gapiInstance) return gapiInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const gapi = await ensureGoogleApis();

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

function scheduleRefresh(expiresInSeconds: number) {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    // Refresh 5 minutes before expiry
    const refreshBuffer = 5 * 60; 
    let delayMs = (expiresInSeconds - refreshBuffer) * 1000;
    if (delayMs < 0) delayMs = 0; // Refresh immediately if buffer exceeded

    console.debug(`Scheduling background token refresh in ${Math.round(delayMs/1000)}s`);
    refreshTimeout = setTimeout(() => {
        console.debug("Triggering background token refresh...");
        refreshAccessToken().catch(e => console.warn("Background refresh failed", e));
    }, delayMs);
}

function storeToken(response: any) {
    if (response.session_token) {
        localStorage.setItem('g_session_token', response.session_token);
    }
    if (!response.access_token) return;
    localStorage.setItem('g_access_token', response.access_token);
    // expires_in is in seconds
    const expiresIn = Number(response.expires_in) || 3600;
    const expiresAt = Date.now() + (expiresIn - 60) * 1000;
    localStorage.setItem('g_expires', expiresAt.toString());
    if (gapiInstance) {
        gapiInstance.client.setToken({ access_token: response.access_token });
    }
    console.debug("Token refreshed and stored.");
    
    scheduleRefresh(expiresIn);
}

export function hasValidToken(): boolean {
    const storedToken = localStorage.getItem('g_access_token');
    const storedExpiry = localStorage.getItem('g_expires');
    return !!(storedToken && storedExpiry && Date.now() < parseInt(storedExpiry));
}

async function refreshAccessToken(): Promise<void> {
    try {
        const sessionToken = getSessionToken();
        const headers: Record<string, string> = {};
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }

        const res = await fetch(`${WORKER_URL}/auth/token`, {
            credentials: 'include',
            headers,
        });
        if (!res.ok) {
            if (res.status === 401 || res.status === 400) {
                localStorage.removeItem('g_session_token');
                throw new SessionExpiredError("Session expired");
            }
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
    const returnUrl = new URL(window.location.href);
    returnUrl.hash = '';
    const loginUrl = `${WORKER_URL}/auth/login?returnTo=${encodeURIComponent(returnUrl.toString())}`;
    window.location.assign(loginUrl);
    // Keep promise pending while browser navigates to Google OAuth
    return new Promise(() => {});
}

export function signOut() {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = null;
    localStorage.removeItem('g_access_token');
    localStorage.removeItem('g_expires');
    localStorage.removeItem('g_session_token');
    localStorage.removeItem('g_sheet_id');
    if (gapiInstance) {
        gapiInstance.client.setToken(null);
    }
    console.debug('User signed out');
    window.location.reload();
}

export const ensureGapi = async (): Promise<typeof gapi> => {
    await initializeGapi();

    if (hasValidToken()) {
        if (!gapiInstance!.client.getToken()) {
            const storedToken = localStorage.getItem('g_access_token');
            gapiInstance!.client.setToken({ access_token: storedToken! });
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
                 
                 console.debug(`Restoring background refresh schedule. Refresh in ${Math.round(delayMs/1000)}s`);
                 refreshTimeout = setTimeout(() => {
                    console.debug("Triggering restored background token refresh...");
                    refreshAccessToken().catch(e => console.warn("Background refresh failed", e));
                 }, delayMs);
             }
        }

        return gapiInstance!;
    }

    console.debug('Token missing or expired, attempting refresh via worker...');

    if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    }
    
    try {
        await refreshPromise;
        return gapiInstance!;
    } catch (error) {
        if (error instanceof SessionExpiredError) {
            console.debug("Session expired, requires user interaction.");
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
            console.debug(`Found ${files.length} files with name ${fileName}. Taking the first one.`);
            if (!files[0].id) {
                console.error("File ID missing for the found spreadsheet.");
                return null;
            }
            return files[0].id;
        } else {
            console.debug(`No file named '${fileName}' found.`);
            return null;
        }
    } catch (error) {
        if (error instanceof SessionExpiredError) throw error;
        console.error("Error searching for spreadsheet:", error);
        return null;
    }
}
