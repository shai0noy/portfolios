import { checkRateLimit } from './rateLimit.js';
import { getYahooCrumb, clearYahooCache } from './yahooCrumb.js';
import { VALID_VALUE_REGEX, replacePlaceholder, getTaseFetchDate, formatDate, configurePensyanetOptions, addApiSpecificHeaders } from './utils.js';

const API_MAP = {
  "yahoo_hist": { urlTemaplte: "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range={range}&events=split,div", ttl: 1800 },
  "globes_data": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange={exchange}&symbol={ticker}", ttl: 1800 },
  "globes_list": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/listByType?exchange={exchange}&type={type}", ttl: 43200 },
  "globes_exchange_state": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/ExchangeState?exchange={exchange}", ttl: 1800 },
  "globes_get_exchanges": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/getExchange", ttl: 43200 },
  "globes_get_exchanges_details": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/GetExchangesDetails", ttl: 43200 },
  "globes_articles": { urlTemaplte: "https://www.globes.co.il/data/webservices/financial.asmx/getArticles?symbol={ticker}&exchange={exchange}&daysBefore=60&page=0&language=&quid=", ttl: 1800 },
  "cbs_price_index": { urlTemaplte: "https://api.cbs.gov.il/index/data/price?id={id}&format=json&download=false&PageSize=1000&page={page}", ttl: 43200 },
  "tase_list_stocks": { urlTemaplte: "https://datawise.tase.co.il/v1/basic-securities/trade-securities-list/{raw:taseFetchDate}", ttl: 43200 },
  "tase_list_funds": { urlTemaplte: "https://datawise.tase.co.il/v1/fund/fund-list?listingStatusId=1", ttl: 43200 },
  "tase_list_indices": { urlTemaplte: "https://datawise.tase.co.il/v1/basic-indices/indices-list", ttl: 43200 },
  "tase_index_comp": { urlTemaplte: "https://datawise.tase.co.il/v1/basic-indices/index-components-basic/{raw:taseFetchDate}", ttl: 43200 },
  "gemelnet_fund": { urlTemaplte: "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot={fundId}&Dochot=1&sug=3", ttl: 43200 },
  "gemelnet_list": { urlTemaplte: "https://gemelnet.cma.gov.il/tsuot/ui/tsuotHodXML.aspx?miTkfDivuach={startYear}{startMonth}&adTkfDivuach={endYear}{endMonth}&kupot=0000&Dochot=1&sug=1", ttl: 43200 },
  "pensyanet_fund": { urlTemaplte: "https://pensyanet.cma.gov.il/Parameters/ExportToXML", ttl: 43200 },
  "pensyanet_list": { urlTemaplte: "https://pensyanet.cma.gov.il/Parameters/ExportToXML", ttl: 43200 },
  "yahoo_search": { urlTemaplte: "https://query2.finance.yahoo.com/v1/finance/search?q={searchTerm}", ttl: 86400 },
  "yahoo_quote_summary": {
    urlTemaplte: "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules={modules}&crumb={crumb}",
    ttl: 3600,
    requiresCrumb: true
  },
  "boi_statistics": { urlTemaplte: "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0/{series}?locale=en&format=csv", ttl: 43200 }
};

async function invokeApi(apiId, params, env, ctx, corsHeaders) {
  const apiConfig = API_MAP[apiId];
  if (!apiId || !apiConfig) {
    return new Response("Invalid or missing apiId", { status: 400, headers: corsHeaders });
  }

  for (const [key, value] of params.entries()) {
    if (key === "apiId") continue;
    if (!VALID_VALUE_REGEX.test(value)) {
      return new Response(`Invalid characters in parameter: ${key}`, { status: 403, headers: corsHeaders });
    }
  }

  if (apiConfig.handler) {
    return apiConfig.handler(apiConfig, params, env, ctx, corsHeaders);
  }

  const method = (apiId === 'pensyanet_list' || apiId === 'pensyanet_fund') ? "POST" : "GET";
  let taseFetchDate;
  if (apiId === 'tase_list_stocks' || apiId === 'tase_index_comp') {
    taseFetchDate = getTaseFetchDate(params);
  }

  let cookieHeader = null;
  if (apiConfig.requiresCrumb) {
    try {
      const { cookie, crumb } = await getYahooCrumb();
      cookieHeader = cookie;
      params.set('crumb', crumb);
      if (!params.has('modules')) params.set('modules', 'calendarEvents');
    } catch (e) {
      return new Response("Crumb fetch error: " + e.message, { status: 500, headers: corsHeaders });
    }
  }

  let targetUrlString = apiConfig.urlTemaplte;
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
      if (!apiConfig.urlTemaplte.includes(`{${key}}`) && !apiConfig.urlTemaplte.includes(`{raw:${key}}`)) {
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
        cacheTtl: apiConfig.ttl || 43200,
      }
    };

    if (cookieHeader) {
      fetchOpts.headers["Cookie"] = cookieHeader;
    }

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

    if (apiConfig.requiresCrumb) {
      let isUnauthorized = response.status === 401;
      let text = await response.text();

      if (!isUnauthorized && text.includes('"Unauthorized"')) {
        try {
          const data = JSON.parse(text);
          if (data?.finance?.error?.code === 'Unauthorized') isUnauthorized = true;
          if (data?.quoteSummary?.error?.code === 'Unauthorized') isUnauthorized = true;
        } catch (e) { }
      }

      if (isUnauthorized) {
        clearYahooCache();
        const fresh = await getYahooCrumb();
        params.set('crumb', fresh.crumb);
        fetchOpts.headers['Cookie'] = fresh.cookie;

        // Rebuild url
        let freshUrlStr = apiConfig.urlTemaplte;
        for (const [key, value] of params.entries()) {
          if (key === "apiId") continue;
          freshUrlStr = replacePlaceholder(freshUrlStr, key, value);
        }

        let freshUrl = new URL(freshUrlStr);
        for (const [key, value] of params.entries()) {
          if (key === 'apiId') continue;
          if (!apiConfig.urlTemaplte.includes(`{${key}}`) && !apiConfig.urlTemaplte.includes(`{raw:${key}}`)) {
            freshUrl.searchParams.append(key, value);
          }
        }
        urlToFetch = freshUrl.toString();
        response = await fetch(urlToFetch, fetchOpts);
        text = await response.text(); // grab new response text
      }

      response = new Response(text, response);
    }

    // Retrying logic for TASE API when it returns empty results for the current date
    if (apiId === 'tase_list_stocks' || apiId === 'tase_index_comp') {
      const data = await response.clone().json();
      if (data?.tradeSecuritiesList?.result?.length === 0) {
        params.set('taseFetchDate', formatDate(new Date(taseFetchDate.getTime() - 2 * 24 * 60 * 60 * 1000)));
        return await invokeApi(apiId, params, env, ctx, corsHeaders);
      }
    }

    const newResponse = new Response(response.body, response);
    const isTransientError = response.status === 429 || response.status === 403 || response.status >= 500;

    // Explicitly set cache headers for Cloudflare Cache API, but ONLY for successful or cacheable permanent error responses
    if (!isTransientError) {
      const ttl = apiConfig.ttl || 43200;
      newResponse.headers.set("Cache-Control", `public, max-age=${ttl}`);
      newResponse.headers.set("X-Proxy-Cache", "MISS");
      Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));

      // Use waitUntil to avoid delaying the response while updating the cache
      ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    } else {
      // Prevent browser from caching error states like 429, 403, 500
      newResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      newResponse.headers.set("X-Proxy-Cache", "BYPASS");
      Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));
    }

    return newResponse;
  } catch (err) {
    return new Response(`Network Error connecting to origin for ${apiId}`, { status: 502, headers: { ...corsHeaders, "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
  }
}

export async function handleProxy(request, env, ctx, corsHeaders) {
  const ip = request.headers.get('cf-connecting-ip');
  const limitResult = checkRateLimit(ip);
  if (!limitResult.allowed) {
    return new Response("Too Many Requests - " + limitResult.message, { status: 429, headers: { ...corsHeaders, "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Retry-After": String(limitResult.retryAfter || 60) } });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const apiId = params.get("apiId");

  return invokeApi(apiId, params, env, ctx, corsHeaders);
}
