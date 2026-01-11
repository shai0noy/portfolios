const API_MAP = {
  "yahoo_hist": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=3mo&range=max&events=split,div",
  "globes_data": "https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange={exchange}&symbol={ticker}",
  "globes_list": "https://www.globes.co.il/data/webservices/news.asmx/listByType?exchange={exchange}&type={type}",
  "globes_exchange_state": "https://www.globes.co.il/data/webservices/financial.asmx/ExchangeState?exchange={exchange}",
  "globes_get_exchanges": "https://www.globes.co.il/data/webservices/financial.asmx/getExchange",
  "globes_get_exchanges_details": "https://www.globes.co.il/data/webservices/financial.asmx/GetExchangesDetails",
  "cbs_price_index": "https://api.cbs.gov.il/index/data/price?id={id}&format=json&download=false&startPeriod={start}&endPeriod={end}",
  "tase_list_stocks": "https://datawise.tase.co.il/v1/basic-securities/trade-securities-list/{yestarday_slash_format}",
};

// Regex: English (a-z), Hebrew (א-ת), Numbers (0-9) and symbols: , . : - ^ and space
function replacePlaceholder(urlString, key, value) {
  const placeholder = `{${key}}`;
  if (urlString.includes(placeholder)) {
    return urlString.split(placeholder).join(encodeURIComponent(value));
  }
  return urlString;
}

const VALID_VALUE_REGEX = /^[a-zA-Z0-9\u05D0-\u05EA,.:\-^ ]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type", // Add any other headers your client might send
};

export default {
  async fetch(request, env, ctx) {
    const defaults = {
      // Yestarday date in YYYY/MM/DD format
      yestarday_slash_format: new Date(new Date().getTime() - 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0].replace(/-/g, '/'),
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const params = url.searchParams;
    const apiId = params.get("apiId");

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

    // 3. Build target URL
    let targetUrlString = API_MAP[apiId];

    // Replace placeholders for APIs that use them
    for (const [key, value] of params.entries()) {
      if (key === "apiId") continue;
      targetUrlString = replacePlaceholder(targetUrlString, key, value);
    }
    for (const [key, value] of Object.entries(defaults)) {
      targetUrlString = replacePlaceholder(targetUrlString, key, value);
    }

    // Safety Check for any remaining placeholders
    if (targetUrlString.includes("{") && targetUrlString.includes("}")) {
      return new Response("Missing required parameters for this API", { status: 400, headers: corsHeaders });
    }

    const targetUrl = new URL(targetUrlString);

    // Append other params as query string for APIs that need them (like CBS)

    for (const [key, value] of params.entries()) {
      if (key === 'apiId') continue;
      // Only append if it wasn't a placeholder
      if (!API_MAP[apiId].includes(`{${key}}`)) {
        targetUrl.searchParams.append(key, value);
      }
    }


    // 5. Fetch from origin with caching
    try {
      const fetchOpts = {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, text/html, application/xhtml+xml, application/xml;q=0.9, image/avif, image/webp, mobile/v1, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        cacheTtl: 12 * 3600, // 12 hours,
        cacheEverything: true,
        cf: {
          cacheTtl:  12 * 3600, // 12 hours,
          cacheEverything: true,
          cacheTtlByStatus: {
            "200-299": 12 * 3600, // 12 hours,
            "404": 1 * 3600, // 1 hour
            "500-599": 10, // 10 seconds
          },
        }
      };
      if (apiId === 'tase_list_stocks') {
        fetchOpts.headers["apiKey"] = env.TASE_API_KEY;
      } else if (apiId === 'cbs_price_index') {
        fetchOpts.headers["Referer"] = "https://www.cbs.gov.il/";
      } else if (apiId.startsWith("globes")) {
        fetchOpts.headers["Referer"] = "https://www.globes.co.il/";
      } else if (apiId.startsWith("yahoo")) {
        fetchOpts.headers["Referer"] = "https://finance.yahoo.com/";
      }


      let urlToFetch = targetUrl.toString();
      // Specific fix for TASE API trailing slash issue. It must be ...trade-securities-list/2025/12/30
      if (apiId === 'tase_list_stocks' && urlToFetch.endsWith('/')) {
        urlToFetch = urlToFetch.slice(0, -1);
      }
      let response = await fetch(urlToFetch, fetchOpts);

      // Check for blocking or other errors before caching
      if (!response.ok || response.status === 403 || response.status === 429) {
        console.warn(`Origin fetch not OK for ${apiId} - ${targetUrl.toString()}: ${response.status}`);
        // Return without Cloudflare caching headers
        const newResponse = new Response(response.body, response);
        Object.keys(corsHeaders).forEach(key => {
          newResponse.headers.set(key, corsHeaders[key]);
        });
        return newResponse;
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
};