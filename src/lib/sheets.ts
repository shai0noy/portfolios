// src/lib/sheets.ts
import type { Portfolio, Transaction, CalculatedTransaction } from './types';
import { ensureGapi } from './google'; // Import the waiter

const PORT_OPT_RANGE = 'Portfolio_Options!A2:M';
const TX_FETCH_RANGE = 'Transaction_Log!A2:L'; // Fetch up to col L (Net Value)

export const ensureSchema = async (spreadsheetId: string) => {
  await ensureGapi(); // WAIT FOR GAPI
  const batchUpdate = {
    spreadsheetId,
    resource: {
      requests: [
        // 1. Portfolio Options Headers
        {
          updateCells: {
            range: { sheetId: await getSheetId(spreadsheetId, 'Portfolio_Options'), startRowIndex: 0, endRowIndex: 1 },
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
        // 2. Transaction Log Headers + FORMULAS (Col K & L)
        {
          updateCells: {
            range: { sheetId: await getSheetId(spreadsheetId, 'Transaction_Log'), startRowIndex: 0, endRowIndex: 1 },
            rows: [{ values: [
              { userEnteredValue: { stringValue: 'Date' } }, { userEnteredValue: { stringValue: 'Portfolio' } },
              { userEnteredValue: { stringValue: 'Ticker' } }, { userEnteredValue: { stringValue: 'Exchange' } },
              { userEnteredValue: { stringValue: 'Type' } }, { userEnteredValue: { stringValue: 'Qty' } },
              { userEnteredValue: { stringValue: 'Price' } }, { userEnteredValue: { stringValue: 'Gross_Value' } },
              { userEnteredValue: { stringValue: 'Vesting_Date' } }, { userEnteredValue: { stringValue: 'Comments' } },
              // INJECTING THE MAGIC FORMULAS HERE
              { userEnteredValue: { formulaValue: `=LET(header,"Commission",port_col,B2:B,type_col,E2:E,val_col,H2:H,config_range,Portfolio_Options!A:M,calc,MAP(port_col,type_col,val_col,LAMBDA(port,type,val,IF(port="","",IF(OR(type="BUY",type="SELL"),LET(rate,XLOOKUP(port,Portfolio_Options!A:A,Portfolio_Options!H:H,0),min_fee,XLOOKUP(port,Portfolio_Options!A:A,Portfolio_Options!I:I,0),max_fee,XLOOKUP(port,Portfolio_Options!A:A,Portfolio_Options!J:J,0),raw_fee,val*rate,clamped_min,MAX(raw_fee,min_fee),final_fee,IF(max_fee>0,MIN(clamped_min,max_fee),clamped_min),final_fee),IF(type="DIVIDEND",XLOOKUP(port,Portfolio_Options!A:A,Portfolio_Options!M:M,0)*val,0))))),VSTACK(header,calc))` } },
              { userEnteredValue: { formulaValue: `={"Net_Value"; ARRAYFORMULA(IF(B2:B="",,IF(E2:E="BUY",(H2:H*-1)-K2:K,IF(E2:E="SELL",H2:H-K2:K,IF(E2:E="DIVIDEND",H2:H-K2:K,0)))))`} }
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

export const fetchTransactions = async (spreadsheetId: string): Promise<CalculatedTransaction[]> => {
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
    grossValue: parseFloat(r[7]),
    vestDate: r[8],
    comment: r[9],
    commission: parseFloat(r[10]) || 0,
    netValue: parseFloat(r[11]) || 0
  }));
};
 

// Helper to get Sheet ID by Name (needed for batchUpdate)
async function getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
  await ensureGapi(); // WAIT FOR GAPI
  const res = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.result.sheets?.find((s: any) => s.properties.title === sheetName);
  return sheet?.properties.sheetId || 0;
}

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
    t.type, t.qty, t.price, t.grossValue,
    t.vestDate || '', t.comment || ''
  ];

  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Transaction_Log!A:J',
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
};