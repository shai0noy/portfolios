/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureGapi, signIn } from '../google';
import { Currency, type Portfolio, type Transaction } from '../types';
import { addPortfolio, ensureSchema, batchAddTransactions } from './api';

// Populate the spreadsheet with 3 sample portfolios and several transactions each
export const populateTestData = async (spreadsheetId: string) => {
    await ensureGapi();
    try { await signIn(); } catch (e) { console.error("Sign-in failed", e) }
    try { await ensureSchema(spreadsheetId); } catch (e) { console.error("Schema creation failed", e) }

    const portfolios: Portfolio[] = [
        { id: 'P-IL-GROWTH', name: 'Growth ILS', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0.001, commMin: 5, commMax: 0, currency: Currency.ILS, divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'REAL_GAIN' },
        { id: 'P-USD-CORE', name: 'Core USD', cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: Currency.USD, divPolicy: 'cash_taxed', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-RSU', name: 'RSU Account', cgt: 0.25, incTax: 0.5, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: Currency.USD, divPolicy: 'hybrid_rsu', divCommRate: 0, taxPolicy: 'NOMINAL_GAIN' },
        { id: 'P-GEMMEL', name: 'Gemmel', cgt: 0, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, currency: Currency.ILS, divPolicy: 'accumulate_tax_free', divCommRate: 0, taxPolicy: 'TAX_FREE' }
    ];

    for (const p of portfolios) {
        try { await addPortfolio(spreadsheetId, p); } catch (e) { console.warn("Could not add portfolio (it might already exist)", e) }
    }

    const transactions: Transaction[] = [
        // P-IL-GROWTH Portfolio - TASE stocks now use ILA currency and Agorot prices (1.80 ILS = 180 ILA)
        // Commission is entered in ILS (5) but will be converted to Agorot (500) by batchAddTransactions logic
        { date: '2025-02-01', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', originalQty: 100, originalPrice: 18000, currency: Currency.ILA, comment: 'Initial buy Leumi (180 ILS)', commission: 5, tax: 0, source: 'MANUAL', creationDate: '2025-02-01', origOpenPriceAtCreationDate: 17950, vestDate: '' },
        { date: '2025-02-15', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'DIVIDEND', originalQty: 1, originalPrice: 1000, currency: Currency.ILA, comment: 'Dividend payout (10 ILS)', commission: 0, tax: 0.25, source: 'MANUAL', creationDate: '2025-02-15', origOpenPriceAtCreationDate: 0, vestDate: '' },
        { date: '2025-06-10', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'BUY', originalQty: 50, originalPrice: 19000, currency: Currency.ILA, comment: 'Add to Leumi (190 ILS)', commission: 10, tax: 0, source: 'BROKER_CSV', creationDate: '2025-06-10', origOpenPriceAtCreationDate: 18900, vestDate: '' },
        { date: '2025-07-15', portfolioId: 'P-IL-GROWTH', ticker: '604611', exchange: 'TASE', type: 'SELL', originalQty: 30, originalPrice: 20000, currency: Currency.ILA, comment: 'Sell some Leumi (200 ILS)', commission: 8, tax: 0.25, source: 'MANUAL', creationDate: '2025-07-15', origOpenPriceAtCreationDate: 20000, vestDate: '' },

        // P-USD-CORE Portfolio
        { date: '2025-03-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'BUY', originalQty: 10, originalPrice: 150, currency: Currency.USD, comment: 'Core buy', commission: 1, tax: 0, source: 'MANUAL', creationDate: '2025-03-01', origOpenPriceAtCreationDate: 149, vestDate: '' },
        { date: '2025-08-01', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'DIVIDEND', originalQty: 1, originalPrice: 5, currency: Currency.USD, comment: 'Quarterly dividend', commission: 0, tax: 0.25, source: 'MANUAL', creationDate: '2025-08-01', origOpenPriceAtCreationDate: 0, vestDate: '' },
        { date: '2025-11-20', portfolioId: 'P-USD-CORE', ticker: 'META', exchange: 'NASDAQ', type: 'BUY', originalQty: 5, originalPrice: 300, currency: Currency.USD, comment: 'Speculative buy', commission: 1, tax: 0, source: 'MANUAL', creationDate: '2025-11-20', origOpenPriceAtCreationDate: 298, vestDate: '' },
        { date: '2025-11-21', portfolioId: 'P-USD-CORE', ticker: 'AAPL', exchange: 'NASDAQ', type: 'SELL', originalQty: 5, originalPrice: 200, currency: Currency.USD, comment: 'Trim position', commission: 1, tax: 0.25, source: 'MANUAL', creationDate: '2025-11-21', origOpenPriceAtCreationDate: 201, vestDate: '' },

        // P-RSU Portfolio (vesting GOOG shares)
        { date: '2025-04-10', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'BUY', originalQty: 10, originalPrice: 0.01, currency: Currency.USD, comment: 'RSU vested', commission: 0, tax: 0, source: 'BROKER_CSV', creationDate: '2025-04-10', origOpenPriceAtCreationDate: 140, vestDate: '2025-04-10' },
        { date: '2025-07-10', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'DIVIDEND', originalQty: 1, originalPrice: 2, currency: Currency.USD, comment: 'RSU dividend', commission: 0, tax: 0.5, source: 'BROKER_CSV', creationDate: '2025-07-10', origOpenPriceAtCreationDate: 0, vestDate: '' },
        { date: '2025-12-01', portfolioId: 'P-RSU', ticker: 'GOOG', exchange: 'NASDAQ', type: 'SELL', originalQty: 2, originalPrice: 155, currency: Currency.USD, comment: 'Sell vested RSUs for tax', commission: 1, tax: 0.25, source: 'BROKER_CSV', creationDate: '2025-12-01', origOpenPriceAtCreationDate: 155, vestDate: '' },

        // P-GEMMEL Portfolio
        { date: '2025-04-01', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', originalQty: 100, originalPrice: 100, currency: Currency.ILS, comment: 'Gemmel buy 1', commission: 0, tax: 0, source: 'MANUAL', creationDate: '2025-04-01', origOpenPriceAtCreationDate: 100, vestDate: '' },
        { date: '2025-05-01', portfolioId: 'P-GEMMEL', ticker: '123456', exchange: 'IL_FUND', type: 'BUY', originalQty: 50, originalPrice: 105, currency: Currency.ILS, comment: 'Gemmel buy 2', commission: 0, tax: 0, source: 'MANUAL', creationDate: '2025-05-01', origOpenPriceAtCreationDate: 105, vestDate: '' },
    ];

    try { 
        await batchAddTransactions(spreadsheetId, transactions); 
    } catch (e) { 
        console.warn("Could not batch add transactions", e); 
    }

    alert('Test data populated.');
};