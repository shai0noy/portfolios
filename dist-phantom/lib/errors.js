"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionExpiredError = void 0;
class SessionExpiredError extends Error {
    constructor(message) {
        super(message);
        this.name = "SessionExpiredError";
    }
}
exports.SessionExpiredError = SessionExpiredError;
