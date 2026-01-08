const API_MAP = {
  "yahoo_hist": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=3mo&range=max&events=split,div",
  "yahoo_open": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d",
  "globes_data": "https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange={exchange}&symbol={ticker}",
  "globes_list": "https://www.globes.co.il/data/webservices/news.asmx/listByType?exchange={exchange}&type={type}",
  "globes_exchange_state": "https://www.globes.co.il/data/webservices/financial.asmx/ExchangeState?exchange={exchange}",
  "globes_get_exchanges": "https://www.globes.co.il/data/webservices/financial.asmx/getExchange",
  "globes_get_exchanges_details": "https://www.globes.co.il/data/webservices/financial.asmx/GetExchangesDetails",
  "cbs_price_index": "https://api.cbs.gov.il/index/data/price?id={id}&format=json&download=false&startPeriod={start}&endPeriod={end}"
};

// Regex: English (a-z), Hebrew (א-ת), Numbers (0-9) and symbols: , . : - ^ and space
const VALID_VALUE_REGEX = /^[a-zA-Z0-9\u05D0-\u05EA,.:\-^ ]+$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow any origin
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type", // Add any other headers your client might send
};

export default {
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
      const placeholder = `{${key}}`;
      if (targetUrlString.includes(placeholder)) {
        targetUrlString = targetUrlString.split(placeholder).join(encodeURIComponent(value));
      }
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
      const isCbs = apiId === 'cbs_price_index';
      const isGlobes = apiId.startsWith("globes");
      
      const referer = isGlobes ? "https://www.globes.co.il/" : isCbs ? "https://www.cbs.gov.il/" : "https://finance.yahoo.com/";
      const accept = "application/json, text/plain, text/html, application/xhtml+xml, application/xml;q=0.9, image/avif, image/webp, mobile/v1, */*;q=0.8";

      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": referer,
          "Accept": accept,
          "Accept-Language": "en-US,en;q=0.5",
        },
        cf: {
          cacheTtl: 432000, // 5 days
          cacheEverything: true
        }
      });

      // Check for blocking
      if (response.status === 403 || response.status === 429) {
        return new Response(`Origin API Blocked: ${response.status}`, { status: response.status, headers: corsHeaders });
      }

      // Clone response to add custom headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("X-Proxy-Cache-TTL", "5 Days");

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