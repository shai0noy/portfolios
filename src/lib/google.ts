const CLIENT_ID = '557677701112-n7rlmpq9q5k5n5kmrtcr35j72bema1uo.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const DISCOVERY_DOCS = [
  "https://sheets.googleapis.com/$discovery/rest?version=v4",
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"
];

let tokenClient: any;

const loadScript = (src: string) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true);
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

export const initGoogleClient = async () => {
  await loadScript('https://apis.google.com/js/api.js');
  await loadScript('https://accounts.google.com/gsi/client');

  return new Promise<boolean>((resolve, reject) => {
    window.gapi.load('client', async () => {
      try {
        await window.gapi.client.init({
          discoveryDocs: DISCOVERY_DOCS,
        });
        
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              // SAVE SESSION ON SUCCESSFUL LOGIN
              const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);
              localStorage.setItem('g_token', tokenResponse.access_token);
              localStorage.setItem('g_expires', expiresAt.toString());
              
              window.gapi.client.setToken(tokenResponse);
            }
          },
        });
        
        // CHECK FOR SAVED SESSION
        const savedToken = localStorage.getItem('g_token');
        const savedExpiry = localStorage.getItem('g_expires');
        
        if (savedToken && savedExpiry && Date.now() < parseInt(savedExpiry)) {
          window.gapi.client.setToken({ access_token: savedToken });
          resolve(true); // Return true if restored
        } else {
          resolve(false); // No valid session
        }

      } catch (e) {
        reject(e);
      }
    });
  });
};

export const signIn = () => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Google Client not initialized"));
    
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        reject(resp);
      } else {
        // Saving handled in initTokenClient callback above or here
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
    // CLEAR STORAGE
    localStorage.removeItem('g_token');
    localStorage.removeItem('g_expires');
    localStorage.removeItem('g_sheet_id'); // We will save this in Login.tsx
  }
};

// ... (getSpreadsheet and createSpreadsheet remain exactly the same) ...
export const getSpreadsheet = async () => {
  try {
    const response = await window.gapi.client.drive.files.list({
      q: "name = 'Portfolios_App_Data' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id, name)',
    });
    const files = response.result.files;
    if (files && files.length > 0) return files[0].id;
    return null;
  } catch (e) {
    console.error("Error searching for sheet", e);
    throw e;
  }
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