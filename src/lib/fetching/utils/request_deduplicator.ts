const pendingRequests = new Map<string, Promise<any>>();

export function deduplicateRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (pendingRequests.has(key)) {
    // console.log(`[Deduplicator] Reusing pending request for ${key}`);
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}
