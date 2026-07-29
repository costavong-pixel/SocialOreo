import { describe, expect, it } from "vitest";

import { createAuditSchema } from "@/lib/audit/create-audit-schema";

const validBrief = {
  occasion: "product_launch",
  goal: "sales",
  niche: "food",
  targetAudience: "Local diners",
  offerOrCta: "Book tonight",
  tone: "direct",
};

describe("POST /api/audits request schema", () => {
  it("rejects client attempts to mark an audit paid via isPaidAudit", () => {
    const result = createAuditSchema.safeParse({
      url: "https://www.instagram.com/example/",
      campaignBrief: validBrief,
      isPaidAudit: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects client attempts to request 30 free reels via reelLimit", () => {
    const result = createAuditSchema.safeParse({
      url: "https://www.instagram.com/example/",
      campaignBrief: validBrief,
      reelLimit: 30,
    });

    expect(result.success).toBe(false);
  });

  it("rejects client attempts to set creditCost", () => {
    const result = createAuditSchema.safeParse({
      url: "https://www.instagram.com/example/",
      campaignBrief: validBrief,
      creditCost: 0,
    });

    expect(result.success).toBe(false);
  });

  it("accepts requestedTier free or paid", () => {
    expect(
      createAuditSchema.safeParse({
        url: "https://www.instagram.com/example/",
        campaignBrief: validBrief,
        requestedTier: "free",
      }).success,
    ).toBe(true);

    expect(
      createAuditSchema.safeParse({
        url: "https://www.instagram.com/example/",
        campaignBrief: validBrief,
        requestedTier: "paid",
      }).success,
    ).toBe(true);
  });

  it("trims the submitted Instagram URL", () => {
    const result = createAuditSchema.safeParse({
      url: "  https://www.instagram.com/example/  ",
      campaignBrief: validBrief,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://www.instagram.com/example/");
    }
  });

  it("defaults tier intent when requestedTier is omitted", () => {
    const result = createAuditSchema.safeParse({
      url: "https://www.instagram.com/example/",
      campaignBrief: validBrief,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedTier).toBeUndefined();
    }
  });
});
