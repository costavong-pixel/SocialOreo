import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    destination: { findMany: vi.fn() },
    postRequest: { findMany: vi.fn() },
    scheduleSlot: { findMany: vi.fn() },
    auditJob: { findMany: vi.fn() },
    watchReport: { findMany: vi.fn() },
    publicProfileMonitor: { findMany: vi.fn() },
    creditBatch: { findMany: vi.fn() },
    creditTransaction: { findMany: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("canonical SocialOlla dashboard summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
    mocks.prisma.user.findUnique.mockResolvedValue({
      accessPlan: "MONTHLY",
      creditAccount: { balance: 8 },
      instagramInsightsConnection: {
        status: "CONNECTED",
        username: "owner",
        lastSyncedAt: new Date("2026-08-23T00:00:00Z"),
        lastError: null,
      },
    });
    mocks.prisma.destination.findMany.mockResolvedValue([
      { externalId: "dst_1", label: "Owner Instagram", platform: "instagram", status: "CONNECTED", providerDisabled: true },
      { externalId: "dst_2", label: "Owner TikTok", platform: "tiktok", status: "REAUTH_REQUIRED", providerDisabled: true },
    ]);
    mocks.prisma.postRequest.findMany.mockResolvedValue([
      { id: "post_1", externalId: "pst_1", status: "REVIEW", destinationRef: "dst_1", createdAt: new Date("2026-08-23T00:00:00Z") },
      { id: "post_2", externalId: "pst_2", status: "SCHEDULED", destinationRef: "dst_1", createdAt: new Date("2026-08-22T00:00:00Z") },
      { id: "post_3", externalId: "pst_3", status: "FAILED", destinationRef: "dst_2", createdAt: new Date("2026-08-21T00:00:00Z") },
    ]);
    mocks.prisma.scheduleSlot.findMany.mockResolvedValue([
      { id: "slot_1", postRequestId: "post_2", destinationRef: "dst_1", scheduleAt: new Date("2026-08-25T00:00:00Z"), timezone: "America/Toronto" },
    ]);
    mocks.prisma.auditJob.findMany.mockResolvedValue([
      {
        id: "audit_1",
        profileUrl: "https://www.instagram.com/example/",
        completedAt: new Date("2026-08-22T00:00:00Z"),
        auditReport: { overallScore: 82 },
        socialProfiles: [{ username: "example" }],
      },
    ]);
    mocks.prisma.watchReport.findMany.mockResolvedValue([
      { externalId: "wpr_1", platform: "instagram", status: "COMPLETED", createdAt: new Date("2026-08-22T00:00:00Z") },
    ]);
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([
      { enabled: true, nextCaptureAt: new Date("2026-08-26T00:00:00Z"), snapshots: [{ capturedAt: new Date("2026-08-23T00:00:00Z") }] },
      { enabled: false, nextCaptureAt: null, snapshots: [] },
    ]);
    const currentPeriod = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    mocks.prisma.creditBatch.findMany.mockResolvedValue([
      { kind: "MONTHLY", remaining: 5, periodKey: currentPeriod, expiresAt: null },
      { kind: "PURCHASED", remaining: -2, periodKey: null, expiresAt: null },
    ]);
    mocks.prisma.creditTransaction.findMany.mockResolvedValue([
      { kind: "FINALIZE", amount: -1, reference: "post:pst_1", createdAt: new Date("2026-08-23T00:00:00Z") },
    ]);
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ planVersion: { name: "Monthly" } });
  });

  it("combines legacy analysis/watch evidence with canonical workspace summaries", async () => {
    const { loadDashboardSummary } = await import("./dashboard-summary");

    const summary = await loadDashboardSummary("user_1", "workspace_1");

    expect(summary.overallState).toBe("PARTIAL");
    expect(summary.analysis).toMatchObject({ state: "PARTIAL", count: 1 });
    expect(summary.analysis.latest).toMatchObject({ label: "@example", score: 82 });
    expect(summary.posts).toMatchObject({ state: "PARTIAL", total: 3, draft: 1, scheduled: 1, failed: 1 });
    expect(summary.watch).toMatchObject({ state: "DISABLED", activeMonitors: 1, totalMonitors: 2, reports: 1 });
    expect(summary.connections).toMatchObject({ state: "PARTIAL", total: 2, connected: 1, reconnectRequired: 1 });
    expect(summary.connections.instagramInsights?.username).toBe("owner");
    expect(summary.credits).toMatchObject({ state: "PARTIAL", canonicalAvailable: 5, legacyBalance: 8, plan: "MONTHLY", planVersion: "Monthly" });
    expect(summary.upcoming).toHaveLength(1);
    expect(summary.recommendedAction.href).toBe("/calendar");
  });

  it("gives a new user an honest empty state and a safe first action", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ accessPlan: "NONE", creditAccount: { balance: 0 }, instagramInsightsConnection: null });
    mocks.prisma.destination.findMany.mockResolvedValue([]);
    mocks.prisma.postRequest.findMany.mockResolvedValue([]);
    mocks.prisma.scheduleSlot.findMany.mockResolvedValue([]);
    mocks.prisma.auditJob.findMany.mockResolvedValue([]);
    mocks.prisma.watchReport.findMany.mockResolvedValue([]);
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([]);
    mocks.prisma.creditBatch.findMany.mockResolvedValue([]);
    mocks.prisma.creditTransaction.findMany.mockResolvedValue([]);
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue(null);

    const { loadDashboardSummary } = await import("./dashboard-summary");
    const summary = await loadDashboardSummary("new_user", "new_workspace");

    expect(summary.recommendedAction).toMatchObject({ href: "/connections" });
    expect(summary.analysis.count).toBe(0);
    expect(summary.connections.state).toBe("UI_ONLY");
    expect(summary.watch.state).toBe("DISABLED");
    expect(summary.credits.canonicalAvailable).toBe(0);
    expect(mocks.prisma.creditBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "new_workspace" } }));
  });
});
