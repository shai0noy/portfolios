const API_MAP = {
  "yahoo_hist": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range={range}&events=split,div",
  "globes_data": "https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange={exchange}&symbol={ticker}",
  "globes_list": "https://www.globes.co.il/data/webservices/financial.asmx/listByType?exchange={exchange}&type={type}",
  "globes_exchange_state": "https://www.globes.co.il/data/webservices/financial.asmx/ExchangeState?exchange={exchange}",
  "globes_get_exchanges": "https://www.globes.co.il/data/webservices/financial.asmx/getExchange",
  "globes_get_exchanges_details": "https://www.globes.co.il/data/webservices/financial.asmx/GetExchangesDetails",
  "globes_articles": "https://www.globes.co.il/data/webservices/financial.asmx/getArticles?symbol={ticker}&exchange={exchange}&daysBefore=60&page=0&language=&quid=",
  "cbs_price_index": "https://api.cbs.gov.il/index/data/price?id={id}&format=json&download=false&PageSize=1000&page={page}",
  "tase_list_stocks": "https://datawise.tase.co.il/v1/basic-securities/trade-securities-list/{raw:taseFetchDate}",
  "tase_list_funds": "https://datawise.tase.co.il/v1/fund/fund-list?listingStatusId=1",
  "tase_list_indices": "https://datawise.tase.co.il/v1/basic-indices/indices-list",
  "tase_index_comp": "https://datawise.tase.co.il/v1/basic-indices/index-components-basic/{raw:taseFetchDate}",
  "gemelnet_fund": "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot={fundId}&Dochot=1&sug=3",
  "gemelnet_list": "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot=0000&Dochot=1&sug=1",
  "pensyanet_fund": "https://pensyanet.cma.gov.il/Parameters/ExportToXML",
  "pensyanet_list": "https://pensyanet.cma.gov.il/Parameters/ExportToXML",
};

// Rate limiting state (in-memory, per-isolate)
const IP_LIMITS = new Map();
const SHORT_LIMIT = 75;
const SHORT_WINDOW = 5 * 60 * 1000; // 5 minutes
const LONG_LIMIT = 200;
const LONG_WINDOW = 12 * 60 * 60 * 1000; // 12 hours

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  let record = IP_LIMITS.get(ip);
  
  if (!record) {
    record = {
      short: { count: 1, startTime: now },
      long: { count: 1, startTime: now }
    };
    IP_LIMITS.set(ip, record);
    return false;
  }

  // Check/Update Short window (5 mins)
  if (now - record.short.startTime > SHORT_WINDOW) {
    record.short.count = 1;
    record.short.startTime = now;
  } else {
    record.short.count++;
  }

  // Check/Update Long window (24 hours)
  if (now - record.long.startTime > LONG_WINDOW) {
    record.long.count = 1;
    record.long.startTime = now;
  } else {
    record.long.count++;
  }

  IP_LIMITS.set(ip, record);
  return record.short.count > SHORT_LIMIT || record.long.count > LONG_LIMIT;
}

// Regex: English (a-z), Hebrew (א-ת), Numbers (0-9) and symbols: , . : - ^ and space
function replacePlaceholder(urlString, key, value) {
  return urlString
    .replaceAll(`{raw:${key}}`, () => value)
    .replaceAll(`{${key}}`, encodeURIComponent(value));
}

const VALID_VALUE_REGEX = /^[a-zA-Z0-9\u05D0-\u05EA,.:\-^ /_=]+$/;

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function getTaseFetchDate(params) {
  if (params.get('taseFetchDate')) {
    return new Date(params.get('taseFetchDate'));
  }
  const taseFetchDate = new Date();
  const daysToSubtract = taseFetchDate.getDay() === 0 ? 2 : 1;
  const adjustedDate = new Date(taseFetchDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
  params.set('taseFetchDate', formatDate(adjustedDate));
  return adjustedDate;
}

function configurePensyanetOptions(apiId, params, fetchOpts) {
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

function addApiSpecificHeaders(apiId, env, fetchOpts) {
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

async function invokeApi(apiId, params, env, ctx) {
  if (!apiId || !API_MAP[apiId]) {
    return new Response("Invalid or missing apiId", { status: 400, headers: corsHeaders });
  }

  for (const [key, value] of params.entries()) {
    if (key === "apiId") continue;
    if (!VALID_VALUE_REGEX.test(value)) {
      return new Response(`Invalid characters in parameter: ${key}`, { status: 403, headers: corsHeaders });
    }
  }

  const method = (apiId === 'pensyanet_list' || apiId === 'pensyanet_fund') ? "POST" : "GET";
  let taseFetchDate;
  if (apiId === 'tase_list_stocks' || apiId === 'tase_index_comp') {
    taseFetchDate = getTaseFetchDate(params);
  }

  let targetUrlString = API_MAP[apiId];
  for (const [key, value] of params.entries()) {
    if (key === "apiId") continue;
    targetUrlString = replacePlaceholder(targetUrlString, key, value);
  }

  if (targetUrlString.includes("{") && targetUrlString.includes("}")) {
    return new Response("Missing required parameters for this API", { status: 400, headers: corsHeaders });
  }

  const targetUrl = new URL(targetUrlString);
  if (method === "GET") {
    for (const [key, value] of params.entries()) {
      if (key === 'apiId') continue;
      if (!API_MAP[apiId].includes(`{${key}}`) && !API_MAP[apiId].includes(`{raw:${key}}`)) {
        targetUrl.searchParams.append(key, value);
      }
    }
  }

  // Use a deterministic cache key
  const cacheUrl = new URL(targetUrl.toString());
  if (method === "POST") {
    params.forEach((v, k) => {
        if (k !== 'apiId') cacheUrl.searchParams.append(`_p_${k}`, v);
    });
  }
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (response) {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Proxy-Cache", "HIT");
    Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));
    return newResponse;
  }

  try {
    const fetchOpts = {
      method: method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, text/html, application/xhtml+xml, application/xml;q=0.9, image/avif, image/webp, mobile/v1, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 12 * 3600,
      }
    };

    if (apiId.startsWith('pensyanet')) {
      configurePensyanetOptions(apiId, params, fetchOpts);
    }

    addApiSpecificHeaders(apiId, env, fetchOpts);

    let urlToFetch = targetUrl.toString();
    if (apiId === 'tase_list_stocks' || apiId === 'tase_index_comp') {
      urlToFetch = urlToFetch.replace(/\/$/, '').replace('/?', '?');
    }

    console.log(`Fetching URL for ${apiId}: ${urlToFetch}`);
    response = await fetch(urlToFetch, fetchOpts);

    if (!response.ok || response.status === 403 || response.status === 429) {
      const errResponse = new Response(response.body, response);
      Object.keys(corsHeaders).forEach(key => errResponse.headers.set(key, corsHeaders[key]));
      return errResponse;
    }

    // Retrying logic for TASE API when it returns empty results for the current date
    if (apiId === 'tase_list_stocks' || apiId === 'tase_index_comp') {
      const data = await response.clone().json();
      if (data?.tradeSecuritiesList?.result?.length === 0) {
        params.set('taseFetchDate', formatDate(new Date(taseFetchDate.getTime() - 2 * 24 * 60 * 60 * 1000)));
        return await invokeApi(apiId, params, env, ctx);
      }
    }

    const newResponse = new Response(response.body, response);
    // Explicitly set cache headers for Cloudflare Cache API
    newResponse.headers.set("Cache-Control", "public, max-age=43200"); // 12 hours
    newResponse.headers.set("X-Proxy-Cache", "MISS");
    Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));

    // Use waitUntil to avoid delaying the response while updating the cache
    ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));

    return newResponse;
  } catch (err) {
    return new Response(`Network Error connecting to origin for ${apiId}`, { status: 502, headers: corsHeaders });
  }
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Auth Flow: Exchange Authorization Code for Refresh Token
    if (request.method === 'POST' && url.pathname === '/auth/google') {
      try {
        const { code } = await request.json();

        // 1. Exchange code for tokens with Google
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: 'postmessage',
            grant_type: 'authorization_code',
          }),
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
             return new Response(JSON.stringify(tokens), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        // 2. Set the Refresh Token in a Secure, HttpOnly cookie
        const cookie = `auth_refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            ...corsHeaders,
            'Set-Cookie': cookie,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const ip = request.headers.get('cf-connecting-ip');
    if (isRateLimited(ip)) {
      return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
    }

    const params = url.searchParams;
    const apiId = params.get("apiId");

    return invokeApi(apiId, params, env, ctx);
  }
};

export default worker;
