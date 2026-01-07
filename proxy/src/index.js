const API_MAP = {
  "yahoo_hist": "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=3mo&range=max&events=split,div",
  "globes_data": "https://www.globes.co.il/data/webservices/financial.asmx/getInstrument?exchange={exchange}&symbol={ticker}"
};

// Regex: English (a-z), Hebrew (א-ת), and symbols: , . : - ^ and space
const VALID_VALUE_REGEX = /^[a-zA-Z\u05D0-\u05EA,.:\-^ ]+$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const params = url.searchParams;
    const apiId = params.get("apiId");

    // 1. Validate API ID
    if (!apiId || !API_MAP[apiId]) {
      return new Response("Invalid or missing apiId", { status: 400 });
    }

    // 2. Validate all provided arguments
    for (const [key, value] of params.entries()) {
      if (key === "apiId") continue;
      if (!VALID_VALUE_REGEX.test(value)) {
        return new Response(`Invalid characters in parameter: ${key}`, { status: 403 });
      }
    }

    // 3. Build target URL by replacing {placeholders}
    let targetUrlString = API_MAP[apiId];
    for (const [key, value] of params.entries()) {
      if (key === "apiId") continue;
      // Replaces all occurrences of {key} with the value
      targetUrlString = targetUrlString.split(`{${key}}`).join(encodeURIComponent(value));
    }

    // 4. Safety Check: Ensure no placeholders are left unreplaced
    if (targetUrlString.includes("{") && targetUrlString.includes("}")) {
      return new Response("Missing required parameters for this API", { status: 400 });
    }

    // 5. Fetch with 5-day cache (432,000 seconds)
    // Use 'cacheEverything' to force caching even if the origin has 'no-cache' headers
    const cacheOptions = {
      cf: {
        cacheTtl: 432000,
        cacheEverything: true
      }
    };

    try {
      const response = await fetch(targetUrlString, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://finance.yahoo.com/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,mobile/v1,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        cf: {
          cacheTtl: 432000,
          cacheEverything: true
        }
      });

      // Check if Yahoo specifically is blocking us
      if (response.status === 403 || response.status === 429) {
        return new Response(`Origin API Blocked: ${response.status}`, { status: response.status });
      }

      // Clone response to add custom headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set("X-Proxy-Cache-TTL", "5 Days");

      return newResponse;
    } catch (err) {
      return new Response("Network Error connecting to Yahoo/Globes", { status: 502 });
    }
  }
};