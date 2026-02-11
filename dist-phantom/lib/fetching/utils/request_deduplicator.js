"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateRequest = deduplicateRequest;
const pendingRequests = new Map();
function deduplicateRequest(key, fetcher) {
    if (pendingRequests.has(key)) {
        // console.log(`[Deduplicator] Reusing pending request for ${key}`);
        return pendingRequests.get(key);
    }
    const promise = fetcher().finally(() => {
        pendingRequests.delete(key);
    });
    pendingRequests.set(key, promise);
    return promise;
}
