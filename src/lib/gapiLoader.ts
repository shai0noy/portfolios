// src/lib/gapiLoader.ts

let gapiScriptLoaded: Promise<void> | null = null;
let gapiClientLoaded: Promise<typeof gapi> | null = null;
let gisLoaded: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if ((existingScript as any).hasLoaded) {
          resolve();
      } else {
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', () => reject(new Error(`Failed to load script ${src}. This could be due to a network issue, a browser extension blocking the script, or incorrect configuration of "Authorized JavaScript origins" in your Google Cloud project.`)));
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (script as any).hasLoaded = true;
      resolve();
    };
    script.onerror = () => {
        reject(new Error(`Failed to load script ${src}. This could be due to a network issue, a browser extension blocking the script, or incorrect configuration of "Authorized JavaScript origins" in your Google Cloud project.`))
    };
    document.body.appendChild(script);
  });
}

async function loadGapiScript(): Promise<void> {
  if (!gapiScriptLoaded) {
    gapiScriptLoaded = loadScript('https://apis.google.com/js/api.js');
  }
  return gapiScriptLoaded;
}

async function loadGapiClient(): Promise<typeof gapi> {
  if (!gapiClientLoaded) {
    await loadGapiScript();
    const gapi = (window as any).gapi;
    if (!gapi) {
      throw new Error('GAPI object not found after script load');
    }
    gapiClientLoaded = new Promise((resolve, reject) => {
      gapi.load('client:picker', {
        callback: () => resolve(gapi),
        onerror: reject,
        timeout: 5000,
        ontimeout: reject,
      });
    });
  }
  return gapiClientLoaded!;
}

export async function loadGis(): Promise<void> {
  if (!gisLoaded) {
    gisLoaded = loadScript('https://accounts.google.com/gsi/client');
  }
  return gisLoaded;
}

export async function ensureGoogleApis(): Promise<typeof gapi> {
  await loadGis(); // Load GIS first, as it's independent
  const gapi = await loadGapiClient();
  return gapi;
}
