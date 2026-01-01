// src/lib/sheets.ts
import type { Portfolio, Transaction, LiveData } from './types';
import { ensureGapi, signIn } from './google'; 
import { getTickerData } from './ticker';

const PORT_OPT_RANGE = 'Portfolio_Options!A2:M';
const TX_FETCH_RANGE = 'Transaction_Log!A2:L';
// Adjusted range for new columns: Ticker, Exchange, Price, Name_En, Name_He, Currency, Sector, Change, Price_Unit
const LIVE_DATA_RANGE = 'Live_Data!A2:I'; 
const CONFIG_RANGE = 'System_Config!A2:B'; // Renamed

// Helper to get Sheet ID by Name
async function getSheetId(spreadsheetId: string, sheetName: string, create = false): Promise<number> {
  await ensureGapi(); 
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
  await ensureGapi(); 
  const sheetIds = {
    portfolio: await getSheetId(spreadsheetId, 'Portfolio_Options'),
    log: await getSheetId(spreadsheetId, 'Transaction_Log'),
    live: await getSheetId(spreadsheetId, 'Live_Data', true),
    config: await getSheetId(spreadsheetId, 'System_Config', true),
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
        // 3. Live Data Headers (Updated)
        {
          updateCells: {
            range: { sheetId: sheetIds.live, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Ticker' } }, 
              { userEnteredValue: { stringValue: 'Exchange' } },
              { userEnteredValue: { stringValue: 'Live_Price' } }, 
              { userEnteredValue: { stringValue: 'Name_En' } },
              { userEnteredValue: { stringValue: 'Name_He' } },
              { userEnteredValue: { stringValue: 'Currency' } },
              { userEnteredValue: { stringValue: 'Sector' } },
              { userEnteredValue: { stringValue: 'Day_Change_%' } },
              { userEnteredValue: { stringValue: 'Price_Unit' } } // New Column
            ] }],
            fields: 'userEnteredValue'
          }
        },
        // 4. Config Sheet Headers
        {
          updateCells: {
            range: { sheetId: sheetIds.config, startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Key' } }, { userEnteredValue: { stringValue: 'Value' } }
            ] }],
            fields: 'userEnteredValue'
          }
        }
      ]
    }
  };
  
  await window.gapi.client.sheets.spreadsheets.batchUpdate(batchUpdate);

  // Initial Config Data
  const initialConfig = [
    ['USDILS', '=GOOGLEFINANCE("CURRENCY:USDILS")'],
    ['EURUSD', '=GOOGLEFINANCE("CURRENCY:EURUSD")'],
    ['GBPUSD', '=GOOGLEFINANCE("CURRENCY:GBPUSD")'],
    ['ILSUSD', '=GOOGLEFINANCE("CURRENCY:ILSUSD")']
  ];

  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'System_Config!A2',
    valueInputOption: 'USER_ENTERED',
    resource: { values: initialConfig }
  });
};

export const fetchPortfolios = async (spreadsheetId: string): Promise<Portfolio[]> => {
  await ensureGapi(); 
  try {
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
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    return [];
  }
};

export const fetchTransactions = async (spreadsheetId: string): Promise<Transaction[]> => {
  await ensureGapi();
  try {
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
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
};

export const addPortfolio = async (spreadsheetId: string, p: Portfolio) => {
  await ensureGapi(); 
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

export const updatePortfolio = async (spreadsheetId: string, p: Portfolio) => {
  await ensureGapi();
  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: PORT_OPT_RANGE,
  });

  const rows = res.result.values || [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === p.id) {
      rowIndex = i + 2; // +2 because sheets are 1-indexed and we skip the header
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error(`Portfolio with ID ${p.id} not found`);
  }

  const row = [
    p.id, p.name,
    p.cgt, p.incTax,
    p.mgmtVal, p.mgmtType, p.mgmtFreq,
    p.commRate, p.commMin, p.commMax,
    p.currency, p.divPolicy, p.divCommRate
  ];

  const range = `Portfolio_Options!A${rowIndex}:M${rowIndex}`;
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: range,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
};

export const addTransaction = async (spreadsheetId: string, t: Transaction) => {
  await ensureGapi(); 
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

// ONLY fetch live data from the sheet (fast)
export const fetchLiveData = async (spreadsheetId: string): Promise<LiveData[]> => {
  await ensureGapi();
  try {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LIVE_DATA_RANGE,
    });

    const rows = res.result.values || [];
    return rows.map((r: any) => ({
      ticker: r[0],
      exchange: r[1],
      price: parseFloat(r[2]),
      name: r[3], // Name En
      name_he: r[4], // Name He
      currency: r[5],
      sector: r[6],
      changePct: parseFloat(r[7]),
      priceUnit: r[8] || 'base',
    }));
  } catch (error) {
    console.error('Error fetching live data:', error);
    return [];
  }
};

// Rebuild live data sheet with new formulas AND enriched metadata (slow, expensive)
export const rebuildLiveData = async (spreadsheetId: string, transactions: Transaction[]) => {
  await ensureGapi();
  const uniqueTickers = [...new Map(transactions.map(t => [`${t.ticker}:${t.exchange}`, t])).values()];

  // Fetch enriched metadata client-side (e.g. from Globes/Yahoo via proxy)
  // This satisfies "Save english display name and Hebrew name" requirement
  const enrichedData = await Promise.all(uniqueTickers.map(async (t) => {
     let meta = null;
     if (t.ticker && t.exchange) {
       try {
         meta = await getTickerData(t.ticker, t.exchange);
       } catch (e) {
         console.warn(`Failed to fetch metadata for ${t.ticker}`, e);
       }
     }
     return { t, meta };
  }));

  const data = enrichedData.map(({ t, meta }, i) => ([
    t.ticker,
    t.exchange,
    `=GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "price")`, // Live Price (Formula)
    meta?.name || `=IFERROR(GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "name"), "")`, // Name En (Value preferred, fallback to formula)
    meta?.name_he || "", // Name He (Value)
    `=GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "currency")`, // Currency (Formula)
    `=IFERROR(GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "sector"), "Other")`, // Sector (Formula)
    `=IFERROR(GOOGLEFINANCE(B${i+2}&":"&A${i+2}, "changepct")/100, 0)`, // Change (Formula)
    meta?.priceUnit || 'base',
  ]));

  await window.gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Live_Data!A2:I' });
  if (data.length > 0) {
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Live_Data!A2',
      valueInputOption: 'USER_ENTERED',
      resource: { values: data }
    });
  }
};

// Kept for backward compatibility
export const syncAndFetchLiveData = async (spreadsheetId: string, transactions: Transaction[]): Promise<LiveData[]> => {
  await rebuildLiveData(spreadsheetId, transactions);
  return await fetchLiveData(spreadsheetId);
};

export const fetchSheetExchangeRates = async (spreadsheetId: string): Promise<Record<string, number>> => {
  await ensureGapi();
  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: CONFIG_RANGE,
  });
  
  const rows = res.result.values || [];
  const rates: Record<string, number> = { USD: 1 };
  
  rows.forEach((r: any) => {
    const pair = r[0]; 
    const val = parseFloat(r[1]);
    
    if (pair && !isNaN(val)) {
      if (pair.startsWith('USD') && pair.length === 6) {
        const target = pair.substring(3);
        rates[target] = val; 
      } else if (pair.endsWith('USD') && pair.length === 6) {
        const source = pair.substring(0, 3);
        rates[source] = 1/val;
      }
    }
  });
  
  return rates;
};

// Populate the spreadsheet with 3 sample portfolios and several transactions each
export const populateTestData = async (spreadsheetId: string) => {
  await ensureGapi();
  try { await signIn(); } catch (e) { /* noop */ }
  try { await ensureSchema(spreadsheetId); } catch (e) { /* noop */ }

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

  for (const p of portfolios) {
    try { await addPortfolio(spreadsheetId, p); } catch (e) { /* noop */ }
  }

  const transactions: Transaction[] = [
    { date: '2025-01-02', portfolioId: 'P-IL-GROWTH', ticker: 'TASE1', exchange: 'TASE', type: 'BUY', qty: 100, price: 50, grossValue: 5000, currency: 'ILS', comment: 'Initial buy' },
    { date: '2025-02-15', portfolioId: 'P-IL-GROWTH', ticker: 'TASE1', exchange: 'TASE', type: 'DIVIDEND', qty: 0, price: 0, grossValue: 50, currency: 'ILS', comment: 'Dividend payout' },
    { date: '2025-06-10', portfolioId: 'P-IL-GROWTH', ticker: 'TASE2', exchange: 'TASE', type: 'BUY', qty: 50, price: 200, grossValue: 10000, currency: 'ILS', comment: 'Add position' },
    { date: '2025-03-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'BUY', qty: 10, price: 150, grossValue: 1500, currency: 'USD', comment: 'Core buy' },
    { date: '2025-08-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'DIVIDEND', qty: 0, price: 0, grossValue: 5, currency: 'USD', comment: 'Quarterly dividend' },
    { date: '2025-11-20', portfolioId: 'P-USD-CORE', ticker: 'TSLA', exchange: 'NASDAQ', type: 'BUY', qty: 5, price: 700, grossValue: 3500, currency: 'USD', comment: 'Speculative buy' },
    { date: '2025-11-21', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'SELL', qty: 5, price: 200, grossValue: 1000, currency: 'USD', comment: 'Quarterly dividend' },
    { date: '2025-04-10', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'BUY', qty: 200, price: 0.01, grossValue: 2, vestDate: '2025-04-10', currency: 'USD', comment: 'RSU vested' },
    { date: '2025-07-10', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'DIVIDEND', qty: 0, price: 0, grossValue: 20, currency: 'USD', comment: 'RSU dividend' },
    { date: '2025-12-01', portfolioId: 'P-RSU', ticker: 'COMP', exchange: 'NASDAQ', type: 'SELL', qty: 50, price: 20, grossValue: 1000, vestDate: '2099-01-01', currency: 'USD', comment: 'RSU unvested' }
  ];

  for (const t of transactions) {
    try { await addTransaction(spreadsheetId, t); } catch (e) { /* noop */ }
  }
  
  await syncAndFetchLiveData(spreadsheetId, transactions);
};
