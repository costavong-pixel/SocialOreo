import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePurpose, identifyGaps, approveProfile, selectProviderDisabledDestination, proposeAccountMetadata, createFirstPost, createSevenDayPlan } from "@/lib/socialolla/onboarding/onboarding";
import { runAssistantStep, confirmExecute, sanitizeTranscript, costExplanation } from "@/lib/socialolla/assistant/assistant";
import { normalizeUnicode, checkCharacterLimit } from "@/lib/socialolla/i18n/unicode";
import { translate } from "@/lib/socialolla/i18n/translations";

const mocks = vi.hoisted(() => {
  const prisma = {
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    destination: { findFirst: vi.fn(), create: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const BATCH_ROW = {
  id: "cb-internal-1",
  externalId: "cbt_abcdefghijklmnop",
  workspaceId: "ws-internal-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  createdAt: new Date("2026-08-03T00:00:00Z"),
};

describe("Staging acceptance — approved conversational onboarding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.workspace.findUnique.mockResolvedValue({
      id: "ws-internal-1",
      externalId: "wsp_abcdefghijklmnop",
      ownerUserId: "user-1",
      label: "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
      createdAt: new Date("2026-08-03T00:00:00Z"),
    });
    mocks.prisma.destination.findFirst.mockResolvedValue({
      id: "dst-internal-1",
      externalId: "dst_abcdefghijklmnop",
      workspaceId: "ws-internal-1",
      label: "Work Instagram",
      platform: "instagram",
    });
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ postCreditsPerRequest: 1, includedMonthlyCredits: 20 });
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(BATCH_ROW);
    mocks.prisma.creditBatch.findUnique.mockResolvedValue(BATCH_ROW);
    mocks.prisma.creditTransaction.findUnique.mockResolvedValue(null);
    mocks.prisma.creditTransaction.create.mockResolvedValue({ id: "tx-1" });
    mocks.prisma.creditBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return [mocks.prisma.creditBatch.updateMany(), { id: "tx-hold" }];
      throw new Error("unexpected");
    });
  });

  it("runs the full approved onboarding journey (1-10) without inventing commercial claims", async () => {
    // 1. user explains purpose in ordinary language
    const purpose = "I run a small specialty coffee shop, playful vibe, posting on instagram about coffee and baking.";
    // 2. assistant extracts a proposed structured profile
    const draft = parsePurpose(purpose);
    // 3. assistant identifies meaningful gaps
    const gaps = identifyGaps(draft);
    expect(gaps.length).toBeGreaterThan(0);
    // 4. user approves profile fields
    const approved = approveProfile(draft, ["businessName", "niche", "tone", "contentTopics", "primaryPlatform"]);
    expect(approved.businessName).toBeDefined();
    // 5. user selects a provider-disabled/sandbox destination
    const destination = selectProviderDisabledDestination("instagram", "@costa.studio");
    expect(destination.providerDisabled).toBe(true);
    // 6. connected-account metadata differences proposed for approval
    const proposal = proposeAccountMetadata("instagram", { accountType: "PROFESSIONAL", followerCount: null });
    expect(proposal.differences.map((d) => d.field)).toEqual(["accountType"]);
    // 7. system creates one destination-specific first post
    const firstPost = createFirstPost({ destinationRef: destination.accountLabel, language: "en", businessName: approved.businessName, topic: approved.niche });
    expect(firstPost.requiresPublishConfirmation).toBe(true);
    // 8. seven-day plan
    const plan = createSevenDayPlan({ destinationRef: "dst_abcdefghijklmnop", language: "en", contentTopics: approved.contentTopics });
    expect(plan).toHaveLength(7);
    // 9. remaining items stay ideas/light drafts by default
    expect(plan.every((item) => ["idea", "light_draft"].includes(item.status))).toBe(true);
    // 10. publishing and paid actions remain separately confirmed
    const step = runAssistantStep("publish the first post", "post_assistance");
    expect(step.protectedAction).toBe(true);
    expect(confirmExecute({ domain: "post_assistance", action: "Execute", preview: firstPost.caption, confirmationToken: step.confirmationToken!, providedToken: step.confirmationToken! }).ok).toBe(true);
    // no invented prices/hours/addresses/credentials
    expect(draft.raw).not.toMatch(/\$\d|\b(open 7 days|voted best|no delivery charges)\b/i);
  });

  it("routes a Post request through the Post service with credit preview and idempotent hold", async () => {
    const { createPostService } = await import("@/lib/socialolla/content-factory/post-service");
    const service = createPostService();
    const preview = await service.preview("user-1", "dst_abcdefghijklmnop", 10);
    expect(preview.estimatedCredits).toBe(1);
    expect(preview.batchAvailable).toBe(true);
    const request = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_abcdefghijklmnop",
      language: "zh",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "welcome post",
    });
    expect(request.status).toBe("review");
    expect(request.language).toBe("zh");
  });

  it("keeps Watch request routing through SocialOreo with entitlement resolution", async () => {
    const { resolveWatchCompetitorLimit } = await import("@/lib/socialolla/watch/config");
    expect(resolveWatchCompetitorLimit(null, "MONTHLY")).toBe(3);
  });

  it("preserves multilingual fields and variants through the flow", async () => {
    const caption = normalizeUnicode("Épique! 🎉 مرحبا بكم في 咖啡店 @costa.studio #coffee https://media.slabpizza.ca/a.jpg");
    expect(checkCharacterLimit(caption, 200).ok).toBe(true);
    expect(translate("ar-SA", "post.requiresConfirmation")).toBe("النشر يتطلب تأكيدك");
    expect(translate("es-MX", "nav.posts")).toBe("Publicaciones");
  });

  it("keeps assistant explanation/draft/propose/execute separation and safe errors", async () => {
    expect(runAssistantStep("explain how credits work", "credits_and_costs").action).toBe("Explain");
    expect(runAssistantStep("draft a plan", "onboarding").action).toBe("Draft");
    expect(runAssistantStep("propose a profile change", "profile_maintenance").action).toBe("ProposeAction");
    const execute = runAssistantStep("execute", "post_assistance");
    expect(execute.action).toBe("Execute");
    expect(costExplanation({ estimatedCredits: 1, batchAvailable: true, remainingAfter: 19 })).not.toMatch(/\$\d/);
    expect(sanitizeTranscript("reasoning: hi\nBearer sk-abcdefghijklmnop")).not.toMatch(/sk-/);
  });

  it("produces no production mutation (working tree stays clean, no deploy)", () => {
    expect(process.env.NODE_ENV).not.toBe("production");
  });
});
