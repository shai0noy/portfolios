"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatForexSymbol = formatForexSymbol;
function formatForexSymbol(rawSymbol) {
    if (!rawSymbol)
        return rawSymbol;
    const upper = rawSymbol.toUpperCase();
    // Logic: if FOREX ticker len from globes is 5 or more and contains USD or ILS - split it
    if (upper.length >= 5 && (upper.includes('USD') || upper.includes('ILS'))) {
        // If already hyphenated, assume correct
        if (upper.includes('-'))
            return upper;
        // Split logic: Where to split?
        // Common pairs are 3-3. 
        // If 6 chars, split in middle.
        if (upper.length === 6) {
            return `${upper.slice(0, 3)}-${upper.slice(3)}`;
        }
        // For other lengths >= 5, just return as is for now unless we have specific rules
        return upper;
    }
    // Otherwise, append -USD
    // Check if already has suffix to avoid double appending
    if (upper.endsWith('-USD'))
        return upper;
    return `${upper}-USD`;
}
