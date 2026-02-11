"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logIfFalsy = logIfFalsy;
function logIfFalsy(value, message, details) {
    if (!value) {
        console.warn(`FALSY value detected: ${message}`, { value, details });
    }
    return value;
}
