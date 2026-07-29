import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeAuditWithOpenAI } from "./openai-audit-provider";

const mockCreateCompletion = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function MockOpenAI() {
    return {
      chat: {
        completions: {
          create: mockCreateCompletion,
        },
      },
    };
  }),
}));

const validAnalysis = {
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
  summary: { headline: "Strong profile", diagnosis: "The profile fits the campaign." },
  strengths: ["Clear hooks"],
  weaknesses: ["CTA can be sharper"],
  actionPlan: ["a", "b", "c", "d", "e", "f", "g"],
  angleRecommendations: [{ angleName: "Hot take", reason: "Fits the brief", hook: "Try this" }],
  readyToPostHooks: ["Hook"],
  readyToPostScripts: ["Script"],
  ctaOptions: ["CTA"],
  captionPack: ["Caption"],
  hashtagPack: ["test"],
};

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
      profileUrl: "https://www.instagram.com/tatiannatt/",
      username: "tatiannatt",
    },
    videos: [
      {
        platform: "instagram" as const,
        provider: "apify" as const,
        url: "https://www.instagram.com/p/example/",
        caption: "Example reel",
        hashtags: [],
        mentions: [],
      },
    ],
  },
  trustedAngles: [],
};

function completionWithAnalysis() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(validAnalysis),
        },
      },
    ],
  };
}

describe("analyzeAuditWithOpenAI", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("retries with the default model when a configured model no longer exists", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5.5-mini";

    mockCreateCompletion
      .mockRejectedValueOnce(new Error("404 The model `gpt-5.5-mini` does not exist or you do not have access to it."))
      .mockResolvedValueOnce(completionWithAnalysis());

    const result = await analyzeAuditWithOpenAI(sampleInput);

    expect(result.overallScore).toBe(80);
    expect(mockCreateCompletion).toHaveBeenCalledTimes(2);
    expect(mockCreateCompletion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: "gpt-5.5-mini" }),
    );
    expect(mockCreateCompletion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        max_completion_tokens: 4096,
        model: "gpt-5.6-luna",
      }),
    );
    expect(mockCreateCompletion).not.toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096 }));
  });

  it("does not retry unrelated OpenAI failures", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5.6-luna";

    mockCreateCompletion.mockRejectedValueOnce(new Error("429 rate limit exceeded"));

    await expect(analyzeAuditWithOpenAI(sampleInput)).rejects.toThrow("429 rate limit exceeded");
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
  });
});
