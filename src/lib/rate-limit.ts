// Fixed-window in-memory rate limiter for the EA routes. Per-process only: on
// serverless each instance gets its own window and cold starts reset it, so
// this is a guard against runaway EA loops hammering the DB, not a hard global
// quota. If a real fleet ever needs one, swap in a shared store (e.g. Upstash
// Ratelimit) behind the same check() signature.

export type RateLimitConfig = { limit: number; windowMs: number };

export function createRateLimiter(config: RateLimitConfig) {
  const windows = new Map<string, { windowStart: number; count: number }>();

  function sweep(now: number) {
    for (const [key, entry] of windows) {
      if (now - entry.windowStart >= config.windowMs) windows.delete(key);
    }
  }

  return function check(key: string, now = Date.now()): boolean {
    const entry = windows.get(key);
    if (!entry || now - entry.windowStart >= config.windowMs) {
      // Keep the map bounded even if callers spray unique keys.
      if (windows.size >= 10_000) sweep(now);
      windows.set(key, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= config.limit;
  };
}
