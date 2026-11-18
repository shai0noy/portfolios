/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error Plain ESM Worker module
import workerEntry from '../../proxy/src/index.js';
// @ts-expect-error Plain ESM Worker module
import { decodeJsonBase64Url } from '../../proxy/src/crypto.js';
import { getWorkerYahooCandidates, WorkerMarketService } from './workerRuntime';
import { FinanceEngine } from '../lib/data/engine';
import { Currency, Exchange } from '../lib/types';

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
          } else if (req.updateCells) {
            const targetId = req.updateCells.range?.sheetId;
            const sheetEntry = Object.entries(store.sheetIds).find(([, id]) => id === targetId);
            if (sheetEntry) {
              const sRows = store.sheets[sheetEntry[0]];
              const startRow = req.updateCells.range.startRowIndex || 0;
              const startCol = req.updateCells.range.startColumnIndex || 0;
              (req.updateCells.rows || []).forEach((r: any, rOff: number) => {
                while (sRows.length <= startRow + rOff) sRows.push([]);
                (r.values || []).forEach((cell: any, cOff: number) => {
                  const uev = cell?.userEnteredValue;
                  if (uev?.numberValue !== undefined) {
                    sRows[startRow + rOff][startCol + cOff] = uev.numberValue;
                  } else if (uev?.stringValue !== undefined) {
                    sRows[startRow + rOff][startCol + cOff] = uev.stringValue;
                  } else if (uev?.formulaValue !== undefined && (store as any).onFormulaCell) {
                    sRows[startRow + rOff][startCol + cOff] = (store as any).onFormulaCell(
                      sheetEntry[0],
                      startRow + rOff,
                      startCol + cOff,
                      uev.formulaValue,
                      sRows[startRow + rOff]
                    );
                  }
                });
              });
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

  it('fixes phantom splits, ILA PATCH 100x commission bug, TASE numericId resolution, string trimming, and /portfolios cleanup', async () => {
    // Helper: mint agent key for sheet_123
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
    const mintRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: 'sheet_123', label: 'Bugfix Test' }),
      }),
      env,
      {}
    );
    const agentKey: string = (await mintRes.json()).token;

    // Seed portfolios with mixed date formats and an empty second portfolio
    sheetStore.sheet_123.sheets.Portfolio_Options = [
      ['Portfolio_ID', 'Display_Name', 'Cap_Gains_Tax_Rate', 'Income_Tax_Rate', 'Mgmt_Fee_Val', 'Mgmt_Type', 'Mgmt_Freq', 'Comm_Rate_%', 'Comm_Min', 'Comm_Max_Fee', 'Currency', 'Div_Policy', 'Div_Comm_Rate_%', 'Comm_Exemption', 'Tax_Policy', 'Tax_On_Base', 'Tax_History', 'Fee_History'],
      [
        'p1',
        'Main Brokerage',
        0.25,
        0,
        0,
        'percentage',
        'yearly',
        0.001,
        2,
        0,
        'USD',
        'CASH',
        0,
        'none',
        'NOMINAL_GAIN',
        false,
        JSON.stringify([{ startDate: '1970-01-01', cgt: 0.25, incTax: 0 }, { startDate: '11/03/2026', cgt: 0.25, incTax: 0 }]),
        JSON.stringify([{ startDate: '11/03/2026', mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', divCommRate: 0 }]),
      ],
      ['p_empty', 'Empty Account', 0.25, 0, 0, 'percentage', 'yearly', 0, 0, 0, 'ILS', 'CASH', 0, 'none', 'IL_REAL_GAIN'],
    ];

    // Full 22-column Transaction_Log header (A..V)
    sheetStore.sheet_123.sheets.Transaction_Log = [
      [
        'Date', 'Portfolio', 'Ticker', 'Exchange', 'Type', 'Original_Qty', 'Original_Price', 'Currency',
        'Original_Price_ILA', 'Original_Price_USD', 'Vesting_Date', 'Comments', 'Commission', 'Source',
        'Creation_Date', 'Orig_Open_Price_At_Creation_Date', 'Split_Adj_Open_Price', 'Split_Ratio',
        'Split_Adjusted_Price', 'Split_Adjusted_Qty', 'Numeric_ID', 'GF_Exchange',
      ],
      // Row 2: Existing GOOG row with drift splitRatio 1.04 (e.g. Yahoo vs GoogleFinance opening price difference)
      ['2026-03-15', 'p1', 'GOOG', 'NASDAQ', 'BUY', 50, 300, 'USD', '', 300, '', '', 0, 'APP', '2026-03-15', 306.655, 294.86, 1.04, 288.4615, 52, '', ''],
      // Row 3: Existing TASE MTF.F96 row with numericId 1181445 and trailing whitespace in currency/ticker
      ['2026-03-10', ' p1 ', ' MTF.F96 ', 'TLV', 'BUY', 100, 10500, 'ILA ', '', '', '', '', 1460, 'APP', '2026-03-10', 10500, 10500, 1, 10500, 100, 1181445, 'TLV'],
    ];

    // Simulate Sheets evaluating Split_Adj_Open_Price (col Q = idx 16) on formula write
    (sheetStore.sheet_123 as any).onFormulaCell = (_sheet: string, _rowIdx: number, colIdx: number, _formula: string, row: any[]) => {
      if (colIdx === 16 && row[2] === 'NVDA') {
        return 135.5; // GOOGLEFINANCE open price
      }
      return '';
    };

    // 1. Phantom split snapped on GET /transactions and /state
    const txRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions?ticker=GOOG', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(txRes.status).toBe(200);
    const txJson = await txRes.json();
    expect(txJson.transactions).toHaveLength(1);
    expect(txJson.transactions[0].splitRatio).toBe(1);
    expect(txJson.transactions[0].qty).toBe(50);
    expect(txJson.transactions[0].price).toBe(300);

    // 2. String trimming + consistent commission units on GET /transactions
    const taseTxRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions?ticker=1181445', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(taseTxRes.status).toBe(200);
    const taseTxJson = await taseTxRes.json();
    expect(taseTxJson.transactions).toHaveLength(1);
    expect(taseTxJson.transactions[0].ticker).toBe('MTF.F96');
    expect(taseTxJson.transactions[0].portfolioId).toBe('p1');
    expect(taseTxJson.transactions[0].currency).toBe('ILA');
    expect(taseTxJson.transactions[0].originalPriceILA).toBe(10500);
    expect(taseTxJson.transactions[0].commission).toBe(14.6);
    expect(taseTxJson.transactions[0].commissionILS).toBe(14.6);

    // 3. PATCH ILA row without commission must NOT multiply sheet commission by 100
    const patchIlaRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions/3', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'Updated note only' }),
      }),
      env,
      {}
    );
    expect(patchIlaRes.status).toBe(200);
    const patchIlaJson = await patchIlaRes.json();
    expect(patchIlaJson.transaction.commission).toBe(14.6);
    expect(patchIlaJson.transaction.commissionILS).toBe(14.6);
    // Sheet cell M3 (idx 12) must remain 1460 (not 146000)
    expect(sheetStore.sheet_123.sheets.Transaction_Log[2][12]).toBe(1460);

    // PATCH with explicit commission in major currency (15.25 ILS) scales once to 1525 agorot
    const patchCommRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions/3', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission: 15.25 }),
      }),
      env,
      {}
    );
    expect(patchCommRes.status).toBe(200);
    expect((await patchCommRes.json()).transaction.commission).toBe(15.25);
    expect(sheetStore.sheet_123.sheets.Transaction_Log[2][12]).toBe(1525);

    // 4. GET /ticker/TASE/1181445 canonicalizes to MTF.F96 and includes userTransactions
    const tickerStatsRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/ticker/TASE/1181445', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(tickerStatsRes.status).toBe(200);
    const tickerStatsJson = await tickerStatsRes.json();
    expect(tickerStatsJson.ticker).toBe('MTF.F96');
    expect(tickerStatsJson.requestedTicker).toBe('1181445');
    expect(tickerStatsJson.numericId).toBe(1181445);
    expect(tickerStatsJson.userTransactions).toHaveLength(1);
    expect(tickerStatsJson.userTransactions[0].commission).toBe(15.25);

    // 5. POST /transactions with TASE numericId canonicalizes to MTF.F96 (including oversell check)
    const addTaseByNumRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2026-04-01',
          portfolioId: 'p1',
          ticker: '1181445',
          exchange: 'TASE',
          type: 'SELL',
          originalQty: 25,
          originalPrice: 10800,
          currency: 'ILA ',
          commission: 10.5,
        }),
      }),
      env,
      {}
    );
    expect(addTaseByNumRes.status).toBe(201);
    const addedTase = await addTaseByNumRes.json();
    expect(addedTase.transactions[0].ticker).toBe('MTF.F96');
    expect(addedTase.transactions[0].numericId).toBe(1181445);
    expect(addedTase.transactions[0].currency).toBe('ILA');
    expect(addedTase.transactions[0].commission).toBe(10.5);
    expect(sheetStore.sheet_123.sheets.Transaction_Log[3][12]).toBe(1050);

    // 6. POST /transactions copies sheet-evaluated splitAdjOpenPrice (col Q) into origOpenPriceAtCreationDate (col P)
    const addNvdaRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/transactions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2026-04-02',
          portfolioId: 'p1',
          ticker: 'NVDA',
          exchange: 'NASDAQ',
          type: 'BUY',
          originalQty: 10,
          originalPrice: 135,
          currency: 'USD',
        }),
      }),
      env,
      {}
    );
    expect(addNvdaRes.status).toBe(201);
    const addedNvda = await addNvdaRes.json();
    expect(addedNvda.transactions[0].origOpenPriceAtCreationDate).toBe(135.5);
    expect(sheetStore.sheet_123.sheets.Transaction_Log[4][15]).toBe(135.5);

    // 7. GET /portfolios populates non-empty holdings, drops empty holdings, and standardizes dates to YYYY-MM-DD
    const portsRes = await workerEntry.fetch(
      new Request('https://portfolios.noy-shai.workers.dev/agent/portfolios', {
        headers: { Authorization: `Bearer ${agentKey}` },
      }),
      env,
      {}
    );
    expect(portsRes.status).toBe(200);
    const portsJson = await portsRes.json();
    const p1 = portsJson.portfolios.find((p: any) => p.id === 'p1');
    const pEmpty = portsJson.portfolios.find((p: any) => p.id === 'p_empty');
    expect(p1.taxHistory.map((h: any) => h.startDate)).toEqual(['1970-01-01', '2026-03-11']);
    expect(p1.feeHistory.map((h: any) => h.startDate)).toEqual(['2026-03-11']);
    expect(p1.holdings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ticker: 'GOOG', exchange: 'NASDAQ', qty: 50 }),
        expect.objectContaining({ ticker: 'MTF.F96', exchange: 'TASE', qty: 75, numericId: 1181445 }),
        expect.objectContaining({ ticker: 'NVDA', exchange: 'NASDAQ', qty: 10 }),
      ])
    );
    expect(pEmpty.holdings).toBeUndefined();
  });

  it('prevents inflated 3m gains from ILS/ILA unit mismatches, missing history + DRIP/dividends, and broken Yahoo symbols', async () => {
    // 1. Yahoo symbol candidate parity for LSE, FWB, and TASE ETFs/indices
    expect(getWorkerYahooCandidates('BTEC', Exchange.LSE)).toEqual(['BTEC.L']);
    expect(getWorkerYahooCandidates('BTEC.L', Exchange.LSE)).toEqual(['BTEC.L']);
    expect(getWorkerYahooCandidates('HY9H', Exchange.FWB)).toEqual(['HY9H.F', 'HY9H.DE']);
    expect(getWorkerYahooCandidates('HY9H.F', Exchange.FWB)).toEqual(['HY9H.F']);
    expect(getWorkerYahooCandidates('MTF.F30', Exchange.TASE)).toEqual(['MTF-F30.TA']);
    expect(getWorkerYahooCandidates('MTF-F30', Exchange.TASE)).toEqual(['MTF-F30.TA']);
    expect(getWorkerYahooCandidates('142', Exchange.TASE)).toEqual(['TA35.TA']);
    expect(getWorkerYahooCandidates('137', Exchange.TASE)).toEqual(['^TA125.TA']);

    // 2. Yahoo TASE ETF with historical closes in ILS (240->250) and regularMarketPrice in ILA (25000)
    const nowSec = Math.floor(Date.now() / 1000);
    const threeMonthsAgoSec = nowSec - 90 * 86400;
    const oneMonthAgoSec = nowSec - 30 * 86400;
    const mockProxy = vi.fn(async (apiId: string) => {
      if (apiId === 'yahoo_hist') {
        return new Response(
          JSON.stringify({
            chart: {
              result: [
                {
                  meta: {
                    regularMarketPrice: 25000,
                    currency: 'ILA',
                    instrumentType: 'ETF',
                    shortName: 'TASE Test ETF',
                  },
                  timestamp: [threeMonthsAgoSec, oneMonthAgoSec, nowSec],
                  indicators: {
                    quote: [{ close: [240, 245, 250], open: [240, 245, 250] }],
                    adjclose: [{ adjclose: [240, 245, 250] }],
                  },
                },
              ],
            },
          }),
          { status: 200 }
        );
      }
      if (apiId === 'gemelnet_fund') {
        const dNow = new Date();
        const ym = (monthsBack: number) => {
          const d = new Date(Date.UTC(dNow.getUTCFullYear(), dNow.getUTCMonth() - monthsBack, 1));
          return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        };
        const xml = `<Root>
          <Row><ID_KUPA>1054</ID_KUPA><TKF_DIVUACH>${ym(4)}</TKF_DIVUACH><TSUA_NOMINALI_BFOAL>1.0</TSUA_NOMINALI_BFOAL></Row>
          <Row><ID_KUPA>1054</ID_KUPA><TKF_DIVUACH>${ym(3)}</TKF_DIVUACH><TSUA_NOMINALI_BFOAL>1.0</TSUA_NOMINALI_BFOAL></Row>
          <Row><ID_KUPA>1054</ID_KUPA><TKF_DIVUACH>${ym(2)}</TKF_DIVUACH><TSUA_NOMINALI_BFOAL>1.0</TSUA_NOMINALI_BFOAL></Row>
          <Row><ID_KUPA>1054</ID_KUPA><TKF_DIVUACH>${ym(1)}</TKF_DIVUACH><TSUA_NOMINALI_BFOAL>1.0</TSUA_NOMINALI_BFOAL></Row>
        </Root>`;
        return new Response(xml, { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const market = new WorkerMarketService(mockProxy);
    const etfData = await market.fetchYahooData('MTF.F30', Exchange.TASE, false);
    expect(etfData).not.toBeNull();
    // 25000 vs 24000 = +4.1667% (NOT +10,316%)
    expect(etfData!.changePct3m).toBeCloseTo((25000 - 24000) / 24000, 4);
    expect(etfData!.historical![0].price).toBe(24000);

    // 3. Gemel fund (reported in ILS) held in a portfolio where transaction currency is ILA:
    // Both currentPrice and historical series must be scaled consistently, avoiding a 100x (+10,000%) perf3m spike.
    const gemelData = await market.fetchTickerData('1054', Exchange.GEMEL, 1054, false);
    expect(gemelData).not.toBeNull();
    expect(gemelData!.changePct3m).toBeCloseTo(Math.pow(1.01, 3) - 1, 3);

    const oldDate = new Date(Date.now() - 400 * 86400 * 1000).toISOString().split('T')[0];
    const twoMonthsAgoDate = new Date(Date.now() - 50 * 86400 * 1000);
    const twoMonthsAgoStr = twoMonthsAgoDate.toISOString().split('T')[0];

    const engine = new FinanceEngine(
      [
        {
          id: 'p_il',
          name: 'IL Portfolio',
          currency: Currency.ILS,
          cgt: 0.25,
          incTax: 0,
          commRate: 0,
          commMin: 0,
          commMax: 0,
          divPolicy: 'cash_taxed',
          divCommRate: 0,
          taxPolicy: 'TAX_FREE',
          holdings: [],
        } as any,
      ],
      { current: { USD: 1, ILS: 3.65 } },
      null
    );

    engine.processEvents(
      [
        // Gemel holding bought 1+ year ago in ILA
        {
          date: oldDate,
          portfolioId: 'p_il',
          ticker: '1054',
          exchange: Exchange.GEMEL,
          type: 'BUY',
          originalQty: 1000,
          originalPrice: 10000,
          qty: 1000,
          price: 10000,
          currency: Currency.ILA,
        } as any,
        // Stock with a large 1-year-old lot + tiny 2-month-old buy, NO historical series, and a large quarterly dividend 2m ago
        {
          date: oldDate,
          portfolioId: 'p_il',
          ticker: 'NOHIST',
          exchange: Exchange.NASDAQ,
          type: 'BUY',
          originalQty: 1000,
          originalPrice: 100,
          qty: 1000,
          price: 100,
          currency: Currency.USD,
        } as any,
        {
          date: twoMonthsAgoStr,
          portfolioId: 'p_il',
          ticker: 'NOHIST',
          exchange: Exchange.NASDAQ,
          type: 'BUY',
          originalQty: 1,
          originalPrice: 100,
          qty: 1,
          price: 100,
          currency: Currency.USD,
        } as any,
      ],
      [
        {
          ticker: 'NOHIST',
          exchange: Exchange.NASDAQ,
          date: twoMonthsAgoDate,
          amount: 2.0, // $2,002 dividend across 1,001 shares!
          source: 'SHEET',
        },
      ]
    );

    engine.hydrateLivePrices(
      new Map<string, any>([
        ['GEMEL:1054', gemelData],
        [
          'NASDAQ:NOHIST',
          {
            ticker: 'NOHIST',
            exchange: Exchange.NASDAQ,
            price: 105,
            currency: Currency.USD,
            changePct3m: 0.05, // No historical array -> must fall back to 5%, NOT $2002 / $100 = +2,007%!
          },
        ],
      ])
    );
    engine.calculateSnapshot();

    const gemelHolding = engine.holdings.get('p_il_1054')!;
    expect(gemelHolding.perf3m!).toBeGreaterThan(0);
    expect(gemelHolding.perf3m!).toBeLessThan(0.1); // ~3%, never ~100x

    const noHistHolding = engine.holdings.get('p_il_NOHIST')!;
    expect(noHistHolding.perf3m).toBeCloseTo(0.05, 4); // Clean fallback, not +2000%
  });
});
