"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const model_1 = require("./data/model");
const types_1 = require("./types");
(0, vitest_1.describe)('Unvested Lot Exclusion', () => {
    const rates = {
        current: { USD: 1, ILS: 4.0 }
    };
    (0, vitest_1.it)('should exclude unvested lots from gain calculation', () => {
        const h = new model_1.Holding('p1', 'AAPL', types_1.Exchange.NASDAQ, types_1.Currency.USD, types_1.Currency.ILS);
        // 1. Vested Lot (Bought before period)
        const vestedLot = {
            id: 'l1', ticker: 'AAPL', date: new Date('2024-01-01'), qty: 10,
            costPerUnit: { amount: 100, currency: types_1.Currency.USD },
            costTotal: { amount: 1000, currency: types_1.Currency.USD },
            feesBuy: { amount: 0, currency: types_1.Currency.USD },
            cpiAtBuy: 100, isVested: true, originalTxnId: 't1'
        };
        // 2. Unvested Lot (Granted during period - checked via date, but filter should rely on isVested)
        // If included, this would have 0 cost basis (Initial = 0) and high Final Value -> Huge Gain
        const unvestedLot = {
            id: 'l2', ticker: 'AAPL', date: new Date('2026-02-05'), qty: 10,
            costPerUnit: { amount: 0, currency: types_1.Currency.USD },
            costTotal: { amount: 0, currency: types_1.Currency.USD },
            feesBuy: { amount: 0, currency: types_1.Currency.USD },
            cpiAtBuy: 100, isVested: false, originalTxnId: 't2'
        };
        h._lots = [vestedLot, unvestedLot];
        h.currentPrice = 110; // 10% gain on vested
        const provider = (ticker) => ({
            historical: [
                { date: new Date('2026-02-01'), price: 100 },
                { date: new Date('2026-02-11'), price: 110 }
            ]
        });
        const startDate = new Date('2026-02-04'); // Start of period
        // Vested lot held through. Initial = 10 * 100 = 1000. Final = 10 * 110 = 1100. Gain = 100.
        // Unvested lot: If included, it's "Bought" on Feb 5 (during period).
        // Initial = Cost = 0. Final = 10 * 110 = 1100.
        // If included, Total Gain = 100 + 1100 = 1200.
        // If excluded, Total Gain = 100.
        const res = h.generateGainForPeriod(startDate, provider, rates);
        (0, vitest_1.expect)(res.gain.valUSD).toBe(100);
        (0, vitest_1.expect)(res.initialValue.valUSD).toBe(1000);
        (0, vitest_1.expect)(res.finalValue.valUSD).toBe(1100);
    });
});
