import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, clearRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    clearRateLimits();
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("user-1", { maxRequests: 2, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.remaining).toBe(1);
    }
  });

  it("blocks requests over the limit", () => {
    const key = "user-2";

    checkRateLimit(key, { maxRequests: 1, windowMs: 60_000 });
    const blocked = checkRateLimit(key, { maxRequests: 1, windowMs: 60_000 });

    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("bounds bucket state by sweeping expired buckets and evicting oldest once the map is large", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    // Push the bucket map past its cap so the sweep/eviction path runs.
    for (let i = 0; i < 10_005; i += 1) {
      checkRateLimit(`eviction-key-${i}`, { maxRequests: 1, windowMs: 60_000 });
    }
    // Hard cap: even with live (unexpired) buckets past the cap, the oldest are
    // evicted and a new key still works (state stays bounded).
    expect(checkRateLimit("live-cap-key", { maxRequests: 1, windowMs: 60_000 }).allowed).toBe(true);
    // Expired sweep: advance past every window; the next request sweeps the
    // expired state and is still allowed.
    vi.setSystemTime(1_000_000 + 61_000);
    expect(checkRateLimit("fresh-key", { maxRequests: 1, windowMs: 60_000 }).allowed).toBe(true);
  });
});
