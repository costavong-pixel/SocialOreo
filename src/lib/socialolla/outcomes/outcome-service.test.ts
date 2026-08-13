import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    contentVersion: { findFirst: vi.fn(), findMany: vi.fn() },
    contentPublication: { create: vi.fn() },
    contentMetricSnapshot: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    contentOutcomeEvaluation: { findFirst: vi.fn(), create: vi.fn() },
    outcomePlanRecommendation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    postRequest: { create: vi.fn() },
    scheduleSlot: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import {
  canonicalPlatformPostUrl,
  confirmManualPublication,
  createApprovedContentVersionData,
  decideOutcomePlanRecommendation,
  recordManualMetricSnapshot,
} from "./outcome-service";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const WORKSPACE = {
  id: "ws-1",
  externalId: "wsp_test000000000000",
  ownerUserId: "user-1",
  label: "Personal workspace",
  defaultLocale: "en-US",
  provider: "PERSONAL",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
};

function ownedVersion(publication: { publishedAt: Date } | null = null) {
  return {
    id: "cv-1",
    externalId: "ocv_test000000000000",
    workspaceId: "ws-1",
    postRequestId: "pr-1",
    destinationRef: "dst_1",
    platform: "instagram",
    publication: publication
      ? {
          id: "pub-1",
          externalId: "ocp_test000000000000",
          contentVersionId: "cv-1",
          platformPostUrl: "https://www.instagram.com/reel/abc123",
          publishedAt: publication.publishedAt,
          confirmedAt: NOW,
          source: "MANUAL",
        }
      : null,
  };
}

function metric(capturedAt: Date, views: number, likes: number) {
  return { id: `ms-${capturedAt.getTime()}`, capturedAt, views, likes, comments: 0, shares: 0, saves: 0, reach: null };
}

describe("Outcome Loop service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.prisma.workspace.findUnique.mockResolvedValue(WORKSPACE);
    mocks.prisma.contentMetricSnapshot.findUnique.mockResolvedValue(null);
    mocks.prisma.contentOutcomeEvaluation.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("snapshots exactly the approved content rather than retaining a mutable variant reference", () => {
    const first = createApprovedContentVersionData({
      workspaceId: "ws-1",
      postRequestId: "pr-1",
      destinationRef: "dst_1",
      approvedAt: NOW,
      variant: { id: "pv-1", platform: "instagram", title: "A title", caption: "A caption", hashtags: ["#one"], cta: "Learn more" },
    });
    const second = createApprovedContentVersionData({
      workspaceId: "ws-1",
      postRequestId: "pr-2",
      destinationRef: "dst_1",
      approvedAt: NOW,
      variant: { id: "pv-2", platform: "instagram", title: "A title", caption: "A caption", hashtags: ["#one"], cta: "Learn more" },
    });

    expect(first.title).toBe("A title");
    expect(first.hashtags).toEqual(["#one"]);
    expect(first.versionHash).toBe(second.versionHash);
    expect(first.externalId).toMatch(/^ocv_/);
  });

  it("pins manual publication evidence to an exact supported https platform host", async () => {
    mocks.prisma.contentVersion.findFirst.mockResolvedValue(ownedVersion());
    mocks.prisma.contentPublication.create.mockImplementation(async ({ data }: any) => ({ id: "pub-1", ...data }));

    expect(() => canonicalPlatformPostUrl("instagram", "https://attacker.example-instagram.com/reel/abc123")).toThrow(/approved platform hostname/);
    expect(() => canonicalPlatformPostUrl("instagram", "http://www.instagram.com/reel/abc123")).toThrow(/https/);
    expect(canonicalPlatformPostUrl("youtube", "https://www.youtube.com/watch?v=abc123&utm_source=ignored")).toBe("https://www.youtube.com/watch?v=abc123");
    await expect(
      confirmManualPublication({
        authUserId: "user-1",
        contentVersionExternalId: "ocv_test000000000000",
        platformPostUrl: "https://www.instagram.com/reel/abc123/?utm_source=ignored#fragment",
        publishedAt: new Date("2026-08-09T12:00:00.000Z"),
        confirmed: false,
      }),
    ).rejects.toThrow(/confirmation/);

    const recorded = await confirmManualPublication({
      authUserId: "user-1",
      contentVersionExternalId: "ocv_test000000000000",
      platformPostUrl: "https://www.instagram.com/reel/abc123/?utm_source=ignored#fragment",
      publishedAt: new Date("2026-08-09T12:00:00.000Z"),
      confirmed: true,
    });

    expect(recorded.reused).toBe(false);
    expect(recorded.platformPostUrl).toBe("https://www.instagram.com/reel/abc123");
    expect(mocks.prisma.contentPublication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contentVersionId: "cv-1", source: "MANUAL" }),
    }));
  });

  it("fails closed when the requested content version is outside the owner workspace", async () => {
    mocks.prisma.contentVersion.findFirst.mockResolvedValue(null);

    await expect(
      confirmManualPublication({
        authUserId: "user-1",
        contentVersionExternalId: "ocv_other_workspace",
        platformPostUrl: "https://www.instagram.com/reel/abc123",
        publishedAt: new Date("2026-08-09T12:00:00.000Z"),
        confirmed: true,
      }),
    ).rejects.toThrow("not found");
    expect(mocks.prisma.contentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { externalId: "ocv_other_workspace", workspaceId: "ws-1" },
    }));
    expect(mocks.prisma.contentPublication.create).not.toHaveBeenCalled();
  });

  it("records manual metrics, evaluates against comparable posts, and leaves scheduling/publishing untouched", async () => {
    const publication = { publishedAt: new Date("2026-08-09T12:00:00.000Z") };
    mocks.prisma.contentVersion.findFirst.mockResolvedValue(ownedVersion(publication));
    const latest = metric(new Date("2026-08-13T11:00:00.000Z"), 1_500, 180);
    mocks.prisma.contentMetricSnapshot.create.mockResolvedValue(latest);
    mocks.prisma.contentMetricSnapshot.findMany.mockResolvedValue([
      metric(new Date("2026-08-11T11:00:00.000Z"), 1_100, 110),
      latest,
    ]);
    mocks.prisma.contentVersion.findMany.mockResolvedValue([
      { metricSnapshots: [metric(new Date("2026-08-12T10:00:00.000Z"), 800, 80)] },
      { metricSnapshots: [metric(new Date("2026-08-12T09:00:00.000Z"), 1_000, 100)] },
      { metricSnapshots: [metric(new Date("2026-08-12T08:00:00.000Z"), 1_200, 120)] },
    ]);
    mocks.prisma.contentOutcomeEvaluation.create.mockImplementation(async ({ data }: any) => ({ id: "eval-1", ...data }));
    mocks.prisma.outcomePlanRecommendation.create.mockImplementation(async ({ data }: any) => ({ id: "rec-1", ...data }));

    const result = await recordManualMetricSnapshot({
      authUserId: "user-1",
      contentVersionExternalId: "ocv_test000000000000",
      capturedAt: latest.capturedAt,
      metrics: { views: 1_500, likes: 180, comments: 0, shares: 0, saves: 0 },
    });

    expect(result.evaluation.status).toBe("READY");
    expect(result.evaluation.decision).toBe("KEEP");
    expect(result.recommendationExternalId).toMatch(/^orp_/);
    expect(mocks.prisma.contentOutcomeEvaluation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "READY", decision: "KEEP" }),
    }));
    expect(mocks.prisma.outcomePlanRecommendation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING_APPROVAL", workspaceId: "ws-1" }),
    }));
    expect(mocks.prisma.postRequest.create).not.toHaveBeenCalled();
    expect(mocks.prisma.scheduleSlot.create).not.toHaveBeenCalled();
  });

  it("requires the owner decision and approval records no generation, schedule, provider, or publication action", async () => {
    mocks.prisma.outcomePlanRecommendation.findFirst.mockResolvedValue({
      id: "rec-1",
      externalId: "orp_test000000000000",
      workspaceId: "ws-1",
      status: "PENDING_APPROVAL",
    });
    mocks.prisma.outcomePlanRecommendation.update.mockImplementation(async ({ data }: any) => ({ status: data.status }));

    await expect(
      decideOutcomePlanRecommendation({ authUserId: "user-1", recommendationExternalId: "orp_test000000000000", decision: "APPROVED", confirmed: false }),
    ).rejects.toThrow(/Owner confirmation/);

    const result = await decideOutcomePlanRecommendation({
      authUserId: "user-1",
      recommendationExternalId: "orp_test000000000000",
      decision: "APPROVED",
      confirmed: true,
    });
    expect(result).toEqual({ status: "APPROVED", reused: false, generated: false, scheduled: false, published: false });
    expect(mocks.prisma.postRequest.create).not.toHaveBeenCalled();
    expect(mocks.prisma.scheduleSlot.create).not.toHaveBeenCalled();
  });
});
