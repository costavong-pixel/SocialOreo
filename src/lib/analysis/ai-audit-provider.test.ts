import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeAuditWithAi } from "./ai-audit-provider";

vi.mock("./deepseek-audit-provider", () => ({
  analyzeAuditWithDeepSeek: vi.fn(async () => {
    throw new Error("DeepSeek unavailable");
  }),
}));

vi.mock("./openai-audit-provider", () => ({
  analyzeAuditWithOpenAI: vi.fn(async () => ({
    overallScore: 80,
    subScores: {
      hookScore: 70,
      retentionSetup: 70,
      captionScore: 70,
      ctaScore: 70,
      postingPattern: 70,
      audienceFit: 70,
      goalFit: 70,
      viralAngleStrength: 70,
      salesConversionStrength: 70,
    },
    summary: { headline: "Test", diagnosis: "Test diagnosis" },
    strengths: ["Strong hooks"],
    weaknesses: ["Weak CTA"],
    actionPlan: ["a", "b", "c", "d", "e", "f", "g"],
    angleRecommendations: [{ angleName: "Test", reason: "Test", hook: "Test hook" }],
    readyToPostHooks: ["Hook"],
    readyToPostScripts: ["Script"],
    ctaOptions: ["CTA"],
    captionPack: ["Caption"],
    hashtagPack: ["#test"],
  })),
}));

const sampleInput = {
  campaignBrief: {
    occasion: "product_launch",
    goal: "sales" as const,
    niche: "food",
    targetAudience: "Local diners",
    offerOrCta: "Book tonight",
    tone: "direct" as const,
  },
  auditData: {
    profile: {
      platform: "instagram" as const,
      provider: "apify" as const,
      profileUrl: "https://www.instagram.com/example/",
    },
    videos: [],
  },
  trustedAngles: [],
};

describe("analyzeAuditWithAi", () => {
  afterEach(() => {
    vi.clearAllMocks();
    process.env.AI_PROVIDER_PRIMARY = "deepseek";
    process.env.AI_PROVIDER_BACKUP = "openai";
  });

  it("falls back from DeepSeek to OpenAI", async () => {
    const result = await analyzeAuditWithAi(sampleInput);
    expect(result.overallScore).toBe(80);
  });
});
