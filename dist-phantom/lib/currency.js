"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExchangeRates = getExchangeRates;
const index_1 = require("./sheets/index");
__exportStar(require("./currencyUtils"), exports);
const CACHE_KEY = 'exchangeRates_v2';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
async function getExchangeRates(sheetId) {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                console.log('Using cached exchange rates');
                return parsed.data;
            }
        }
        const rates = await (0, index_1.fetchSheetExchangeRates)(sheetId);
        // Save to cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: rates
        }));
        return rates;
    }
    catch (error) {
        console.error('Error fetching exchange rates from sheet:', error);
        // Fallback to cache if available even if expired
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            console.warn('Network failed, using expired cache');
            return JSON.parse(cached).data;
        }
        // Fallback defaults
        return { current: { USD: 1, ILS: 3.65, EUR: 0.92 } };
    }
}
