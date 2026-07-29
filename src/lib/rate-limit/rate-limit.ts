type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  maxRequests?: number;
  windowMs?: number;
};

export type RateLimitResult =
  | {
      allowed: true;
      remaining: number;
      resetAt: number;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      resetAt: number;
    };

const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_MS = 60_000;

const buckets = new Map<string, RateLimitBucket>();

export function checkRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt,
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function clearRateLimits(): void {
  buckets.clear();
}
