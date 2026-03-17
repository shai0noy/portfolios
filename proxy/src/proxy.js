import { isRateLimited } from './rateLimit.js';
import { getYahooCrumb, clearYahooCache } from './yahooCrumb.js';
import { VALID_VALUE_REGEX, replacePlaceholder, getTaseFetchDate, formatDate, configurePensyanetOptions, addApiSpecificHeaders } from './utils.js';

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
  "yahoo_search": "https://query2.finance.yahoo.com/v1/finance/search?q={searchTerm}",
};

const CACHE_TTL_MAP = {
  "yahoo_hist": 1800, // 30 minutes
  "globes_data": 1800, // 30 minutes
  "globes_list": 43200, // 12 hours
  "globes_exchange_state": 1800, // 30 mins
  "globes_get_exchanges": 43200, // 12 hours
  "globes_get_exchanges_details": 43200, // 12 hours
  "globes_articles": 1800, // 30 mins
  "cbs_price_index": 43200, // 12 hours
  "tase_list_stocks": 43200, // 12 hours
  "tase_list_funds": 43200, // 12 hours
  "tase_list_indices": 43200, // 12 hours
  "tase_index_comp": 43200, // 12 hours
  "gemelnet_fund": 43200, // 12 hours
  "gemelnet_list": 43200, // 12 hours
  "pensyanet_fund": 43200, // 12 hours
  "pensyanet_list": 43200, // 12 hours
  "yahoo_search": 86400, // 24 hours
};



async function invokeApi(apiId, params, env, ctx, corsHeaders) {
  if (apiId === 'yahoo_quote_summary') {
    try {
      const ticker = params.get('ticker');
      const modulesStr = params.get('modules') || 'calendarEvents';
      if (!ticker) return new Response("Missing ticker", { status: 400, headers: corsHeaders });

      const { cookie, crumb } = await getYahooCrumb();
      let url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modulesStr}&crumb=${crumb}`;

      let res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie
        }
      });

      let text = await res.text();
      let isUnauthorized = res.status === 401;

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
        url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modulesStr}&crumb=${fresh.crumb}`;

        res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': fresh.cookie
          }
        });
        text = await res.text();
      }

      const newResponse = new Response(text, res);
      newResponse.headers.set("Cache-Control", `public, max-age=3600`);
      newResponse.headers.set("X-Proxy-Cache", "MISS");
      Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));

      const cacheUrl = new URL(`https://proxy.internal/yahoo_quote_summary?ticker=${ticker}&modules=${modulesStr}`);
      const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
      ctx.waitUntil(caches.default.put(cacheKey, newResponse.clone()));

      return newResponse;
    } catch (e) {
      return new Response(e.message, { status: 500, headers: corsHeaders });
    }
  }

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
        cacheTtl: CACHE_TTL_MAP[apiId] || 43200,
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

    // Only return immediately (without caching) for transient errors or rate limiting.
    // Permanent errors like 404 (Not Found) should fall through and be cached.
    if (response.status === 429 || response.status === 403 || response.status >= 500) {
      const errResponse = new Response(response.body, response);
      Object.keys(corsHeaders).forEach(key => errResponse.headers.set(key, corsHeaders[key]));
      return errResponse;
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
    // Explicitly set cache headers for Cloudflare Cache API
    const ttl = CACHE_TTL_MAP[apiId] || 43200;
    newResponse.headers.set("Cache-Control", `public, max-age=${ttl}`);
    newResponse.headers.set("X-Proxy-Cache", "MISS");
    Object.keys(corsHeaders).forEach(key => newResponse.headers.set(key, corsHeaders[key]));

    // Use waitUntil to avoid delaying the response while updating the cache
    ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));

    return newResponse;
  } catch (err) {
    return new Response(`Network Error connecting to origin for ${apiId}`, { status: 502, headers: corsHeaders });
  }
}

export async function handleProxy(request, env, ctx, corsHeaders) {
  const ip = request.headers.get('cf-connecting-ip');
  if (isRateLimited(ip)) {
    return new Response("Too Many Requests", { status: 429, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const apiId = params.get("apiId");

  return invokeApi(apiId, params, env, ctx, corsHeaders);
}
