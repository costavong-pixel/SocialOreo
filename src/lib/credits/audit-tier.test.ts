import { describe, expect, it } from "vitest";

import {
  FREE_AUDIT_REEL_LIMIT,
  PAID_AUDIT_REEL_LIMIT,
  PAID_AUDIT_CREDIT_COST,
  resolveAuditTier,
} from "./audit-tier";

describe("resolveAuditTier", () => {
  it("defaults to free tier with 7 reels when requestedTier is omitted", () => {
    expect(resolveAuditTier()).toEqual({
      tier: "free",
      reelLimit: FREE_AUDIT_REEL_LIMIT,
      creditCost: 0,
    });
  });

  it("assigns free tier with 7 reels when client requests free", () => {
    expect(resolveAuditTier("free")).toEqual({
      tier: "free",
      reelLimit: FREE_AUDIT_REEL_LIMIT,
      creditCost: 0,
    });
  });

  it("assigns paid tier with 30 reels when client requests paid", () => {
    expect(resolveAuditTier("paid")).toEqual({
      tier: "paid",
      reelLimit: PAID_AUDIT_REEL_LIMIT,
      creditCost: PAID_AUDIT_CREDIT_COST,
    });
  });

  it("does not auto-upgrade to paid based on account credits", () => {
    const tier = resolveAuditTier("free");
    expect(tier.tier).toBe("free");
    expect(tier.reelLimit).toBe(7);
    expect(tier.creditCost).toBe(0);
  });
});
