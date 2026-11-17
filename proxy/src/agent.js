import { sealJson, unsealJson, sha256Hex, toBase64Url } from './crypto.js';
import { extractRefreshToken, getAccessTokenFromRefreshToken } from './auth.js';
import { invokeApi } from './proxy.js';
import { checkRateLimit } from './rateLimit.js';
import {
  AgentApiError,
  SheetsRestClient,
  WorkerMarketService,
  getAgentApiHelp,
  getAgentPortfolioState,
  listAgentPortfolios,
  listAgentTransactions,
  addAgentTransactions,
  updateAgentTransaction,
  deleteAgentTransaction,
  listAgentDividends,
  addAgentDividends,
  updateAgentDividend,
  deleteAgentDividend,
  getAgentTickerStats,
} from './agentRuntime.bundle.js';

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}

function extractAgentToken(request) {
  const xKey = request.headers.get('X-Agent-Key');
  if (xKey && xKey.trim().startsWith('ptf_')) {
    return xKey.trim();
  }
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.startsWith('ptf_')) {
      return token;
    }
  }
  return null;
}

export async function handleAgent(request, env, ctx, corsHeaders) {
  const url = new URL(request.url);
  if (url.pathname !== '/agent' && !url.pathname.startsWith('/agent/')) {
    return null;
  }

  const subPath = url.pathname === '/agent' ? '' : url.pathname.slice('/agent'.length);

  // Public self-discovery schema endpoint
  if (request.method === 'GET' && (subPath === '' || subPath === '/' || subPath === '/help')) {
    return jsonResponse(getAgentApiHelp(url.origin), 200, corsHeaders);
  }

  const ip = request.headers.get('cf-connecting-ip');
  const limitResult = checkRateLimit(ip);
  if (!limitResult.allowed) {
    return jsonResponse(
      { error: `Too Many Requests - ${limitResult.message}` },
      429,
      { ...corsHeaders, 'Retry-After': String(limitResult.retryAfter || 60) }
    );
  }

  // Mint or rotate a per-user, sheet-scoped Agent Private Key (requires active Google session)
  if (request.method === 'POST' && subPath === '/token') {
    const refreshToken = await extractRefreshToken(request, env);
    if (!refreshToken) {
      return jsonResponse(
        { error: 'Your Google session has expired or is missing a refresh token. Please sign in again first.' },
        401,
        corsHeaders
      );
    }

    try {
      const body = await request.json().catch(() => ({}));
      const spreadsheetId = String(body?.spreadsheetId || '').trim();
      const label = String(body?.label || 'Agent API Key').trim();
      if (!spreadsheetId) {
        return jsonResponse({ error: 'Missing spreadsheetId' }, 400, corsHeaders);
      }

      const googleTokens = await getAccessTokenFromRefreshToken(refreshToken, env, false);
      const sheets = new SheetsRestClient(spreadsheetId, googleTokens.access_token);
      await sheets.verifyAccess();

      const keyId = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
      const createdAt = new Date().toISOString();
      const sealed = await sealJson(
        { v: 1, sid: spreadsheetId, rt: refreshToken, kid: keyId, iat: Date.now() },
        env.GOOGLE_CLIENT_SECRET
      );
      const token = `ptf_${sealed}`;
      const keyHash = await sha256Hex(token);
      const metaObj = {
        createdAt,
        label,
        keySuffix: token.slice(-6),
      };

      await sheets.setMetadataValue('agent_api_key_hash', keyHash);
      await sheets.setMetadataValue('agent_api_key_meta', JSON.stringify(metaObj));

      return jsonResponse(
        {
          success: true,
          token,
          keyHash,
          meta: metaObj,
        },
        200,
        corsHeaders
      );
    } catch (e) {
      const status = e instanceof AgentApiError ? e.status : 500;
      return jsonResponse({ error: e.message || 'Failed to generate agent private key' }, status, corsHeaders);
    }
  }

  // All remaining /agent/* routes authenticate with the Agent Private Key (ptf_...)
  const rawToken = extractAgentToken(request);
  if (!rawToken) {
    return jsonResponse(
      { error: 'Missing Agent Private Key. Provide header "Authorization: Bearer ptf_..." or "X-Agent-Key: ptf_...".' },
      401,
      corsHeaders
    );
  }

  let tokenPayload;
  try {
    tokenPayload = await unsealJson(rawToken.slice(4), env.GOOGLE_CLIENT_SECRET);
  } catch {
    return jsonResponse({ error: 'Invalid or corrupted Agent Private Key.' }, 401, corsHeaders);
  }

  if (!tokenPayload?.sid || !tokenPayload?.rt) {
    return jsonResponse({ error: 'Malformed Agent Private Key payload.' }, 401, corsHeaders);
  }

  try {
    const expectedKeyHash = await sha256Hex(rawToken);
    const googleTokens = await getAccessTokenFromRefreshToken(tokenPayload.rt, env, true);
    const sheets = new SheetsRestClient(tokenPayload.sid, googleTokens.access_token);
    const safeCtx = ctx || { waitUntil: () => {} };
    const market = new WorkerMarketService((apiId, paramsObj) =>
      invokeApi(apiId, new URLSearchParams(paramsObj), env, safeCtx, corsHeaders)
    );

    // GET /agent/state
    if (request.method === 'GET' && subPath === '/state') {
      const result = await getAgentPortfolioState(sheets, market, expectedKeyHash, {
        portfolioId: url.searchParams.get('portfolioId'),
        displayCurrency: url.searchParams.get('currency'),
        fast: url.searchParams.get('fast') === 'true',
        includeBenchmarks: url.searchParams.get('includeBenchmarks') !== 'false',
        includeLots: url.searchParams.get('includeLots') !== 'false',
      });
      return jsonResponse(result, 200, corsHeaders);
    }

    // GET /agent/portfolios
    if (request.method === 'GET' && subPath === '/portfolios') {
      const result = await listAgentPortfolios(sheets, expectedKeyHash);
      return jsonResponse(result, 200, corsHeaders);
    }

    // GET & POST /agent/transactions
    if (subPath === '/transactions') {
      if (request.method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        const offsetParam = url.searchParams.get('offset');
        const result = await listAgentTransactions(sheets, expectedKeyHash, {
          portfolioId: url.searchParams.get('portfolioId'),
          ticker: url.searchParams.get('ticker'),
          exchange: url.searchParams.get('exchange'),
          type: url.searchParams.get('type'),
          fromDate: url.searchParams.get('fromDate'),
          toDate: url.searchParams.get('toDate'),
          limit: limitParam ? parseInt(limitParam, 10) : undefined,
          offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
        });
        return jsonResponse(result, 200, corsHeaders);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const result = await addAgentTransactions(sheets, market, expectedKeyHash, body);
        return jsonResponse(result, 201, corsHeaders);
      }
    }

    // PUT, PATCH, DELETE /agent/transactions/:rowIndex
    const txnRowMatch = subPath.match(/^\/transactions\/(\d+)$/);
    if (txnRowMatch) {
      const rowIndex = parseInt(txnRowMatch[1], 10);
      if (request.method === 'PUT' || request.method === 'PATCH') {
        const body = await request.json();
        const result = await updateAgentTransaction(
          sheets,
          market,
          expectedKeyHash,
          rowIndex,
          body,
          request.method === 'PATCH'
        );
        return jsonResponse(result, 200, corsHeaders);
      }

      if (request.method === 'DELETE') {
        const body = await request.json().catch(() => ({}));
        const expectedTicker = body?.expectedTicker || url.searchParams.get('expectedTicker');
        const expectedQtyRaw = body?.expectedQty ?? url.searchParams.get('expectedQty');
        const result = await deleteAgentTransaction(sheets, market, expectedKeyHash, rowIndex, {
          expectedTicker,
          expectedQty: expectedQtyRaw !== null && expectedQtyRaw !== undefined ? Number(expectedQtyRaw) : undefined,
        });
        return jsonResponse(result, 200, corsHeaders);
      }
    }

    // GET & POST /agent/dividends
    if (subPath === '/dividends') {
      if (request.method === 'GET') {
        const result = await listAgentDividends(sheets, expectedKeyHash, {
          ticker: url.searchParams.get('ticker'),
          exchange: url.searchParams.get('exchange'),
          source: url.searchParams.get('source'),
          fromDate: url.searchParams.get('fromDate'),
          toDate: url.searchParams.get('toDate'),
        });
        return jsonResponse(result, 200, corsHeaders);
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const result = await addAgentDividends(sheets, expectedKeyHash, body);
        return jsonResponse(result, 201, corsHeaders);
      }
    }

    // PUT, PATCH, DELETE /agent/dividends/:rowIndex
    const divRowMatch = subPath.match(/^\/dividends\/(\d+)$/);
    if (divRowMatch) {
      const rowIndex = parseInt(divRowMatch[1], 10);
      if (request.method === 'PUT' || request.method === 'PATCH') {
        const body = await request.json();
        const result = await updateAgentDividend(sheets, expectedKeyHash, rowIndex, body);
        return jsonResponse(result, 200, corsHeaders);
      }

      if (request.method === 'DELETE') {
        const body = await request.json().catch(() => ({}));
        const expectedTicker = body?.expectedTicker || url.searchParams.get('expectedTicker');
        const expectedAmountRaw = body?.expectedAmount ?? url.searchParams.get('expectedAmount');
        const result = await deleteAgentDividend(sheets, expectedKeyHash, rowIndex, {
          expectedTicker,
          expectedAmount: expectedAmountRaw !== null && expectedAmountRaw !== undefined ? Number(expectedAmountRaw) : undefined,
        });
        return jsonResponse(result, 200, corsHeaders);
      }
    }

    // GET /agent/ticker/:exchange/:ticker
    const tickerMatch = subPath.match(/^\/ticker\/([^/]+)\/([^/]+)$/);
    if (tickerMatch && request.method === 'GET') {
      const exchange = decodeURIComponent(tickerMatch[1]);
      const ticker = decodeURIComponent(tickerMatch[2]);
      const numIdParam = url.searchParams.get('numericId');
      const result = await getAgentTickerStats(
        sheets,
        market,
        expectedKeyHash,
        exchange,
        ticker,
        numIdParam ? Number(numIdParam) : null
      );
      return jsonResponse(result, 200, corsHeaders);
    }

    return jsonResponse(
      { error: `Unknown Agent API endpoint or method: ${request.method} ${url.pathname}. Call GET /agent/help for documentation.` },
      404,
      corsHeaders
    );
  } catch (e) {
    const status = e instanceof AgentApiError ? e.status : e?.oauthError ? 401 : 500;
    return jsonResponse({ error: e.message || 'Internal Agent API error' }, status, corsHeaders);
  }
}
