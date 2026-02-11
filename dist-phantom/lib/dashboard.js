"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateDashboardSummary = exports.INITIAL_SUMMARY = void 0;
exports.useDashboardData = useDashboardData;
const react_1 = require("react");
const loader_1 = require("./data/loader");
const errors_1 = require("./errors");
const SessionContext_1 = require("./SessionContext");
// import { convertCurrency, calculatePerformanceInDisplayCurrency } from './currencyUtils'; // Unused
const engine_1 = require("./data/engine");
Object.defineProperty(exports, "INITIAL_SUMMARY", { enumerable: true, get: function () { return engine_1.INITIAL_SUMMARY; } });
// import type { Lot, DividendRecord } from './data/model'; // Unused
// import type { Transaction } from './types'; // Unused
const dashboard_calc_1 = require("./dashboard_calc");
Object.defineProperty(exports, "calculateDashboardSummary", { enumerable: true, get: function () { return dashboard_calc_1.calculateDashboardSummary; } });
function useDashboardData(sheetId) {
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [holdings, setHoldings] = (0, react_1.useState)([]);
    const [exchangeRates, setExchangeRates] = (0, react_1.useState)({ current: { USD: 1, ILS: 3.7 } });
    const [portfolios, setPortfolios] = (0, react_1.useState)([]);
    const [hasFutureTxns, setHasFutureTxns] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const { showLoginModal } = (0, SessionContext_1.useSession)();
    const [engine, setEngine] = (0, react_1.useState)(null);
    const loadData = (0, react_1.useCallback)(async (force = false) => {
        if (!sheetId)
            return;
        setLoading(true);
        setError(null);
        try {
            const eng = await (0, loader_1.loadFinanceEngine)(sheetId, force);
            setEngine(eng);
            setPortfolios(Array.from(eng.portfolios.values()));
            setExchangeRates(eng.exchangeRates);
            const today = new Date();
            // Use the new getter for transactions in FinanceEngine
            const future = eng.transactions.some(t => new Date(t.date) > today);
            setHasFutureTxns(future);
            setHoldings(Array.from(eng.holdings.values()));
            return eng;
        }
        catch (e) {
            console.error('loadData error:', e);
            if (e instanceof errors_1.SessionExpiredError) {
                setError('session_expired');
                showLoginModal();
            }
            else
                setError(e);
        }
        finally {
            setLoading(false);
        }
    }, [sheetId, showLoginModal]);
    (0, react_1.useEffect)(() => { loadData(); }, [loadData]);
    return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: (force = false) => loadData(force), engine };
}
