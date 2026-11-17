/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error Plain ESM Worker module
import workerEntry from '../../proxy/src/index.js';
// @ts-expect-error Plain ESM Worker module
import { decodeJsonBase64Url } from '../../proxy/src/crypto.js';

interface MockSheetState {
  sheets: Record<string, any[][]>;
  sheetIds: Record<string, number>;
}

function createMockGoogleAndSheetsFetch(sheetStore: Record<string, MockSheetState>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr);
    const method = (init?.method || 'GET').toUpperCase();

    // 1. Mock Google OAuth token endpoint
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
      const params = new URLSearchParams(String(init?.body || ''));
      const grantType = params.get('grant_type');
      if (grantType === 'authorization_code') {
        if (params.get('code') === 'valid_auth_code') {
          return new Response(
            JSON.stringify({
              access_token: 'mock_access_token_initial',
              expires_in: 3600,
              refresh_token: 'mock_refresh_token_val',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      if (grantType === 'refresh_token') {
        if (params.get('refresh_token') === 'mock_refresh_token_val') {
          return new Response(
            JSON.stringify({
              access_token: 'mock_access_token_refreshed',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
    }

    // 2. Mock Google Sheets v4 REST API
    if (url.origin === 'https://sheets.googleapis.com') {
      const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
      if (!m) return new Response('Not found', { status: 404 });
      const spreadsheetId = decodeURIComponent(m[1]);
      const rest = m[2];
      const store = sheetStore[spreadsheetId];
      if (!store) {
        return new Response(JSON.stringify({ error: { message: 'Spreadsheet not found' } }), { status: 404 });
      }

      // Metadata GET
      if (method === 'GET' && rest === '') {
        return new Response(
          JSON.stringify({
            spreadsheetId,
            properties: { title: 'Test Portfolio Sheet' },
            sheets: Object.entries(store.sheetIds).map(([title, sheetId]) => ({
              properties: { title, sheetId },
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // batchGet
      if (method === 'GET' && rest === '/values:batchGet') {
        const ranges = url.searchParams.getAll('ranges');
        const valueRanges = ranges.map(r => {
          const [sheetName, a1] = r.split('!');
          const allRows = store.sheets[sheetName] || [];
          const startRow = a1?.startsWith('A2') ? 1 : 0;
          return { range: r, values: allRows.slice(startRow) };
        });
        return new Response(JSON.stringify({ valueRanges }), { status: 200 });
      }

      // Single range GET / PUT / append / clear
      const valuesMatch = rest.match(/^\/values\/([^:]+)(?::(append|clear))?$/);
      if (valuesMatch) {
        const range = decodeURIComponent(valuesMatch[1]);
        const action = valuesMatch[2];
        const [sheetName, a1 = 'A1'] = range.split('!');
        if (!store.sheets[sheetName]) store.sheets[sheetName] = [];
        const rows = store.sheets[sheetName];

        if (method === 'GET' && !action) {
          const rowMatch = a1.match(/^[A-Z]+(\d+)(?::[A-Z]+(\d+)?)?$/);
          if (rowMatch) {
            const startIdx = parseInt(rowMatch[1], 10) - 1;
            const endIdx = rowMatch[2] ? parseInt(rowMatch[2], 10) : rows.length;
            return new Response(JSON.stringify({ values: rows.slice(startIdx, endIdx) }), { status: 200 });
          }
          return new Response(JSON.stringify({ values: rows }), { status: 200 });
        }

        if (method === 'POST' && action === 'clear') {
          if (a1.startsWith('A2')) {
            store.sheets[sheetName] = rows.slice(0, 1);
          } else {
            store.sheets[sheetName] = [];
          }
          return new Response(JSON.stringify({}), { status: 200 });
        }

        if (method === 'POST' && action === 'append') {
          const body = JSON.parse(String(init?.body || '{}'));
          const incoming: any[][] = body.values || [];
          const startRowNum = rows.length + 1;
          rows.push(...incoming);
          const endRowNum = rows.length;
          return new Response(
            JSON.stringify({
              updates: {
                updatedRange: `${sheetName}!A${startRowNum}:V${endRowNum}`,
              },
            }),
            { status: 200 }
          );
        }

        if (method === 'PUT' && !action) {
          const body = JSON.parse(String(init?.body || '{}'));
          const incoming: any[][] = body.values || [];
          const cellMatch = a1.match(/^([A-Z])(\d+)/);
          const colIdx = cellMatch ? cellMatch[1].charCodeAt(0) - 65 : 0;
          const startRowIdx = cellMatch ? parseInt(cellMatch[2], 10) - 1 : 0;

          incoming.forEach((inRow, rOffset) => {
            const targetIdx = startRowIdx + rOffset;
            while (rows.length <= targetIdx) rows.push([]);
            if (colIdx === 0 && inRow.length > 1) {
              rows[targetIdx] = inRow;
            } else {
              inRow.forEach((val, cOffset) => {
                rows[targetIdx][colIdx + cOffset] = val;
              });
            }
          });
          return new Response(JSON.stringify({}), { status: 200 });
        }
      }

      // batchUpdate (addSheet, updateCells formulas, deleteDimension)
      if (method === 'POST' && rest === ':batchUpdate') {
        const body = JSON.parse(String(init?.body || '{}'));
        const replies: any[] = [];
        for (const req of body.requests || []) {
          if (req.addSheet) {
            const title = req.addSheet.properties.title;
            const newId = Object.keys(store.sheetIds).length + 10;
            store.sheetIds[title] = newId;
            if (!store.sheets[title]) store.sheets[title] = [];
            replies.push({ addSheet: { properties: { title, sheetId: newId } } });
          } else if (req.deleteDimension) {
            const targetId = req.deleteDimension.range.sheetId;
            const sheetEntry = Object.entries(store.sheetIds).find(([, id]) => id === targetId);
            if (sheetEntry) {
              const sRows = store.sheets[sheetEntry[0]];
              const start = req.deleteDimension.range.startIndex;
              const count = req.deleteDimension.range.endIndex - start;
              sRows.splice(start, count);
            }
            replies.push({});
          } else {
            replies.push({});
          }
        }
        return new Response(JSON.stringify({ replies }), { status: 200 });
      }
    }

    return new Response('Not found', { status: 404 });
  });
}

describe('Worker OAuth Redirect & Agent API', () => {
  const env = {
    GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'super-secret-worker-key-for-tests',
  };

  let sheetStore: Record<string, MockSheetState>;

  beforeEach(() => {
    // Provide minimal caches.default mock for Worker environment
    (globalThis as any).caches = {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => false),
      },
    };

    sheetStore = {
      sheet_123: {
        sheetIds: {
          Portfolio_Options: 1,
          Transaction_Log: 2,
          Holdings: 3,
          Currency_Conversions: 4,
          App_Metadata: 5,
          Dividends: 6,
          Tracking_Lists: 7,
          External_Datasets: 8,
        },
        sheets: {
          Portfolio_Options: [
            ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_Rate', 'Income_Tax_Rate', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Comm_Exemption', 'Tax_Policy'],
            ['p1', 'Main Brokerage', 0.25, 0, 0, 'percentage', 'yearly', 0.001, 2, 0, 'USD', 'CASH', 0, 'none', 'NOMINAL_GAIN'],
          ],
          Transaction_Log: [
            ['Date', 'Portfolio', 'Ticker', 'Exchange', 'Type', 'Original_Qty', 'Original_Price', 'Currency'],
            ['2025-01-15', 'p1', 'AAPL', 'NASDAQ', 'BUY', 10, 180, 'USD'],
          ],
          Holdings: [
            ['Ticker', 'Exchange', 'Live_Price', 'Currency', 'Total Holding Value', 'Name_En', 'Name_He', 'Sector', 'Type', 'Day_Change'],
            ['AAPL', 'NASDAQ', 220, 'USD', 2200, 'Apple Inc.', '', 'Technology', 'STOCK', 0.015],
          ],
          Currency_Conversions: [
            ['Key', 'Value', '1D Ago'],
            ['USDILS', 3.65, 3.64],
          ],
          App_Metadata: [
            ['Key', 'Value'],
            ['user_financial_profile', JSON.stringify({ birthYear: 1990, netYearlyEarnings: 200000 })],
          ],
          Dividends: [
            ['Exchange', 'Ticker', 'Date', 'Div_Amount', 'Source', 'Asset_Price_At_Time', 'Asset_Price_Currency', 'Div_Currency'],
            ['NASDAQ', 'AAPL', '2025-05-15', 0.25, 'MANUAL', 200, 'USD', 'USD'],
          ],
          Tracking_Lists: [
            ['List_Name', 'Ticker', 'Exchange', 'Date_Added', 'Alerts'],
            ['Watchlist', 'AAPL', 'NASDAQ', '2025-01-01', JSON.stringify([{ id: 'a1', type: 'price_above', targetPrice: 200 }])],
          ],
          External_Datasets: [['Ticker', 'Exchange', 'Date', 'Price', 'Currency']],
        },
      },
    };

    vi.stubGlobal('fetch', createMockGoogleAndSheetsFetch(sheetStore));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes OAuth redirect login, callback, and cookie-free Bearer session refresh', async () => {
    // 1. Reject disallowed returnTo domain
    const badLoginRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/auth/login?returnTo=https://evil.example.com/steal'),
      env,
      {}
    );
    expect(badLoginRes.status).toBe(400);

    // 2. Initiate valid redirect login
    const loginRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/auth/login?returnTo=https://shai0noy.github.io/portfolios/dashboard'),
      env,
      {}
    );
    expect(loginRes.status).toBe(302);
    const googleUrl = new URL(loginRes.headers.get('Location')!);
    expect(googleUrl.origin).toBe('https://accounts.google.com');
    expect(googleUrl.searchParams.get('redirect_uri')).toBe('https://portfolios.noy-shai.workers.dev/auth/callback');
    expect(googleUrl.searchParams.get('access_type')).toBe('offline');
    expect(googleUrl.searchParams.get('prompt')).toBe('select_account consent');
    const state = googleUrl.searchParams.get('state')!;
    expect(state).toBeTruthy();

    // 3. Complete OAuth callback
    const cbRes = await workerEntry.fetch(
      new Request(`https://portfolios.noy-shai.workers.dev/auth/callback?code=valid_auth_code&state=${encodeURIComponent(state)}`),
      env,
      {}
    );
    expect(cbRes.status).toBe(302);
    expect(cbRes.headers.get('Set-Cookie')).toContain('auth_refresh_token=mock_refresh_token_val');

    const redirectBack = new URL(cbRes.headers.get('Location')!);
    expect(redirectBack.origin + redirectBack.pathname).toBe('https://shai0noy.github.io/portfolios/dashboard');
    const hashParams = new URLSearchParams(redirectBack.hash.slice(1));
    const callbackPayload = decodeJsonBase64Url(hashParams.get('oauth_callback')!);
    expect(callbackPayload.access_token).toBe('mock_access_token_initial');
    expect(callbackPayload.session_token).toBeTruthy();

    // 4. Refresh access token WITHOUT cookies using Bearer session_token
    const refreshRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/auth/token', {
        headers: { Authorization: `Bearer ${callbackPayload.session_token}` },
      }),
      env,
      {}
    );
    expect(refreshRes.status).toBe(200);
    const refreshedData = await refreshRes.json();
    expect(refreshedData.access_token).toBe('mock_access_token_refreshed');
  });

  it('mints sheet-scoped Agent key, reads AI-helper state, manages txns & dividends, and enforces revocation', async () => {
    // First get a user session token via login+callback
    const loginRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/auth/login?returnTo=https://shai0noy.github.io/portfolios/'),
      env,
      {}
    );
    const state = new URL(loginRes.headers.get('Location')!).searchParams.get('state')!;
    const cbRes = await workerEntry.fetch(
      new Request(`https://portfolios.noy-shai.workers.dev/auth/callback?code=valid_auth_code&state=${encodeURIComponent(state)}`),
      env,
      {}
    );
    const sessionToken = decodeJsonBase64Url(
      new URLSearchParams(new URL(cbRes.headers.get('Location')!).hash.slice(1)).get('oauth_callback')!
    ).session_token;

    // 1. Mint Agent Private Key for sheet_123
    const mintRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ spreadsheetId: 'sheet_123', label: 'Jetski Agent' }),
      }),
      env,
      {}
    );
    expect(mintRes.status).toBe(200);
    const mintJson = await mintRes.json();
    expect(mintJson.token).toMatch(/^ptf_/);
    const agentKey: string = mintJson.token;

    // Verify hash was stored inside sheet_123's App_Metadata
    const metaRows = sheetStore.sheet_123.sheets.App_Metadata;
    expect(metaRows.find(r => r[0] === 'agent_api_key_hash')?.[1]).toBe(mintJson.keyHash);

    // 2. GET /agent/state?fast=true&currency=USD
    const stateRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/state?fast=true&currency=USD', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(stateRes.status).toBe(200);
    const portfolioState = await stateRes.json();
    expect(portfolioState.displayCurrency).toBe('USD');
    expect(portfolioState.summary.aum).toBeCloseTo(2200, 2); // 10 AAPL * $220
    expect(portfolioState.holdings).toHaveLength(1);
    expect(portfolioState.holdings[0].symbol).toBe('AAPL');
    expect(portfolioState.holdings[0].unrealizedGain).toBeCloseTo(400, 2); // (220 - 180) * 10
    expect(portfolioState.userProfile.netYearlyEarnings).toBe(200000);
    expect(portfolioState.userProfile.birthYear).toBeUndefined();
    expect(portfolioState.userProfile.age).toBeGreaterThan(20);
    expect(portfolioState.watchlist[0].alerts[0].triggered).toBe(true); // 220 >= 200

    // 3. POST /agent/transactions (Add BUY MSFT)
    const addTxnRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: '2025-06-01',
          portfolioId: 'p1',
          ticker: 'MSFT',
          exchange: 'NASDAQ',
          type: 'BUY',
          originalQty: 5,
          originalPrice: 400,
          currency: 'USD',
          autoCommission: true,
          comment: 'Added by agent',
        }),
      }),
      env,
      {}
    );
    expect(addTxnRes.status).toBe(201);
    const addedTxnData = await addTxnRes.json();
    expect(addedTxnData.addedCount).toBe(1);
    expect(addedTxnData.transactions[0].rowIndex).toBe(3);
    expect(addedTxnData.transactions[0].commission).toBe(2); // min fee = 2

    // 4. Oversell protection check
    const oversellRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: '2025-06-02',
          portfolioId: 'p1',
          ticker: 'MSFT',
          exchange: 'NASDAQ',
          type: 'SELL',
          originalQty: 99,
          originalPrice: 410,
          currency: 'USD',
        }),
      }),
      env,
      {}
    );
    expect(oversellRes.status).toBe(400);

    // 5. PATCH /agent/transactions/3
    const patchTxnRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions/3', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${agentKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalQty: 8,
          expectedTicker: 'MSFT',
          expectedQty: 5,
        }),
      }),
      env,
      {}
    );
    expect(patchTxnRes.status).toBe(200);
    const patchedTxn = await patchTxnRes.json();
    expect(patchedTxn.transaction.originalQty).toBe(8);

    // 6. GET /agent/transactions
    const listTxnRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions?ticker=MSFT', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(listTxnRes.status).toBe(200);
    const listTxnJson = await listTxnRes.json();
    expect(listTxnJson.transactions).toHaveLength(1);
    expect(listTxnJson.transactions[0].originalQty).toBe(8);

    // 7. DELETE /agent/transactions/3
    const delTxnRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions/3?expectedTicker=MSFT', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(delTxnRes.status).toBe(200);

    // 8. Dividends CRUD: POST, PATCH, GET, DELETE
    const addDivRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/dividends', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          date: '2025-08-15',
          amount: 0.26,
          currency: 'USD',
        }),
      }),
      env,
      {}
    );
    expect(addDivRes.status).toBe(201);
    const addedDiv = await addDivRes.json();
    expect(addedDiv.dividends[0].rowIndex).toBe(3);

    const patchDivRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/dividends/3', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${agentKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: 0.28, expectedTicker: 'AAPL' }),
      }),
      env,
      {}
    );
    expect(patchDivRes.status).toBe(200);

    const delDivRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/dividends/3', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(delDivRes.status).toBe(200);

    // 9. Revoking key in App_Metadata immediately blocks access
    const hashRow = sheetStore.sheet_123.sheets.App_Metadata.find(r => r[0] === 'agent_api_key_hash')!;
    hashRow[1] = '';

    const revokedRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/portfolios', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(revokedRes.status).toBe(401);
  });
});
