"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOwnedInPortfolios = getOwnedInPortfolios;
exports.getTaxRatesForDate = getTaxRatesForDate;
exports.getFeeRatesForDate = getFeeRatesForDate;
function getOwnedInPortfolios(symbol, portfolios, exchange) {
    if (!portfolios || portfolios.length === 0)
        return undefined;
    const owningPortfolios = portfolios.filter(p => p.holdings && p.holdings.some(h => h.ticker === symbol &&
        (!exchange || h.exchange === exchange)));
    return owningPortfolios.length > 0 ? owningPortfolios.map(p => p.name) : undefined;
}
function getTaxRatesForDate(p, date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    if (!p.taxHistory || p.taxHistory.length === 0) {
        return { cgt: p.cgt, incTax: p.incTax };
    }
    // Sort descending by date
    const sorted = [...p.taxHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const entry = sorted.find(h => new Date(h.startDate) <= d);
    if (entry) {
        return { cgt: entry.cgt, incTax: entry.incTax };
    }
    return { cgt: p.cgt, incTax: p.incTax };
}
function getFeeRatesForDate(p, date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    if (!p.feeHistory || p.feeHistory.length === 0) {
        return { mgmtVal: p.mgmtVal, mgmtType: p.mgmtType, mgmtFreq: p.mgmtFreq, divCommRate: p.divCommRate, commRate: p.commRate, commMin: p.commMin, commMax: p.commMax };
    }
    // Sort descending by date
    const sorted = [...p.feeHistory].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const entry = sorted.find(h => new Date(h.startDate) <= d);
    if (entry) {
        return {
            mgmtVal: entry.mgmtVal, mgmtType: entry.mgmtType, mgmtFreq: entry.mgmtFreq, divCommRate: entry.divCommRate,
            commRate: entry.commRate ?? p.commRate,
            commMin: entry.commMin ?? p.commMin,
            commMax: entry.commMax ?? p.commMax
        };
    }
    return { mgmtVal: p.mgmtVal, mgmtType: p.mgmtType, mgmtFreq: p.mgmtFreq, divCommRate: p.divCommRate, commRate: p.commRate, commMin: p.commMin, commMax: p.commMax };
}
