/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGoogleApis } from './gapiLoader';
import { SessionExpiredError } from './errors';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let gapiInstance: any = null;

export async function initGoogleClient(): Promise<boolean> {
  try {
    gapiInstance = await ensureGoogleApis();

    await gapiInstance.client.init({
      discoveryDocs: [
        'https://sheets.googleapis.com/$discovery/rest?version=v4',
      ],
    });

    const storedToken = localStorage.getItem('g_access_token');
    const storedExpiry = localStorage.getItem('g_expires');

    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
      console.log('Using stored token');
      gapiInstance.client.setToken({ access_token: storedToken });
      return true;
    }
    // If no valid token, the user needs to sign in.
    return false;
  } catch (e) {
    console.error("Error initializing Google client:", e);
    return false;
  }
}

function storeToken(response: google.accounts.oauth2.TokenResponse) {
    localStorage.setItem('g_access_token', response.access_token!);
    localStorage.setItem('g_expires', (Date.now() + (response.expires_in! - 60) * 1000).toString());
    // Refresh token is not directly exposed for security reasons in this flow
}

export function signIn(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      console.error("VITE_GOOGLE_CLIENT_ID not set");
      return reject(new Error("Google Client ID not configured."));
    }
    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        prompt: 'consent', // Ensure user consents and we get the necessary permissions
        callback: (response: google.accounts.oauth2.TokenResponse) => {
          if (response.error) {
            console.error("Token Client Error:", response);
            return reject(new Error(response.error_description || 'Failed to get token'));
          }
          storeToken(response);
          gapiInstance.client.setToken({ access_token: response.access_token });
          resolve(true);
        },
        error_callback: (error: any) => {
          console.error("Token Client Error Callback:", error);
          reject(new Error(error.message || 'Google sign-in failed'));
        },
      });
      tokenClient.requestAccessToken({ prompt: '' }); // Initial sign-in
    } catch (e) {
      console.error("Error in signIn:", e);
      reject(e);
    }
  });
}

export async function refreshToken(): Promise<boolean> {
    if (!tokenClient) {
        // This should not happen if initGoogleClient was called
        console.error("Token client not initialized");
        return false;
    }
    return new Promise((resolve, reject) => {
        tokenClient!.requestAccessToken({ prompt: 'none' }); // Attempt silent refresh
        // The callback in initTokenClient will handle the response
        // We need a way to know if this specific call succeeded.
        // This is a limitation of the current structure, as the callback is global.
        // For now, we assume it will work if the user hasn't revoked permissions.
        // A more robust solution might involve a separate callback for refresh attempts.
        console.log("Silent refresh requested...");
        // We can't directly know the result of this specific requestAccessToken call here.
        // We'll rely on the next API call to fail if the token wasn't refreshed.
        resolve(true); 
    });
}

export function signOut() {
  localStorage.removeItem('g_access_token');
  localStorage.removeItem('g_expires');
  localStorage.removeItem('g_sheet_id');
  if (gapiInstance) {
    gapiInstance.client.setToken(null);
  }
  const google = (window as any).google;
  if (google && google.accounts && google.accounts.id) {
    // google.accounts.id.disableAutoSelect();
  }
  console.log('User signed out');
  window.location.reload();
}

export const ensureGapi = async () => {
  if (!gapiInstance || !gapiInstance.client) {
    await initGoogleClient();
  }
  const token = localStorage.getItem('g_access_token');
  const expiry = localStorage.getItem('g_expires');
  if (!token || !expiry || Date.now() >= parseInt(expiry)) {
    console.log('Token missing or expired, attempting silent refresh...');
    await new Promise<void>((resolve, reject) => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            prompt: 'none',
            callback: (response: google.accounts.oauth2.TokenResponse) => {
              if (response.error) {
                console.warn("Silent refresh failed:", response);
                reject(new SessionExpiredError(response.error_description || 'Session Expired'));
                return;
              }
              storeToken(response);
              gapiInstance.client.setToken({ access_token: response.access_token });
              console.log("Silent refresh successful.");
              resolve();
            },
            error_callback: (error: any) => {
              console.warn("Silent refresh error callback:", error);
              reject(new SessionExpiredError(error.message || 'Session Expired'));
            },
          });
          tokenClient.requestAccessToken({ prompt: 'none' });
    });
  }
  return gapiInstance;
};

export async function checkSheetExists(spreadsheetId: string): Promise<boolean> {
  await ensureGapi();
  try {
    await gapiInstance.client.sheets.spreadsheets.get({
      spreadsheetId,
    });
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      console.warn(`Sheet with ID ${spreadsheetId} not found.`);
      return false;
    }
    console.error("Error checking sheet existence:", error);
    throw error; // Re-throw other errors
  }
}