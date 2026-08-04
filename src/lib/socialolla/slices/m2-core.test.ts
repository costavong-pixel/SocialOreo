import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    destination: { findFirst: vi.fn(), create: vi.fn() },
    profile: { upsert: vi.fn() },
    postRequest: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    postVariant: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    postOccurrence: { create: vi.fn(), updateMany: vi.fn() },
    sevenDayPlan: { create: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/socialolla/content-factory/client", () => ({
  createContentFactoryClient: () => ({
    createRequest: vi.fn(async (input: any) => ({
      id: `req_stub${input.idempotencyKey.slice(-6)}`,
      workspaceId: input.workspaceExternalId,
      destinationRef: input.destinationRef,
      profileRef: input.profileRef,
      locale: { locale: "en-US", interfaceLanguage: "en" },
      language: input.language,
      requestedCount: input.requestedCount,
      status: "review",
      evidence: [],
      createdAt: new Date().toISOString(),
    })),
    getRequest: vi.fn(),
    health: vi.fn(),
  }),
}));

const now = new Date();
const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const BATCH = {
  id: "cb-slice",
  externalId: "cbt_slice00000000000",
  workspaceId: "ws-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  periodKey,
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

describe("M2 slice actions (Post / onboarding / demo / assistant / admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-1", role: "ADMIN", accessPlan: "LIFETIME" });
    mocks.prisma.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      externalId: "wsp_slice000000000000",
      ownerUserId: "user-1",
      label: "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
      createdAt: new Date("2026-08-04T00:00:00Z"),
    });
    mocks.prisma.destination.findFirst.mockImplementation((args: any) => ({
      id: "dst-1",
      externalId: args.where.externalId ?? "dst_slice000000000000",
      workspaceId: "ws-1",
      label: "Work Instagram",
      platform: "instagram",
      providerDisabled: true,
    }));
    mocks.prisma.destination.create.mockResolvedValue({ id: "dst-2", externalId: "dst_newsandbox0000000" });
    mocks.prisma.profile.upsert.mockResolvedValue({ id: "p-1", externalId: "prf_slice000000000000" });
    mocks.prisma.postRequest.create.mockResolvedValue({ id: "pr-1", externalId: "req_slice000000000000", workspaceId: "ws-1", status: "REVIEW" });
    mocks.prisma.postRequest.findFirst.mockResolvedValue({ id: "pr-1", externalId: "req_slice000000000000", workspaceId: "ws-1", status: "REVIEW" });
    mocks.prisma.postRequest.update.mockResolvedValue({});
    mocks.prisma.postVariant.create.mockResolvedValue({ id: "v-1" });
    mocks.prisma.postVariant.findFirst.mockResolvedValue({ id: "v-1", postRequestId: "pr-1", isFinal: true });
    mocks.prisma.postVariant.update.mockResolvedValue({});
    mocks.prisma.postOccurrence.create.mockResolvedValue({ id: "o-1" });
    mocks.prisma.postOccurrence.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.sevenDayPlan.create.mockResolvedValue({ id: "plan-1" });
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ postCreditsPerRequest: 1, watchCreditsPerRequest: 1, includedMonthlyCredits: 20 });
    mocks.prisma.creditBatch.findMany.mockResolvedValue([BATCH]);
    mocks.prisma.creditBatch.findUnique.mockResolvedValue(BATCH);
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(BATCH);
    const keys = new Set<string>();
    mocks.prisma.creditTransaction.create.mockImplementation((args: any) => {
      keys.add(args.data.idempotencyKey);
      return { id: "tx-1", batchId: "cb-slice", amount: args.data.amount };
    });
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: any) =>
      keys.has(args.where.idempotencyKey) ? { id: "tx-1", batchId: "cb-slice", amount: 1 } : null,
    );
    mocks.prisma.creditBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "evt-1" });
    mocks.prisma.auditEvent.findMany.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") return arg({ creditBatch: mocks.prisma.creditBatch, creditTransaction: mocks.prisma.creditTransaction });
      if (Array.isArray(arg)) return [mocks.prisma.creditBatch.updateMany(), { id: "tx-hold" }];
      throw new Error("unexpected");
    });
  });

  it("Post: creates a request with a variant and first occurrence", async () => {
    const { createPostRequest, listPostRequests } = await import("@/lib/socialolla/post/post-actions");
    mocks.prisma.postRequest.findMany.mockResolvedValue([]);
    const created = await createPostRequest({
      authUserId: "user-1",
      destinationExternalId: "dst_slice000000000000",
      language: "en",
      requestedCount: 1,
      contentIntent: "launch promo",
      confirmed: true,
    });
    expect(created.status).toBe("REVIEW");
    expect(mocks.prisma.postVariant.create).toHaveBeenCalled();
    expect(mocks.prisma.postOccurrence.create).toHaveBeenCalled();
    await expect(listPostRequests("user-1")).resolves.toEqual([]);
  });

  it("Post: approve+schedule requires a final variant and confirmation", async () => {
    const { approveAndSchedulePost } = await import("@/lib/socialolla/post/post-actions");
    const result = await approveAndSchedulePost({
      authUserId: "user-1",
      postRequestExternalId: "req_slice000000000000",
      scheduleAt: new Date(),
      timezone: "UTC",
      confirmed: true,
    });
    expect(result.status).toBe("SCHEDULED");
    await expect(
      approveAndSchedulePost({ authUserId: "user-1", postRequestExternalId: "req_slice000000000000", scheduleAt: new Date(), timezone: "UTC", confirmed: false }),
    ).rejects.toThrow("confirmation");
  });

  it("Onboarding: proposes a profile with gaps and confirms it", async () => {
    const { proposeProfile, confirmProfile, addSandboxDestination, createFirstPostAndPlan } = await import("@/lib/socialolla/onboarding/onboarding-actions");
    const proposal = await proposeProfile({ authUserId: "user-1", purpose: "I run a small coffee shop, playful, instagram about coffee and baking." });
    expect(proposal.draft.businessName).toContain("coffee");
    expect(proposal.gaps.length).toBeGreaterThan(0);
    const confirmed = await confirmProfile({
      authUserId: "user-1",
      businessName: "Costa Coffee",
      niche: "coffee",
      approvedFields: ["businessName", "niche"],
    });
    expect(confirmed.profileExternalId).toBe("prf_slice000000000000");
    const destination = await addSandboxDestination({ authUserId: "user-1", platform: "tiktok", accountLabel: "@costa.coffee" });
    expect(destination.providerDisabled).toBe(true);
    const journey = await createFirstPostAndPlan({ authUserId: "user-1", destinationExternalId: "dst_slice000000000000", businessName: "Costa Coffee", topic: "coffee", language: "en" });
    expect(journey.postStatus).toBe("LIGHT_DRAFT");
    expect(journey.plan).toHaveLength(7);
  });

  it("Public funnel: demo is labelled, editable, copyable and never forces signup", async () => {
    const { runFreeDemo, assertDemoBoundaries } = await import("@/lib/socialolla/demo/demo-service");
    const demo = runFreeDemo({ topic: "baking", visitorKey: "anon-1" });
    expect(demo.label).toBe("DEMO");
    expect(demo.price).toContain("$");
    expect(assertDemoBoundaries(demo)).toBe(true);
    const demo2 = runFreeDemo({ topic: "baking", visitorKey: "anon-1" });
    expect(demo2.title).toBe(demo.title); // one per visitor deterministic
  });

  it("Assistant: guests cannot execute; authenticated requires exact preview + confirmation", async () => {
    const { assistantRespond } = await import("@/lib/socialolla/assistant/assistant-api");
    const guest = assistantRespond({ intent: "publish the first post", domain: "post_assistance", authenticated: false });
    expect(guest.blocked).toBe(true);
    const needsToken = assistantRespond({ intent: "publish the first post", domain: "post_assistance", authenticated: true });
    expect(needsToken.requiresConfirmation).toBe(true);
    const confirmed = assistantRespond({
      intent: "publish the first post",
      domain: "post_assistance",
      authenticated: true,
      preview: "Publish caption X",
      expectedToken: needsToken.confirmationToken,
      providedToken: needsToken.confirmationToken,
    });
    expect(confirmed.blocked).toBe(false);
  });

  it("Admin: plan config is the single pricing source and adjustments record audit", async () => {
    const { adminPlanConfig, adminAdjustCredits, adminInspectEntitlement } = await import("@/lib/socialolla/admin/admin-actions");
    const config = adminPlanConfig();
    expect(config.lifetime.priceCents).toBe(7900);
    const inspected = await adminInspectEntitlement("user-1");
    expect(inspected.workspaceId).toBe("wsp_slice000000000000");
    const adjusted = await adminAdjustCredits({ adminAuthUserId: "admin-1", targetUserId: "user-1", amount: 5, reason: "promo" });
    expect(adjusted.adjusted).toBe(true);
    expect(mocks.prisma.auditEvent.create).toHaveBeenCalled();
  });
});
