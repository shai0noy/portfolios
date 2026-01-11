/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, signIn } from '../google';
import { toGoogleSheetDateFormat } from '../date';
import type { Portfolio, Transaction } from '../types';
import { addTransaction, addPortfolio, ensureSchema, rebuildHoldingsSheet } from './api';

// Populate the spreadsheet with 3 sample portfolios and several transactions each
export const populateTestData = async (spreadsheetId: string) => {
    await ensureGapi();
    try { await signIn(); } catch (e) { console.error("Sign-in failed", e) }
    try { await ensureSchema(spreadsheetId); } catch (e) { console.error("Schema creation failed", e) }

    const portfolios: Portfolio[] = [
        { id: 'P-IL-GROWTH', name: 'Growth ILS', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0.001, commMin: 5, commMax: 0, currency: 'ILS', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'REAL_GAIN' },
        { id: 'P-USD-CORE', name: 'Core USD', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-RSU', name: 'RSU Account', cgt: 0.25, incTax: 0.5, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'USD', divPolicy: 'hybrid_rsu', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-GEMMEL', name: 'Gemmel', cgt: 0, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: 'ILS', divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'REAL_GAIN' }
    ];

    for (const p of portfolios) {
        try { await addPortfolio(spreadsheetId, p); } catch (e) { console.warn("Could not add portfolio (it might already exist)", e) }
    }

    const transactions: Transaction[] = [
        // P-IL-GROWTH Portfolio
        { date: '2025-02-01', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', Original_Qty: 100, Original_Price: 180, currency: 'ILS', comment: 'Initial buy Leumi', commission: 5, tax: 0, Source: 'MANUAL', Creation_Date: '2025-02-01', Orig_Open_Price_At_Creation_Date: 179.5, vestDate: '' },
        { date: '2025-02-15', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 10, currency: 'ILS', comment: 'Dividend payout', commission: 0, tax: 0.25, Source: 'MANUAL', Creation_Date: '2025-02-15', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '2025-06-10', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', Original_Qty: 50, Original_Price: 190, currency: 'ILS', comment: 'Add to Leumi', commission: 10, tax: 0, Source: 'BROKER_CSV', Creation_Date: '2025-06-10', Orig_Open_Price_At_Creation_Date: 189, vestDate: '' },
        { date: '2025-07-15', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'SELL', Original_Qty: 30, Original_Price: 200, currency: 'ILS', comment: 'Sell some Leumi', commission: 8, tax: 0.25, Source: 'MANUAL', Creation_Date: '2025-07-15', Orig_Open_Price_At_Creation_Date: 200, vestDate: '' },

        // P-USD-CORE Portfolio
        { date: '2025-03-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 10, Original_Price: 150, currency: 'USD', comment: 'Core buy', commission: 1, tax: 0, Source: 'MANUAL', Creation_Date: '2025-03-01', Orig_Open_Price_At_Creation_Date: 149, vestDate: '' },
        { date: '2025-08-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 5, currency: 'USD', comment: 'Quarterly dividend', commission: 0, tax: 0.25, Source: 'MANUAL', Creation_Date: '2025-08-01', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '2025-11-20', portfolioId: 'P-USD-CORE', ticker: 'META', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 5, Original_Price: 300, currency: 'USD', comment: 'Speculative buy', commission: 1, tax: 0, Source: 'MANUAL', Creation_Date: '2025-11-20', Orig_Open_Price_At_Creation_Date: 298, vestDate: '' },
        { date: '2025-11-21', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'SELL', Original_Qty: 5, Original_Price: 200, currency: 'USD', comment: 'Trim position', commission: 1, tax: 0.25, Source: 'MANUAL', Creation_Date: '2025-11-21', Orig_Open_Price_At_Creation_Date: 201, vestDate: '' },

        // P-RSU Portfolio (vesting GOOG shares)
        { date: '2025-04-10', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'BUY', Original_Qty: 10, Original_Price: 0.01, currency: 'USD', comment: 'RSU vested', commission: 0, tax: 0, Source: 'BROKER_CSV', Creation_Date: '2025-04-10', Orig_Open_Price_At_Creation_Date: 140, vestDate: '2025-04-10' },
        { date: '2025-07-10', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'DIVIDEND', Original_Qty: 1, Original_Price: 2, currency: 'USD', comment: 'RSU dividend', commission: 0, tax: 0.5, Source: 'BROKER_CSV', Creation_Date: '2025-07-10', Orig_Open_Price_At_Creation_Date: 0, vestDate: '' },
        { date: '2025-12-01', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'SELL', Original_Qty: 2, Original_Price: 155, currency: 'USD', comment: 'Sell vested RSUs for tax', commission: 1, tax: 0.25, Source: 'BROKER_CSV', Creation_Date: '2025-12-01', Orig_Open_Price_At_Creation_Date: 155, vestDate: '' },

        // P-GEMMEL Portfolio
        { date: '2025-04-01', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', Original_Qty: 100, Original_Price: 100, currency: 'ILS', comment: 'Gemmel buy 1', commission: 0, tax: 0, Source: 'MANUAL', Creation_Date: '2025-04-01', Orig_Open_Price_At_Creation_Date: 100, vestDate: '' },
        { date: '2025-05-01', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', Original_Qty: 50, Original_Price: 105, currency: 'ILS', comment: 'Gemmel buy 2', commission: 0, tax: 0, Source: 'MANUAL', Creation_Date: '2025-05-01', Orig_Open_Price_At_Creation_Date: 105, vestDate: '' },
    ];

    for (const t of transactions) {
        try { await addTransaction(spreadsheetId, t); } catch (e) { console.warn("Could not add transaction (it might already exist)", e) }
    }

    await rebuildHoldingsSheet(spreadsheetId);
    alert('Test data populated.');
};
