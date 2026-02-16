
import { test } from 'vitest';
import { Currency, ExchangeRates } from './types';

// Mock Exchange Rates
const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 }, // 1 USD = 4 ILS
    ago1m: { USD: 1, ILS: 3.5 }
};

// Helper to simulate convertCurrency
function convertCurrency(amount: number, from: string, to: string, rates: ExchangeRates): number {
    if (from === to) return amount;
    const rateFrom = rates.current[from as keyof typeof rates.current] || 1;
    const rateTo = rates.current[to as keyof typeof rates.current] || 1;
    // Base is USD
    const inUSD = (from === 'USD') ? amount : amount / rateFrom;
    const result = (to === 'USD') ? inUSD : inUSD * rateTo;
    return result;
}

// Logic to Test (Simulating HoldingDetails.tsx logic)
interface Layer {
    remainingQty: number;
    remainingCost: number;
    currentValue: number;
}

function calculateLayer(
    lot: { qty: number, costTotal: { amount: number, currency: string, valUSD?: number, valILS?: number } },
    currentPrice: number,
    stockCurrency: string,
    displayCurrency: string,
    rates: ExchangeRates
): Layer {
    const layer: Layer = { remainingQty: lot.qty, remainingCost: 0, currentValue: 0 };

    // --- LOGIC UNDER TEST (The Fix) ---
    let addedCost = 0;
    if (displayCurrency === Currency.ILS && lot.costTotal.valILS) {
        addedCost = lot.costTotal.valILS;
    } else if (displayCurrency === Currency.USD && lot.costTotal.valUSD) {
        addedCost = lot.costTotal.valUSD;
    } else {
        addedCost = convertCurrency(lot.costTotal.amount, lot.costTotal.currency, displayCurrency, rates);
    }
    layer.remainingCost += addedCost;
    // ----------------------------------

    const valSC = lot.qty * currentPrice;
    layer.currentValue += convertCurrency(valSC, stockCurrency, displayCurrency, rates);

    return layer;
}

// Tests
function testUnrealizedGainLogic() {
    console.log('\n--- Test: Unrealized Gain Logic (Nominal Gain in ILS) ---');

    // Scenario: Bought 10 AAPL @ $100 when 1 USD = 3.5 ILS.
    // Cost Total = $1000.
    // Book Cost ILS = 3500 ILS.
    // Book Cost USD = $1000.
    
    // Now: Price = $110. 1 USD = 4.0 ILS.
    // Value USD = $1100.
    // Value ILS = $1100 * 4 = 4400 ILS.

    // Expected Gain USD: $1100 - $1000 = $100.
    // Expected Gain ILS: 4400 - 3500 = 900 ILS. (Nominal Gain)

    const lot = {
        qty: 10,
        costTotal: {
            amount: 1000,
            currency: 'USD',
            valUSD: 1000,
            valILS: 3500 // Historical cost
        }
    };

    const currentPrice = 110;
    const stockCurrency = 'USD';

    // Test ILS Display
    const layerILS = calculateLayer(lot, currentPrice, stockCurrency, 'ILS', mockRates);
    const gainILS = layerILS.currentValue - layerILS.remainingCost;

    console.log(`ILS: Value ${layerILS.currentValue} - Cost ${layerILS.remainingCost} = Gain ${gainILS}`);
    
    if (Math.abs(gainILS - 900) < 0.01) {
        console.log('✅ PASS: ILS Gain is correct (Nominal 900)');
    } else {
        console.error(`❌ FAIL: ILS Gain is ${gainILS}, expected 900`);
        throw new Error('ILS Gain Mismatch');
    }

    // Test USD Display
    const layerUSD = calculateLayer(lot, currentPrice, stockCurrency, 'USD', mockRates);
    const gainUSD = layerUSD.currentValue - layerUSD.remainingCost;

    console.log(`USD: Value ${layerUSD.currentValue} - Cost ${layerUSD.remainingCost} = Gain ${gainUSD}`);

    if (Math.abs(gainUSD - 100) < 0.01) {
        console.log('✅ PASS: USD Gain is correct (100)');
    } else {
        console.error(`❌ FAIL: USD Gain is ${gainUSD}, expected 100`);
        throw new Error('USD Gain Mismatch');
    }
}

function run() {
    try {
        testUnrealizedGainLogic();
        console.log('\n🎉 Holding Calculation Tests Passed!');
    } catch (e) {
        console.error('\n💥 Tests Failed');
        process.exit(1);
    }
}

test('Holding Calculations', () => {
    run();
});
