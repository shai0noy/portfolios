"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiCurrencyValue = void 0;
const types_1 = require("../types");
/**
 * A class to hold values in multiple currencies and perform arithmetic operations.
 * This can be used as a base for Money-like structures or for aggregating values.
 */
class MultiCurrencyValue {
    constructor(valUSD = 0, valILS = 0) {
        this.valUSD = valUSD;
        this.valILS = valILS;
        // Add other core currencies if needed, or maintain a map for extensibility
        // For now, we focus on USD and ILS as primary system currencies
    }
    static from(valUSD, valILS) {
        return new MultiCurrencyValue(valUSD, valILS);
    }
    static zero() {
        return new MultiCurrencyValue(0, 0);
    }
    add(other) {
        return new MultiCurrencyValue(this.valUSD + other.valUSD, this.valILS + other.valILS);
    }
    sub(other) {
        return new MultiCurrencyValue(this.valUSD - other.valUSD, this.valILS - other.valILS);
    }
    // Scale by a scalar
    scale(factor) {
        return new MultiCurrencyValue(this.valUSD * factor, this.valILS * factor);
    }
    get(currency) {
        if (currency === types_1.Currency.USD)
            return this.valUSD;
        if (currency === types_1.Currency.ILS)
            return this.valILS;
        // Fallback or error?
        // For now, assume these are the only two "Hard" currencies we track explicitly here.
        return 0;
    }
}
exports.MultiCurrencyValue = MultiCurrencyValue;
