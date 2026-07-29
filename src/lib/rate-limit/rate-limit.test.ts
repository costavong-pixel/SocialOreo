import { afterEach, describe, expect, it } from "vitest";

import { checkRateLimit, clearRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  afterEach(() => {
    clearRateLimits();
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
});
