import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SocialProviderError } from "@/lib/providers/social/types";

const mockSyncUser = vi.fn();
const mockConsumeCredit = vi.fn();
const mockRefundCredit = vi.fn();
const mockClaimFreeAllowance = vi.fn();
const mockRestoreFreeAllowance = vi.fn();
const mockFetchSocialAudit = vi.fn();
const mockAnalyzeAuditWithAi = vi.fn();
const mockCreateRunningAuditJob = vi.fn();
const mockAuditJobUpdate = vi.fn();
const mockProviderCallLogCreate = vi.fn();
const mockRequireAdmin = vi.fn();
const mockEnqueueTranscriptEnrichment = vi.fn();

vi.mock("@/lib/auth/sync-user", () => ({
  syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args),
}));

vi.mock("@/lib/auth/roles", () => ({
  requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock("@/lib/credits/consume-credit", () => ({
  consumeCreditForAudit: (...args: unknown[]) => mockConsumeCredit(...args),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  refundAuditCredit: (...args: unknown[]) => mockRefundCredit(...args),
}));

vi.mock("@/lib/credits/free-audit-allowance", () => ({
  claimFreeAuditAllowance: (...args: unknown[]) => mockClaimFreeAllowance(...args),
  restoreFreeAuditAllowance: (...args: unknown[]) => mockRestoreFreeAllowance(...args),
  FreeAuditAllowanceExhaustedError: class FreeAuditAllowanceExhaustedError extends Error {},
}));

vi.mock("@/lib/audit/audit-running-guard", () => ({
  AuditAlreadyRunningError: class AuditAlreadyRunningError extends Error {},
  createRunningAuditJob: (...args: unknown[]) => mockCreateRunningAuditJob(...args),
}));

vi.mock("@/lib/audit/transcript-enrichment", () => ({
  enqueueTranscriptEnrichment: (...args: unknown[]) => mockEnqueueTranscriptEnrichment(...args),
}));

vi.mock("@/lib/providers/social/provider-router", () => ({
  fetchSocialAudit: (...args: unknown[]) => mockFetchSocialAudit(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditJob: {
      update: (...args: unknown[]) => mockAuditJobUpdate(...args),
    },
    providerCallLog: {
      create: (...args: unknown[]) => mockProviderCallLogCreate(...args),
    },
    angleLibrary: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    socialProfile: { create: vi.fn() },
    socialVideo: { createMany: vi.fn() },
    auditReport: { create: vi.fn() },
  },
}));

vi.mock("@/lib/analysis/ai-audit-provider", () => ({
  analyzeAuditWithAi: (...args: unknown[]) => mockAnalyzeAuditWithAi(...args),
}));

vi.mock("@/lib/rate-limit/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

const validBrief = {
  occasion: "product_launch",
  goal: "sales",
  niche: "food",
  targetAudience: "Local diners",
  offerOrCta: "Book tonight",
  tone: "direct",
};

const baseInput = {
  authUserId: "auth0-1",
  email: "creator@example.com",
  url: "https://www.instagram.com/example/",
  campaignBrief: validBrief,
};

const socialAuditResult = {
  profile: {
    platform: "instagram",
    provider: "apify",
    username: "example",
    displayName: "Example",
    profileUrl: "https://www.instagram.com/example/",
    bio: "",
    followerCount: 100,
    followingCount: 50,
    postCount: 12,
    profileImageUrl: null,
    rawProviderPayload: {},
  },
  videos: [],
};

describe("createAndRunAudit tier and allowance policy", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mockSyncUser.mockResolvedValue({ id: "user-db-1" });
    mockCreateRunningAuditJob.mockResolvedValue({ id: "audit-job-1" });
    mockAuditJobUpdate.mockResolvedValue({});
    mockProviderCallLogCreate.mockResolvedValue({});
    mockRequireAdmin.mockResolvedValue(false);
    mockEnqueueTranscriptEnrichment.mockResolvedValue(undefined);
    mockFetchSocialAudit.mockRejectedValue(
      new SocialProviderError("provider_failed", "Provider unavailable."),
    );
    mockAnalyzeAuditWithAi.mockRejectedValue(new Error("AI unavailable"));
  });

  it("allows accounts with credits to choose free and never consumes credit", async () => {
    mockClaimFreeAllowance.mockResolvedValue(undefined);

    const { createAndRunAudit } = await import("./run-audit");

    await createAndRunAudit({
      ...baseInput,
      requestedTier: "free",
    });

    expect(mockClaimFreeAllowance).toHaveBeenCalledWith("user-db-1");
    expect(mockConsumeCredit).not.toHaveBeenCalled();
  });

  it("allows admins to run unlimited free audits without consuming the allowance", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const { createAndRunAudit } = await import("./run-audit");

    await createAndRunAudit({
      ...baseInput,
      requestedTier: "free",
    });

    expect(mockClaimFreeAllowance).not.toHaveBeenCalled();
    expect(mockConsumeCredit).not.toHaveBeenCalled();
  });

  it("consumes exactly one credit for paid choice", async () => {
    mockConsumeCredit.mockResolvedValue({ ledgerEntryId: "ledger-1", newBalance: 0 });

    const { createAndRunAudit } = await import("./run-audit");

    await createAndRunAudit({
      ...baseInput,
      requestedTier: "paid",
    });

    expect(mockConsumeCredit).toHaveBeenCalledWith("user-db-1", 1, "audit-job-1");
    expect(mockClaimFreeAllowance).not.toHaveBeenCalled();
  });

  it("refunds a consumed credit when a paid audit fails", async () => {
    mockConsumeCredit.mockResolvedValue({ ledgerEntryId: "ledger-1", newBalance: 0 });

    const { createAndRunAudit } = await import("./run-audit");

    const result = await createAndRunAudit({
      ...baseInput,
      requestedTier: "paid",
    });

    expect(result.ok).toBe(false);
    expect(mockRefundCredit).toHaveBeenCalledWith("user-db-1", 1, "audit-job-1", "ledger-1");
  });

  it("restores free allowance when a free audit fails", async () => {
    mockClaimFreeAllowance.mockResolvedValue(undefined);

    const { createAndRunAudit } = await import("./run-audit");

    const result = await createAndRunAudit({
      ...baseInput,
      requestedTier: "free",
    });

    expect(result.ok).toBe(false);
    expect(mockRestoreFreeAllowance).toHaveBeenCalledWith("user-db-1");
    expect(mockRefundCredit).not.toHaveBeenCalled();
  });

  it("logs social provider failures against the social provider", async () => {
    const { createAndRunAudit } = await import("./run-audit");

    await createAndRunAudit(baseInput);

    expect(mockProviderCallLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "apify",
        endpointOrActor: "apify-instagram",
        status: "failed",
        errorMessage: "provider_failed",
      }),
    });
  });

  it("logs AI failures separately after the social provider succeeds", async () => {
    mockFetchSocialAudit.mockResolvedValue(socialAuditResult);
    mockAnalyzeAuditWithAi.mockRejectedValue(new Error("AI schema failed"));

    const { createAndRunAudit } = await import("./run-audit");

    await createAndRunAudit(baseInput);

    expect(mockProviderCallLogCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        provider: "apify",
        endpointOrActor: "apify-instagram",
        status: "success",
      }),
    });
    expect(mockProviderCallLogCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        provider: "ai",
        endpointOrActor: "audit-analysis",
        status: "failed",
        errorMessage: "AI schema failed",
      }),
    });
  });

  it("queues optional transcript collection only after the metadata report completes", async () => {
    mockFetchSocialAudit.mockResolvedValue({
      ...socialAuditResult,
      videos: [{ url: "https://www.instagram.com/p/ABC123/" }],
    });
    mockAnalyzeAuditWithAi.mockResolvedValue({
      overallScore: 50,
      subScores: {},
      summary: {},
      actionPlan: [],
      strengths: [],
      weaknesses: [],
      angleRecommendations: [],
      readyToPostHooks: [],
      readyToPostScripts: [],
      ctaOptions: [],
      captionPack: [],
      hashtagPack: [],
      contentPrescription: [],
    });

    const { createAndRunAudit } = await import("./run-audit");
    const result = await createAndRunAudit(baseInput);

    expect(result).toEqual({ ok: true, auditJobId: "audit-job-1" });
    expect(mockEnqueueTranscriptEnrichment).toHaveBeenCalledWith({
      auditJobId: "audit-job-1",
      videos: [{ url: "https://www.instagram.com/p/ABC123/" }],
    });
  });
});
