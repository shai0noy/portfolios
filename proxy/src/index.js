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
  "gemelnet_fund": "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot={fundId}&Dochot=1&sug=3",
  "gemelnet_list": "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot=0000&Dochot=1&sug=1",
  "pensyanet_fund": "https://pensyanet.cma.gov.il/Parameters/ExportToXML",
  "pensyanet_list": "https://pensyanet.cma.gov.il/Parameters/ExportToXML",
};

// Regex: English (a-z), Hebrew (א-ת), Numbers (0-9) and symbols: , . : - ^ and space
function replacePlaceholder(urlString, key, value) {
  // Use replaceAll for clarity and performance. It's supported in CF Workers.
  // We can chain them because we assume `{key}` and `{raw:key}` won't overlap in a problematic way.
  // We process raw placeholders first, then the encoded ones.
  return urlString
    .replaceAll(`{raw:${key}}`, () => value)
    .replaceAll(`{${key}}`, encodeURIComponent(value));
}

const VALID_VALUE_REGEX = /^[a-zA-Z0-9\u05D0-\u05EA,.:\-^ /_]+$/;

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type", // Add any other headers your client might send
};

async function invokeApi(apiId, params, env) {

  // 1. Validate API ID
  if (!apiId || !API_MAP[apiId]) {
    return new Response("Invalid or missing apiId", { status: 400, headers: corsHeaders });
  }

  // 2. Validate all provided arguments
  for (const [key, value] of params.entries()) {
    if (key === "apiId") continue;
    if (!VALID_VALUE_REGEX.test(value)) {
      return new Response(`Invalid characters in parameter: ${key}`, { status: 403, headers: corsHeaders });
    }
  }

  let method = "GET";
  if (apiId === 'pensyanet_list' || apiId === 'pensyanet_fund') {
    method = "POST";
  }

  let taseFetchDate;
  if (apiId === 'tase_list_stocks') {
    if (params.get('taseFetchDate')) {
      taseFetchDate = new Date(params.get('taseFetchDate'));
    } else {
      // Provides the last active TASE trading day in YYYY/MM/DD format.
      // TASE is closed on Saturday. 
      taseFetchDate = new Date();
      const daysToSubtract = taseFetchDate.getDay() === 0 ? 2 : 1;
      taseFetchDate = new Date(taseFetchDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
      params.set('taseFetchDate', formatDate(taseFetchDate));
    }
  }

  // 3. Build target URL
  let targetUrlString = API_MAP[apiId];

  // Replace placeholders for APIs that use them
  for (const [key, value] of params.entries()) {
    if (key === "apiId") continue;
    targetUrlString = replacePlaceholder(targetUrlString, key, value);
  }

  // Safety Check for any remaining placeholders
  if (targetUrlString.includes("{") && targetUrlString.includes("}")) {
    return new Response("Missing required parameters for this API", { status: 400, headers: corsHeaders });
  }

  const targetUrl = new URL(targetUrlString);

  // Append other params as query string for APIs that need them.
  if (method === "GET") {
    for (const [key, value] of params.entries()) {
      if (key === 'apiId') continue;
      // Only append if it wasn't a placeholder
      if (!API_MAP[apiId].includes(`{${key}}`) && !API_MAP[apiId].includes(`{raw:${key}}`)) {
        targetUrl.searchParams.append(key, value);
      }
    }
  }

  // 5. Fetch from origin with caching
  try {
    const fetchOpts = {
      method: method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, text/html, application/xhtml+xml, application/xml;q=0.9, image/avif, image/webp, mobile/v1, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      cacheTtl: 12 * 3600, // 12 hours,
      cacheEverything: true,
      cf: {
        cacheTtl: 12 * 3600, // 12 hours,
        cacheEverything: true,
        cacheTtlByStatus: {
          "200-299": 12 * 3600, // 12 hours,
          "404": 1 * 3600, // 1 hour
          "500-599": 10, // 10 seconds
        },
      }
    };

    if (apiId.startsWith('pensyanet')) {
      fetchOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      let startYear = params.get('startYear');
      let startMonth = params.get('startMonth');
      let endYear = params.get('endYear');
      let endMonth = params.get('endMonth');

      if (!startYear || !startMonth || !endYear || !endMonth) {
        return new Response(`Missing required parameters for ${apiId}: startYear, startMonth, endYear, endMonth`, { status: 400, headers: corsHeaders });
      }

      const isList = apiId === 'pensyanet_list';

      if (isList) {
        // For pensya list - limit the end date to be at most current_month - 2.
        const today = new Date();
        // new Date(year, monthIndex, day). monthIndex is 0-11.
        // To get 2 months ago, we use today.getMonth() - 2.
        const limitDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        const requestedEndDate = new Date(parseInt(endYear, 10), parseInt(endMonth, 10) - 1, 1);

        if (requestedEndDate > limitDate) {
          endYear = limitDate.getFullYear().toString();
          endMonth = String(limitDate.getMonth() + 1).padStart(2, '0');
          console.log(`Adjusted pensyanet_list end date to ${endYear}/${endMonth} (limit is current month - 2).`);
        }
      }

      // For both list and fund, start date must be equal or smaller than end date.
      const startDateObj = new Date(parseInt(startYear, 10), parseInt(startMonth, 10) - 1, 1);
      const endDateObj = new Date(parseInt(endYear, 10), parseInt(endMonth, 10) - 1, 1);

      if (startDateObj > endDateObj) {
        // If start is after end, set start to be the same as end.
        startYear = endYear;
        startMonth = endMonth;
        console.log(`Adjusted pensyanet start date to ${startYear}/${startMonth} to be <= end date.`);
      }

      const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1)).toISOString().slice(0, 10);
      const endDate = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
      const fundId = params.get('fundId');

      if (!isList && !fundId) {
        return new Response("Missing required parameter for pensyanet_fund: fundId", { status: 400, headers: corsHeaders });
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

    if (apiId === 'tase_list_stocks' || apiId === 'tase_list_funds') {
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


    let urlToFetch = targetUrl.toString();
    // Specific fix for TASE API trailing slash issue. It must be ...trade-securities-list/2025/12/30
    if (apiId === 'tase_list_stocks') {
      if (urlToFetch.endsWith('/')) {
        urlToFetch = urlToFetch.slice(0, -1);
      }
      if (urlToFetch.includes('/?')) {
        urlToFetch = urlToFetch.replace('/?', '?');
      }
    }

    console.log(`Fetching URL for ${apiId}: ${urlToFetch}`);
    let response = await fetch(urlToFetch, fetchOpts);

    // Check for blocking or other errors before caching
    if (!response.ok || response.status === 403 || response.status === 429) {
      console.log(`Origin fetch not OK for ${apiId} - ${targetUrl.toString()}: ${response.status}`);
      // Return without Cloudflare caching headers
      const newResponse = new Response(response.body, response);
      Object.keys(corsHeaders).forEach(key => {
        newResponse.headers.set(key, corsHeaders[key]);
      });
      return newResponse;
    }

    if (apiId === 'tase_list_stocks') {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      const resultsCount = data?.tradeSecuritiesList?.result?.length || 0;
      if (data && resultsCount === 0) {
        console.log(`TASE API no results on date ${taseFetchDate.toISOString().slice(0,10)}, retrying with previous date`);
        params.set('taseFetchDate', formatDate(new Date(taseFetchDate.getTime() - 2 * 24 * 60 * 60 * 1000))); // Go back 2 days
        return await invokeApi(apiId, params, env);
      }
    }
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("X-Proxy-Cache-TTL", "12 hours");

    // Add CORS headers to the actual response
    Object.keys(corsHeaders).forEach(key => {
      newResponse.headers.set(key, corsHeaders[key]);
    });

    return newResponse;
  } catch (err) {
    return new Response(`Network Error connecting to origin for ${apiId}`, { status: 502, headers: corsHeaders });
  }
}


const worker = {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const params = url.searchParams;
    const apiId = params.get("apiId");

    return invokeApi(apiId, params, env);
  }
};

export default worker;