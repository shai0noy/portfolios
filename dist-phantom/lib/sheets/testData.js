"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.populateTestData = exports.TEST_TRANSACTIONS = void 0;
const types_1 = require("../types");
const api_1 = require("./api");
exports.TEST_TRANSACTIONS = [
    // P1: US Portfolio (USD)
    // AAPL: Buy 10 @ 100 USD (2020). Split 4:1 (2020). Sell 10 @ 150 USD (2021).
    // Note: To test split logic in sheet, we enter Pre-Split.
    // However, for simplicity here, we assume standard flow.
    // Let's use clean data.
    // 1. Buy AAPL. 10 shares @ 100 USD. Date: 2020-01-01.
    { date: '2020-01-01', portfolioId: 'p1', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 10, originalPrice: 100, currency: types_1.Currency.USD, commission: 0, source: 'TEST' },
    // 2. Buy MSFT. 5 shares @ 200 USD. Date: 2020-02-01.
    { date: '2020-02-01', portfolioId: 'p1', ticker: 'MSFT', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 5, originalPrice: 200, currency: types_1.Currency.USD, commission: 0, source: 'TEST' },
    // 3. Sell AAPL. 5 shares @ 150 USD. Date: 2021-01-01.
    { date: '2021-01-01', portfolioId: 'p1', ticker: 'AAPL', exchange: types_1.Exchange.NASDAQ, type: 'SELL', originalQty: 5, originalPrice: 150, currency: types_1.Currency.USD, commission: 0, source: 'TEST' },
    // 4. Dividend AAPL. 1 USD. Date: 2021-06-01.
    // { date: '2021-06-01', portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ, type: 'DIVIDEND', originalQty: 5, originalPrice: 1, currency: Currency.USD, commission: 0, source: 'TEST' },
    // P2: IL Portfolio (ILS)
    // TA35: Buy 100 @ 1500 ILA (15 ILS). Date: 2020-01-01.
    { date: '2020-01-01', portfolioId: 'p2', ticker: 'TA35', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1500, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p2', ticker: '1159250', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1500, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p2', ticker: '1111111', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1500, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p2', ticker: '5111111', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1500, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    // P3: RSU (USD)
    // Grant: 10 units. Price 0 (or FMV). Vest 2022-01-01.
    { date: '2021-01-01', portfolioId: 'p3', ticker: 'GOOG', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 10, originalPrice: 0, currency: types_1.Currency.USD, vestDate: '2022-01-01', commission: 0, source: 'TEST' },
    { date: '2021-01-01', portfolioId: 'p3', ticker: 'AMZN', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 10, originalPrice: 0, currency: types_1.Currency.USD, vestDate: '2022-01-01', commission: 0, source: 'TEST' },
    { date: '2021-01-01', portfolioId: 'p3', ticker: 'MSFT', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 10, originalPrice: 0, currency: types_1.Currency.USD, vestDate: '2022-01-01', commission: 0, source: 'TEST' },
    { date: '2021-01-01', portfolioId: 'p3', ticker: 'META', exchange: types_1.Exchange.NASDAQ, type: 'BUY', originalQty: 10, originalPrice: 0, currency: types_1.Currency.USD, vestDate: '2022-01-01', commission: 0, source: 'TEST' },
    // P4: Hishtalmut (ILS) - Tax Free
    { date: '2020-01-01', portfolioId: 'p4', ticker: '5122013', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1000, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p4', ticker: '5111111', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1000, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p4', ticker: '1159250', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1000, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    // P5: Pension (ILS) - Pension Tax
    { date: '2020-01-01', portfolioId: 'p5', ticker: '5122013', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1000, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
    { date: '2020-01-01', portfolioId: 'p5', ticker: '5111111', exchange: types_1.Exchange.TASE, type: 'BUY', originalQty: 100, originalPrice: 1000, currency: types_1.Currency.ILA, commission: 0, source: 'TEST' },
];
const populateTestData = async (sheetId) => {
    await (0, api_1.batchAddTransactions)(sheetId, exports.TEST_TRANSACTIONS);
};
exports.populateTestData = populateTestData;
