"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getValueColor = getValueColor;
/**
 * Returns the color key for a given value.
 * Positive values are green (success.main), negative values are red (error.main).
 * Zero values are default text color (text.primary).
 */
function getValueColor(value) {
    if (value === undefined || value === null || Math.abs(value) < 0.000001) {
        return 'text.primary';
    }
    return value > 0 ? 'success.main' : 'error.main';
}
