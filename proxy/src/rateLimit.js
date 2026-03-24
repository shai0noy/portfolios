const IP_LIMITS = new Map();
const SHORT_LIMIT = 120;
const SHORT_WINDOW = 5 * 60 * 1000; // 5 minutes
const LONG_LIMIT = 450;
const LONG_WINDOW = 12 * 60 * 60 * 1000; // 12 hours

export function checkRateLimit(ip) {
  if (!ip) return false;
  const now = Date.now();
  let record = IP_LIMITS.get(ip);

  if (!record) {
    record = {
      short: { count: 1, startTime: now },
      long: { count: 1, startTime: now }
    };
    IP_LIMITS.set(ip, record);
    return false;
  }

  // Check/Update Short window (5 mins)
  if (now - record.short.startTime > SHORT_WINDOW) {
    record.short.count = 1;
    record.short.startTime = now;
  } else {
    record.short.count++;
  }

  // Check/Update Long window (24 hours)
  if (now - record.long.startTime > LONG_WINDOW) {
    record.long.count = 1;
    record.long.startTime = now;
  } else {
    record.long.count++;
  }

  IP_LIMITS.set(ip, record);
  const shortBlocked = record.short.count > SHORT_LIMIT;
  const longBlocked = record.long.count > LONG_LIMIT;
  let retryAfter = 0;
  if (shortBlocked) retryAfter = Math.ceil((SHORT_WINDOW - (now - record.short.startTime)) / 1000);
  if (longBlocked) retryAfter = Math.max(retryAfter, Math.ceil((LONG_WINDOW - (now - record.long.startTime)) / 1000));

  return {
    allowed: !shortBlocked && !longBlocked,
    retryAfter: retryAfter > 0 ? retryAfter : 60, // fail-safe 60 if somehow calculated negative
    message: `Short window limit: ${record.short.count}/${SHORT_LIMIT} - renew in ${shortBlocked ? retryAfter : 0}s, Long window limit: ${record.long.count}/${LONG_LIMIT}`
  };
}
