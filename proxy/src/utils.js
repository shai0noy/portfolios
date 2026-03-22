export const VALID_VALUE_REGEX = /^[a-zA-Z0-9\u05D0-\u05EA,.:\-^ /_=]+$/;

export function replacePlaceholder(urlString, key, value) {
  return urlString
    .replaceAll(`{raw:${key}}`, () => value)
    .replaceAll(`{${key}}`, encodeURIComponent(value));
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export function getTaseFetchDate(params) {
  if (params.get('taseFetchDate')) {
    return new Date(params.get('taseFetchDate'));
  }
  const taseFetchDate = new Date();
  const daysToSubtract = taseFetchDate.getDay() === 0 ? 2 : 1;
  const adjustedDate = new Date(taseFetchDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  params.set('taseFetchDate', formatDate(adjustedDate));
  return adjustedDate;
}

export function configurePensyanetOptions(apiId, params, fetchOpts) {
  fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
  let startYear = params.get('startYear');
  let startMonth = params.get('startMonth');
  let endYear = params.get('endYear');
  let endMonth = params.get('endMonth');

  if (!startYear || !startMonth || !endYear || !endMonth) {
    throw new Error(`Missing required parameters for ${apiId}: startYear, startMonth, endYear, endMonth`);
  }

  const isList = apiId === 'pensyanet_list';

  if (isList) {
    const today = new Date();
    const limitDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const requestedEndDate = new Date(parseInt(endYear, 10), parseInt(endMonth, 10) - 1, 1);

    if (requestedEndDate > limitDate) {
      endYear = limitDate.getFullYear().toString();
      endMonth = String(limitDate.getMonth() + 1).padStart(2, '0');
    }
  }

  const startDateObj = new Date(parseInt(startYear, 10), parseInt(startMonth, 10) - 1, 1);
  const endDateObj = new Date(parseInt(endYear, 10), parseInt(endMonth, 10) - 1, 1);

  if (startDateObj > endDateObj) {
    startYear = endYear;
    startMonth = endMonth;
  }

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  const fundId = params.get('fundId');

  if (!isList && !fundId) {
    throw new Error("Missing required parameter for pensyanet_fund: fundId");
  }

  const vmObject = {
    "ParametersTab": 0,
    "BasicSearchVM": {
      "SelectedFunds": isList ? [{ "FundID": 0, "IsGroup": true }] : [{ "FundID": parseInt(fundId, 10), "IsGroup": false }],
      "SimpleSearchReportType": 1
    },
    "XmlExportVM": { "SelectedMainReportType": 1001, "SelectedReportType": isList ? "1" : "3" },
    "ReportStartDate": `${startDate}T00:00:00.000Z`,
    "ReportEndDate": `${endDate}T00:00:00.000Z`
  };
  fetchOpts.body = `vm=${encodeURIComponent(JSON.stringify(vmObject))}`;
}

export function addApiSpecificHeaders(apiId, env, fetchOpts) {
  if (apiId.startsWith('tase')) {
    fetchOpts.headers["apiKey"] = env.TASE_API_KEY;
  } else if (apiId === 'cbs_price_index') {
    fetchOpts.headers["Referer"] = "https://www.cbs.gov.il/";
  } else if (apiId.startsWith("globes")) {
    fetchOpts.headers["Referer"] = "https://www.globes.co.il/";
  } else if (apiId.startsWith("yahoo")) {
    fetchOpts.headers["Referer"] = "https://finance.yahoo.com/";
  } else if (apiId.startsWith("pensyanet")) {
    fetchOpts.headers["Referer"] = "https://pensyanet.cma.gov.il/";
  }
}

export async function hashEmail(email) {
  const msgUint8 = new TextEncoder().encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function encryptData(data, secretKey) {
  const encoder = new TextEncoder();
  // Ensure key is 32 bytes for AES-GCM or derive it like inside
  // For simplicity and speed in Workers, if secretKey is long enough, just import it
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey.padEnd(32, ' ').slice(0, 32)), // 256-bit key
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = encoder.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode.apply(null, combined));
}

export async function decryptData(encryptedBase64, secretKey) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const combined = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey.padEnd(32, ' ').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return JSON.parse(decoder.decode(decrypted));
}

