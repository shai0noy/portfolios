"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DASHBOARD_COLUMNS = void 0;
exports.getDefaultColumnVisibility = getDefaultColumnVisibility;
exports.getColumnDisplayNames = getColumnDisplayNames;
exports.DASHBOARD_COLUMNS = [
    { key: 'displayName', labelEn: 'Display Name', labelHe: 'שם תצוגה', defaultVisible: true, sortKey: 'ticker' }, // Sort by ticker default? Table uses ticker for display name sort
    { key: 'ticker', labelEn: 'Ticker', labelHe: 'סימול', defaultVisible: true },
    { key: 'type', labelEn: 'Type', labelHe: 'סוג', defaultVisible: true },
    { key: 'sector', labelEn: 'Sector', labelHe: 'סקטור', defaultVisible: true },
    { key: 'qty', labelEn: 'Quantity', labelHe: 'כמות', defaultVisible: true, numeric: true },
    { key: 'avgCost', labelEn: 'Avg Unit Cost', labelHe: 'עלות ממוצעת ליחידה', defaultVisible: true, numeric: true },
    { key: 'currentPrice', labelEn: 'Current Unit Price', labelHe: 'מחיר נוכחי ליחידה', defaultVisible: true, numeric: true },
    { key: 'costBasis', labelEn: 'Cost Basis', labelHe: 'עלות מקורית', defaultVisible: true, numeric: true },
    { key: 'weight', labelEn: 'Weight', labelHe: 'משקל', defaultVisible: true, numeric: true },
    { key: 'dayChangeVal', labelEn: 'Day Change $', labelHe: 'שינוי יומי', defaultVisible: true, numeric: true },
    { key: 'dayChangePct', labelEn: 'Day Change %', labelHe: '% שינוי יומי', defaultVisible: true, numeric: true },
    { key: 'mv', labelEn: 'Market Value', labelHe: 'שווי שוק', defaultVisible: true, sortKey: 'marketValue', numeric: true },
    { key: 'unvestedValue', labelEn: 'Unvested Value', labelHe: 'שווי לא מובשל', defaultVisible: false, sortKey: 'mvUnvested', numeric: true },
    { key: 'unrealizedGain', labelEn: 'Unrealized Gain', labelHe: 'רווח לא ממומש', defaultVisible: true, numeric: true },
    { key: 'unrealizedGainPct', labelEn: 'Unrealized Gain %', labelHe: '% רווח לא ממומש', defaultVisible: true, numeric: true },
    { key: 'realizedGain', labelEn: 'Realized Gain', labelHe: 'רווח ממומש', defaultVisible: true, numeric: true },
    { key: 'realizedGainPct', labelEn: 'Realized Gain %', labelHe: '% רווח ממומש', defaultVisible: true, numeric: true },
    { key: 'realizedGainAfterTax', labelEn: 'Realized Gain After Tax', labelHe: 'רווח ממומש נטו', defaultVisible: true, numeric: true },
    { key: 'totalGain', labelEn: 'Total Gain', labelHe: 'רווח כולל', defaultVisible: true, numeric: true },
    { key: 'totalGainPct', labelEn: 'Total Gain %', labelHe: '% רווח כולל', defaultVisible: true, numeric: true },
    { key: 'valueAfterTax', labelEn: 'Value After Tax', labelHe: 'שווי אחרי מס', defaultVisible: true, numeric: true },
];
function getDefaultColumnVisibility() {
    return exports.DASHBOARD_COLUMNS.reduce((acc, col) => {
        acc[col.key] = col.defaultVisible;
        return acc;
    }, {});
}
function getColumnDisplayNames(t) {
    return exports.DASHBOARD_COLUMNS.reduce((acc, col) => {
        acc[col.key] = t(col.labelEn, col.labelHe);
        return acc;
    }, {});
}
