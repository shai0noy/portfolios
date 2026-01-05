// src/lib/gapiLoader.ts

let gapiScriptLoaded: Promise<void> | null = null;
let gapiClientLoaded: Promise<any> | null = null;
let gisLoaded: Promise<void> | null = null;
let pickerLoaded: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if ((existingScript as any).hasLoaded) {
          resolve();
      } else {
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', (e) => reject(new Error(`Failed to load script ${src}: ${e}`)));
      }
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      (script as any).hasLoaded = true;
      resolve();
    };
    script.onerror = (e) => reject(new Error(`Failed to load script ${src}: ${e}`));
    document.body.appendChild(script);
  });
}

async function loadGapiScript(): Promise<void> {
  if (!gapiScriptLoaded) {
    gapiScriptLoaded = loadScript('https://apis.google.com/js/api.js');
  }
  return gapiScriptLoaded;
}

async function loadGapiClient(): Promise<any> {
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
  return gapiClientLoaded;
}

export async function loadGis(): Promise<void> {
  if (!gisLoaded) {
    gisLoaded = loadScript('https://accounts.google.com/gsi/client');
  }
  return gisLoaded;
}

export async function ensureGoogleApis(): Promise<any> {
  await loadGis(); // Load GIS first, as it's independent
  const gapi = await loadGapiClient();
  return gapi;
}
