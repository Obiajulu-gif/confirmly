/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Suitable for a single serverless instance / demo scale. For multi-region
 * production traffic, swap the store for Redis or Upstash — the call sites
 * only depend on `rateLimit()`.
 */

interface Bucket {
  hits: number[];
}

const store = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    store.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }

  bucket.hits.push(now);
  store.set(key, bucket);
  // Opportunistic cleanup to bound memory.
  if (store.size > 10_000) {
    for (const [k, b] of store) {
      if (b.hits.every((t) => now - t >= windowMs)) store.delete(k);
    }
  }
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

/** Test helper. */
export function resetRateLimits() {
  store.clear();
}
