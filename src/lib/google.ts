// src/lib/google.ts
const CLIENT_ID = '557677701112-n7rlmpq9q5k5n5kmrtcr35j72bema1uo.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const DISCOVERY_DOCS = [
  "https://sheets.googleapis.com/$discovery/rest?version=v4",
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
];

let tokenClient: any;

/**
 * Robust script loader that ensures gapi is actually on the window
 */
const loadScript = (src: string, globalVar: string) => {
  return new Promise((resolve, reject) => {
    // If already loaded and variable exists
    if ((window as any)[globalVar]) {
      resolve(true);
      return;
    }
    
    // Check if script tag exists but hasn't finished
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
};

// Create a persistent promise that resolves when GAPI is ready
let gapiReadyPromise: Promise<void> | null = null;

export const initGoogleClient = async () => {
  // If already initializing, return the existing promise
  if (gapiReadyPromise) return gapiReadyPromise;

  gapiReadyPromise = new Promise<void>(async (resolve, reject) => {
    try {
      await loadScript('https://apis.google.com/js/api.js', 'gapi');
      await loadScript('https://accounts.google.com/gsi/client', 'google');

      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
          
          tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse: any) => {
              if (tokenResponse && tokenResponse.access_token) {
                const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
                localStorage.setItem('g_token', tokenResponse.access_token);
                localStorage.setItem('g_expires', expiresAt.toString());
                window.gapi.client.setToken(tokenResponse);
              }
            },
          });

          // Check for existing session
          const savedToken = localStorage.getItem('g_token');
          const savedExpiry = localStorage.getItem('g_expires');
          if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry)) {
            window.gapi.client.setToken({ access_token: savedToken });
          }
          
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });

  return gapiReadyPromise;
};

// Helper to ensure GAPI is ready before use
export const ensureGapi = async () => {
  if (!window.gapi || !window.gapi.client) {
    await initGoogleClient();
  }
};


export const signIn = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Google Client not initialized"));
    tokenClient.callback = (resp: any) => {
      if (resp.error) reject(resp);
      else {
        const expiresAt = Date.now() + (resp.expires_in * 1000);
        localStorage.setItem('g_token', resp.access_token);
        localStorage.setItem('g_expires', expiresAt.toString());
        window.gapi.client.setToken(resp);
        resolve(resp);
      }
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

export const signOut = () => {
  const token = window.gapi.client.getToken();
  if (token !== null) {
    window.google.accounts.oauth2.revoke(token.access_token, () => {});
    window.gapi.client.setToken(null);
    localStorage.removeItem('g_token');
    localStorage.removeItem('g_expires');
    localStorage.removeItem('g_sheet_id');
  }
};

export const getSpreadsheet = async () => {
  const response = await window.gapi.client.drive.files.list({
    q: "name = 'Portfolios_App_Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id, name)',
  });
  const files = response.result.files;
  if (files && files.length > 0) return files[0].id;
  return null;
};

export const createSpreadsheet = async () => {
  const response = await window.gapi.client.sheets.spreadsheets.create({
    properties: { title: 'Portfolios_App_Data' },
    sheets: [
      { properties: { title: 'Portfolio_Options' } },
      { properties: { title: 'Transaction_Log' } },
      { properties: { title: 'Dashboard' } }
    ]
  });
  const id = response.result.spreadsheetId;
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: 'Portfolio_Options!A1',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [['ID', 'Name', 'Currency', 'Type']] }
  });
  return id;
};