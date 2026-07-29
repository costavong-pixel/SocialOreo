import { afterEach, describe, expect, it } from "vitest";

import { FREE_AUDIT_REEL_LIMIT, PAID_AUDIT_REEL_LIMIT, resolveAuditTier } from "@/lib/credits/audit-tier";
import { evaluateAuditGuards } from "@/lib/audit/audit-guards";
import { clearRateLimits } from "@/lib/rate-limit/rate-limit";

describe("evaluateAuditGuards", () => {
  afterEach(() => {
    clearRateLimits();
  });

  it("blocks invalid URLs before rate checks", () => {
    const result = evaluateAuditGuards({
      url: "https://example.com/profile",
      rateLimitKey: "audit-invalid-url",
      auditTier: resolveAuditTier("paid"),
    });

    expect(result).toEqual({
      allowed: false,
      stage: "url_validation",
      message: "SocialOreo currently supports Instagram and TikTok profile URLs.",
    });
  });

  it("allows free tier audits with server-side 7 reel cap", () => {
    const auditTier = resolveAuditTier("free");
    const result = evaluateAuditGuards({
      url: "https://www.instagram.com/example/",
      rateLimitKey: "audit-free",
      auditTier,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.auditTier.tier).toBe("free");
      expect(result.auditTier.reelLimit).toBe(FREE_AUDIT_REEL_LIMIT);
    }
  });

  it("allows paid tier audits with server-side 30 reel cap", () => {
    const auditTier = resolveAuditTier("paid");
    const result = evaluateAuditGuards({
      url: "https://www.instagram.com/example/",
      rateLimitKey: "audit-paid",
      auditTier,
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.auditTier.tier).toBe("paid");
      expect(result.auditTier.reelLimit).toBe(PAID_AUDIT_REEL_LIMIT);
    }
  });

  it("allows TikTok profile audits with the same server-side caps", () => {
    const result = evaluateAuditGuards({
      url: "https://www.tiktok.com/@creator",
      rateLimitKey: "audit-tiktok-free",
      auditTier: resolveAuditTier("free"),
    });

    expect(result).toMatchObject({ allowed: true, platform: "tiktok" });
  });
});
