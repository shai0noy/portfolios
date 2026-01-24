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
        return;
      }

      const handleLoad = () => {
        (existingScript as any).hasLoaded = true;
        resolve();
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };

      const handleError = () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
        const hasReloaded = sessionStorage.getItem('reloaded');
        if (!hasReloaded) {
          sessionStorage.setItem('reloaded', 'true');
          location.reload();
        } else {
          reject(new Error(`Failed to load script ${src} after reloading.`));
        }
      };

      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;

    const handleLoad = () => {
      (script as any).hasLoaded = true;
      sessionStorage.removeItem('reloaded');
      resolve();
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    const handleError = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      const hasReloaded = sessionStorage.getItem('reloaded');
      if (!hasReloaded) {
        sessionStorage.setItem('reloaded', 'true');
        location.reload();
      } else {
        reject(new Error(`Failed to load script ${src} after reloading.`));
      }
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

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
