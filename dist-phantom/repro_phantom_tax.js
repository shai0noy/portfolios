"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("./lib/data/engine");
const types_1 = require("./lib/types");
// Mock Data
const RATES = {
    current: { USD: 4.0, ILS: 1.0, EUR: 4.5 },
    historical: {
        '2023-01-01': { USD: 3.5, ILS: 1.0 },
        '2024-01-01': { USD: 4.0, ILS: 1.0 }
    }
};
const PORTFOLIO = {
    id: 'p_phantom',
    name: 'Phantom Test',
    currency: 'ILS',
    isTaxable: true,
    cgt: 0.25,
    incTax: 0.25,
    divPolicy: 'cash_taxed',
    taxPolicy: 'NOMINAL_GAIN',
    holdings: []
};
PORTFOLIO.holdings = [
    { ticker: 'USD_LOSS', exchange: 'NASDAQ', currency: 'USD', portfolioId: PORTFOLIO.id, qty: 1, numericId: 1 }
];
const buyDate = new Date('2023-01-01');
const engine = new engine_1.FinanceEngine([PORTFOLIO], RATES, null);
// 1. Buy 1 Share at $100 (Rate 3.5) -> Cost 350 ILS
engine.processEvents([
    {
        numericId: 1,
        date: buyDate.toISOString(),
        ticker: 'USD_LOSS',
        exchange: types_1.Exchange.NASDAQ,
        type: 'BUY',
        qty: 1,
        price: 100, // USD
        currency: 'USD',
        portfolioId: PORTFOLIO.id,
        originalPrice: 100,
        originalPriceUSD: 100,
        originalPriceILA: 35000,
        originalQty: 1
    }
], []);
// 2. Mock Current Price: $90 (Rate 4.0) -> Value 360 ILS
const priceMap = new Map();
priceMap.set('NASDAQ:USD_LOSS', { price: 90, currency: 'USD' });
engine.hydrateLivePrices(priceMap);
engine.calculateSnapshot();
const h = engine.holdings.get('p_phantom_USD_LOSS');
console.log(`\n--- Phantom Tax Debug Test ---`);
console.log(`Scenario: USD Loss, ILS Gain (Phantom Tax)`);
console.log(`Cost USD: ${h?.costBasisVested.amount ? h.costBasisVested.amount / 3.5 : '?'}`); // Approx
console.log(`Value USD: ${h?.marketValueVested.amount}`);
console.log(`Unrealized Gain USD (PC): ${h?.unrealizedGain.amount}`);
console.log(`Unrealized Tax Liability ILS: ${h?.unrealizedTaxLiabilityILS}`);
console.log(`Unrealized Tax Liability USD (approx): ${(h?.unrealizedTaxLiabilityILS || 0) / 4.0}`);
// Expectation: Tax Liability <= 0.
