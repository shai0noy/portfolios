"use strict";
// src/lib/gapiLoader.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGis = loadGis;
exports.ensureGoogleApis = ensureGoogleApis;
let gapiScriptLoaded = null;
let gapiClientLoaded = null;
let gisLoaded = null;
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (src.includes('api.js') && typeof gapi !== 'undefined') {
            return resolve();
        }
        if (src.includes('gsi/client') && window.google?.accounts) {
            return resolve();
        }
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            if (existingScript.hasLoaded) {
                resolve();
                return;
            }
            const handleLoad = () => {
                existingScript.hasLoaded = true;
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
                }
                else {
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
            script.hasLoaded = true;
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
            }
            else {
                reject(new Error(`Failed to load script ${src} after reloading.`));
            }
        };
        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
        document.body.appendChild(script);
    });
}
async function loadGapiScript() {
    if (typeof gapi !== 'undefined')
        return;
    if (!gapiScriptLoaded) {
        gapiScriptLoaded = loadScript('https://apis.google.com/js/api.js');
    }
    return gapiScriptLoaded;
}
async function loadGapiClient() {
    if (gapiClientLoaded)
        return gapiClientLoaded;
    gapiClientLoaded = (async () => {
        await loadGapiScript();
        const gapiObj = window.gapi;
        if (!gapiObj)
            throw new Error('GAPI object not found after script load');
        if (gapiObj.client)
            return gapiObj;
        return new Promise((resolve) => {
            gapiObj.load('client:picker', () => resolve(gapiObj));
        });
    })();
    return gapiClientLoaded;
}
async function loadGis() {
    if (!gisLoaded) {
        gisLoaded = loadScript('https://accounts.google.com/gsi/client');
    }
    return gisLoaded;
}
async function ensureGoogleApis() {
    await loadGis(); // Load GIS first, as it's independent
    const gapi = await loadGapiClient();
    return gapi;
}
