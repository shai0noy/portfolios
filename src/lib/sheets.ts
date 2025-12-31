// src/lib/sheets.ts
import type { Portfolio, Transaction, LiveData } from './types';
import { ensureGapi, signIn } from './google'; // Import the waiter + signIn

const PORT_OPT_RANGE = 'Portfolio_Options!A2:M';
const TX_FETCH_RANGE = 'Transaction_Log!A2:L';
const LIVE_DATA_RANGE = 'Live_Data!A2:F';

// Helper to get Sheet ID by Name (needed for batchUpdate)
async function getSheetId(spreadsheetId: string, sheetName: string, create = false): Promise<number> {
  await ensureGapi(); // WAIT FOR GAPI
  const res = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  let sheet = res.result.sheets?.find((s: any) => s.properties.title === sheetName);
  if (!sheet && create) {
    const addSheetRequest = {
      spreadsheetId,
      resource: {
        requests: [{ addSheet: { properties: { title: sheetName } } }]
      }
    };
    const response = await window.gapi.client.sheets.spreadsheets.batchUpdate(addSheetRequest);
    const newSheetId = response.result.replies[0].addSheet.properties.sheetId;
    return newSheetId;
  }
  return sheet?.properties.sheetId || 0;
}

export const ensureSchema = async (spreadsheetId: string) => {
  await ensureGapi(); // WAIT FOR GAPI
  const sheetIds = {
    portfolio: await getSheetId(spreadsheetId, 'Portfolio_Options'),
    log: await getSheetId(spreadsheetId, 'Transaction_Log'),
    live: await getSheetId(spreadsheetId, 'Live_Data', true),
  };

  const batchUpdate = {
    spreadsheetId,
    resource: {
      requests: [
        // 1. Portfolio Options Headers
        {
          updateCells: {
            range: { sheetId: sheetIds.portfolio, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Portfolio_ID' } }, { userEnteredValue: { stringValue: 'Display_Name' } },
              { userEnteredValue: { stringValue: 'Cap_Gains_Tax_%' } }, { userEnteredValue: { stringValue: 'Income_Tax_Vest_%' } },
              { userEnteredValue: { stringValue: 'Mgmt_Fee_Val' } }, { userEnteredValue: { stringValue: 'Mgmt_Type' } }, { userEnteredValue: { stringValue: 'Mgmt_Freq' } },
              { userEnteredValue: { stringValue: 'Comm_Rate_%' } }, { userEnteredValue: { stringValue: 'Comm_Min' } }, { userEnteredValue: { stringValue: 'Comm_Max_Fee' } },
              { userEnteredValue: { stringValue: 'Currency' } }, { userEnteredValue: { stringValue: 'Div_Policy' } }, { userEnteredValue: { stringValue: 'Div_Comm_Rate_%' } }
            ] }],
            fields: 'userEnteredValue'
          }
        },
        // 2. Transaction Log Headers
        {
          updateCells: {
            range: { sheetId: sheetIds.log, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Date' } }, { userEnteredValue: { stringValue: 'Portfolio' } },
              { userEnteredValue: { stringValue: 'Ticker' } }, { userEnteredValue: { stringValue: 'Exchange' } },
              { userEnteredValue: { stringValue: 'Type' } }, { userEnteredValue: { stringValue: 'Qty' } },
              { userEnteredValue: { stringValue: 'Price' } }, 
              { userEnteredValue: { stringValue: 'Currency' } },
              { userEnteredValue: { stringValue: 'Vesting_Date' } }, { userEnteredValue: { stringValue: 'Comments' } },
              { userEnteredValue: { stringValue: 'Commission' } }, { userEnteredValue: { stringValue: 'Tax %' } }
            ] }],
            fields: 'userEnteredValue'
          }
        },
        // 3. Live Data Headers
        {
          updateCells: {
            range: { sheetId: sheetIds.live, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Ticker' } }, { userEnteredValue: { stringValue: 'Exchange' } },
              { userEnteredValue: { stringValue: 'Live_Price' } }, { userEnteredValue: { stringValue: 'Display_Name' } },
              { userEnteredValue: { stringValue: 'Currency' } },
              { userEnteredValue: { stringValue: 'Sector' } }
            ] }],
            fields: 'userEnteredValue'
          }
        }
      ]
    }
  };
  
  await window.gapi.client.sheets.spreadsheets.batchUpdate(batchUpdate);
};

export const fetchPortfolios = async (spreadsheetId: string): Promise<Portfolio[]> => {
  await ensureGapi(); // WAIT FOR GAPI
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PORT_OPT_RANGE,
  });
  
  const rows = res.result.values || [];
  return rows.map((r: any) => ({
    id: r[0], name: r[1],
    cgt: parseFloat(r[2]), incTax: parseFloat(r[3]),
    mgmtVal: parseFloat(r[4]), mgmtType: r[5], mgmtFreq: r[6],
    commRate: parseFloat(r[7]), commMin: parseFloat(r[8]), commMax: parseFloat(r[9]),
    currency: r[10], divPolicy: r[11], divCommRate: parseFloat(r[12])
  }));
};

export const fetchTransactions = async (spreadsheetId: string): Promise<Transaction[]> => {
  await ensureGapi();
  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: TX_FETCH_RANGE,
  });

  const rows = res.result.values || [];
  return rows.map((r: any) => ({
    date: r[0],
    portfolioId: r[1],
    ticker: r[2],
    exchange: r[3],
    type: r[4],
    qty: parseFloat(r[5]),
    price: parseFloat(r[6]),
    currency: r[7],
    vestDate: r[8],
    comment: r[9],
    commission: parseFloat(r[10]) || 0,
    tax: parseFloat(r[11]) || 0,
  }));
};

export const addPortfolio = async (spreadsheetId: string, p: Portfolio) => {
  await ensureGapi(); // WAIT FOR GAPI
  const row = [
    p.id, p.name, 
    p.cgt, p.incTax, 
    p.mgmtVal, p.mgmtType, p.mgmtFreq,
    p.commRate, p.commMin, p.commMax,
    p.currency, p.divPolicy, p.divCommRate
  ];
  
  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Portfolio_Options!A:M',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
};

export const addTransaction = async (spreadsheetId: string, t: Transaction) => {
  await ensureGapi(); // WAIT FOR GAPI
  const row = [
    t.date, t.portfolioId, t.ticker.toUpperCase(), t.exchange || '',
    t.type, t.qty, t.price, t.currency || '',
    t.vestDate || '', t.comment || '',
    t.commission || 0, t.tax || 0
  ];

  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Transaction_Log!A:L',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
};

export const syncAndFetchLiveData = async (spreadsheetId: string, transactions: Transaction[]): Promise<LiveData[]> => {
  await ensureGapi();
  const uniqueTickers = [...new Map(transactions.map(t => [`${t.ticker}:${t.exchange}`, t])).values()];

  const data = uniqueTickers.map((t, i) => ([
    t.ticker,
    t.exchange,
    `=GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "price")`,
    `=IFERROR(GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "name"), "")`,
    `=GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "currency")`,
    `=IFERROR(GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "sector"), "Other")`,
  ]));

  await window.gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Live_Data!A2:F' });
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Live_Data!A2',
    valueInputOption: 'USER_ENTERED',
    resource: { values: data }
  });

  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: LIVE_DATA_RANGE,
  });

  const rows = res.result.values || [];
  return rows.map((r: any) => ({
    ticker: r[0],
    exchange: r[1],
    price: parseFloat(r[2]),
    name: r[3],
    currency: r[4],
    sector: r[5],
  }));
};

// Populate the spreadsheet with 3 sample portfolios and several transactions each
export const populateTestData = async (spreadsheetId: string) => {
  await ensureGapi();
  // Ensure we have an access token / user consent before writing
  try { await signIn(); } catch (e) { /* user may have cancelled; continue and let writes fail with clear errors */ }
  // Ensure headers/formulas exist first
  try { await ensureSchema(spreadsheetId); } catch (e) { /* continue even if schema already exists */ }

  // Define three portfolios with different params
  const portfolios: Portfolio[] = [
    {
      id: 'P-IL-GROWTH', name: 'Growth ILS',
      cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
      commRate: 0.001, commMin: 5, commMax: 0, currency: 'ILS', divPolicy: 'cash_taxed', divCommRate: 0
    },
    {
      id: 'P-USD-CORE', name: 'Core USD',
      cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
      commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'cash_taxed', divCommRate: 0
    },
    {
      id: 'P-RSU', name: 'RSU Account',
      cgt: 0.25, incTax: 0.5, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
      commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'hybrid_rsu', divCommRate: 0
    }
  ];

  // Append portfolios
  for (const p of portfolios) {
    // ignore errors for duplicate appends
    try { await addPortfolio(spreadsheetId, p); } catch (e) { /* noop */ }
  }

  // Define a handful of transactions for each portfolio
  const transactions: Transaction[] = [
    // Growth ILS
    { date: '2025-01-02', portfolioId: 'P-IL-GROWTH', ticker: 'TASE1', exchange: 'TASE', type: 'BUY', qty: 100, price: 50, currency: 'ILS', comment: 'Initial buy' },
    { date: '2025-02-15', portfolioId: 'P-IL-GROWTH', ticker: 'TASE1', exchange: 'TASE', type: 'DIVIDEND', qty: 0, price: 0, currency: 'ILS', comment: 'Dividend payout' },
    { date: '2025-06-10', portfolioId: 'P-IL-GROWTH', ticker: 'TASE2', exchange: 'TASE', type: 'BUY', qty: 50, price: 200, currency: 'ILS', comment: 'Add position' },

    // Core USD
    { date: '2025-03-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'BUY', qty: 10, price: 150, currency: 'USD', comment: 'Core buy' },
    { date: '2025-08-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'DIVIDEND', qty: 0, price: 0, currency: 'USD', comment: 'Quarterly dividend' },
    { date: '2025-11-20', portfolioId: 'P-USD-CORE', ticker: 'TSLA', exchange: 'NASDAQ', type: 'BUY', qty: 5, price: 700, currency: 'USD', comment: 'Speculative buy' },
    { date: '2025-11-21', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'SELL', qty: 5, price: 200, currency: 'USD', comment: 'Quarterly dividend' },

    // RSU Account
    { date: '2025-04-10', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'BUY', qty: 200, price: 0.01, vestDate: '2025-04-10', currency: 'USD', comment: 'RSU vested' },
    { date: '2025-07-10', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'DIVIDEND', qty: 0, price: 0, currency: 'USD', comment: 'RSU dividend' },
    { date: '2025-12-01', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'SELL', qty: 50, price: 20, vestDate: '2099-01-01', currency: 'USD', comment: 'RSU unvested' }
  ];

  for (const t of transactions) {
    try { await addTransaction(spreadsheetId, t); } catch (e) { /* noop */ }
  }
  
  await syncAndFetchLiveData(spreadsheetId, transactions);
};
