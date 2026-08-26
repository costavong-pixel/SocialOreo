import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    publicProfileMonitor: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    watchReport: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    publicProfileSnapshot: { findFirst: vi.fn(), upsert: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  fetchSocialAudit: vi.fn(),
  getOrCreatePersonalWorkspace: vi.fn(),
  holdCredits: vi.fn(),
  finalizeCredits: vi.fn(),
  refundCredits: vi.fn(),
  buildPublicSnapshotMetrics: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/social/provider-router", () => ({ fetchSocialAudit: mocks.fetchSocialAudit }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: mocks.getOrCreatePersonalWorkspace }));
vi.mock("@/lib/socialolla/credits/batch-service", () => ({
  intentKey: (workspace: string, destination: string, intent: string) => `so:${workspace}:${destination}:${intent}`,
  holdCredits: mocks.holdCredits,
  finalizeCredits: mocks.finalizeCredits,
  refundCredits: mocks.refundCredits,
}));
vi.mock("@/lib/snapshots/public-profile-snapshots", () => ({ buildPublicSnapshotMetrics: mocks.buildPublicSnapshotMetrics }));
vi.mock("@/lib/validators/social-url", () => ({
  validateSocialUrl: (value: string) => ({ ok: true, platform: "instagram", normalizedUrl: value.trim().replace(/\/$/, ""), kind: "profile" }),
}));

const now = new Date("2026-08-26T12:00:00.000Z");
const monitor = {
  id: "monitor-1",
  userId: "user-1",
  profileUrl: "https://www.instagram.com/example",
  platform: "instagram",
  provider: "apify",
  reelLimit: 30,
  enabled: true,
  cadenceHours: 168,
  providerCostEstimate: null,
  lastCapturedAt: null,
  nextCaptureAt: new Date("2026-08-26T11:00:00.000Z"),
  lastError: null,
  lastAttemptAt: null,
  retryCount: 0,
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    externalId: "wpr_1",
    intentKey: "so:wsp_1:monitor-1:168:2900000:watch-capture",
    monitorId: monitor.id,
    captureKey: "monitor-1:168:2900000",
    workspaceId: "ws-1",
    profileUrl: monitor.profileUrl,
    platform: monitor.platform,
    status: "RUNNING",
    reportJson: null,
    deltaJson: null,
    evidenceJson: null,
    provider: monitor.provider,
    creditCost: 2,
    attemptCount: 0,
    nextAttemptAt: now,
    claimToken: null,
    claimedAt: null,
    lastError: null,
    createdAt: now,
    completedAt: null,
    ...overrides,
  };
}

function configureDefaults() {
  mocks.getOrCreatePersonalWorkspace.mockResolvedValue({ id: "wsp_1", dbId: "ws-1" });
  mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ watchCreditsPerRequest: 2 });
  mocks.prisma.publicProfileMonitor.upsert.mockResolvedValue(monitor);
  mocks.prisma.publicProfileMonitor.update.mockResolvedValue(monitor);
  mocks.prisma.publicProfileMonitor.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.publicProfileMonitor.findFirst.mockResolvedValue({ id: monitor.id });
  mocks.prisma.publicProfileSnapshot.findFirst.mockResolvedValue(null);
  mocks.prisma.publicProfileSnapshot.upsert.mockResolvedValue({ id: "snapshot-1" });
  mocks.prisma.watchReport.update.mockResolvedValue(report({ attemptCount: 1 }));
  mocks.prisma.watchReport.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (operations: unknown) => {
      if (typeof operations === "function") {
        return operations({
          publicProfileSnapshot: mocks.prisma.publicProfileSnapshot,
          watchReport: mocks.prisma.watchReport,
          publicProfileMonitor: mocks.prisma.publicProfileMonitor,
        });
      }
      return Array.isArray(operations) ? Promise.all(operations as Promise<unknown>[]) : operations;
    });
  mocks.holdCredits.mockResolvedValue({ held: true, replayed: false });
  mocks.finalizeCredits.mockResolvedValue({ finalized: true, replayed: false });
  mocks.refundCredits.mockResolvedValue({ refunded: true, replayed: false });
  mocks.fetchSocialAudit.mockResolvedValue({ profile: { platform: "instagram", provider: "apify", profileUrl: monitor.profileUrl, followerCount: 101 }, videos: [] });
  mocks.buildPublicSnapshotMetrics.mockReturnValue({ followerCount: 101, followingCount: 10, postCount: 3, reelsCollected: 0, totalViews: 0, medianViews: 0, visibleInteractions: 0, visibleInteractionRate: 0 });
}

describe("scheduled Watch execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureDefaults();
  });

  it("requires confirmation and configures one normalized monitor", async () => {
    const { assertWatchWorkerStagingRuntime, configureWatchMonitor } = await import("./scheduled-watch");
    expect(() => assertWatchWorkerStagingRuntime({ NODE_ENV: "production", SOCIALOLLA_ENV: "staging" })).toThrow("staging-only");
    expect(() => assertWatchWorkerStagingRuntime({ NODE_ENV: "development", SOCIALOLLA_ENV: "staging" })).toThrow("staging-only");
    expect(() => assertWatchWorkerStagingRuntime({ NODE_ENV: "staging", SOCIALOLLA_ENV: "production" })).toThrow("staging-only");
    expect(() => assertWatchWorkerStagingRuntime({ NODE_ENV: "staging", SOCIALOLLA_ENV: "staging" })).not.toThrow();
    await expect(configureWatchMonitor({ userId: "user-1", profileUrl: "https://www.instagram.com/example/", platform: "instagram", cadenceHours: 168, confirmed: false })).rejects.toThrow("confirmation");

    const result = await configureWatchMonitor({ userId: "user-1", profileUrl: " https://www.instagram.com/example/ ", platform: "instagram", cadenceHours: 168, confirmed: true });
    expect(result).toMatchObject({ profileUrl: "https://www.instagram.com/example", cadenceHours: 168, enabled: true });
    expect(mocks.prisma.publicProfileMonitor.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_profileUrl: { userId: "user-1", profileUrl: "https://www.instagram.com/example" } },
      create: expect.objectContaining({ userId: "user-1", cadenceHours: 168, enabled: true }),
    }));
  });

  it("claims, charges once, stores evidence, and produces a completed first capture", async () => {
    let current: Record<string, unknown> = report();
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([monitor]);
    mocks.prisma.watchReport.findFirst.mockResolvedValue(null);
    mocks.prisma.watchReport.findUnique.mockImplementation(async ({ where }: { where: { captureKey?: string; id?: string } }) => {
      if (where.captureKey) return null;
      return current;
    });
    mocks.prisma.watchReport.create.mockImplementation(async () => current);
    mocks.prisma.watchReport.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      current = {
        ...current,
        attemptCount: 1,
        ...(Object.prototype.hasOwnProperty.call(data, "claimToken") ? { claimToken: data.claimToken } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "claimedAt") ? { claimedAt: data.claimedAt } : {}),
      };
      return { count: 1 };
    });

    const { processDueWatchCaptures } = await import("./scheduled-watch");
    await expect(processDueWatchCaptures(now)).resolves.toMatchObject({ inspected: 1, completed: 1, retried: 0, failed: 0 });
    expect(mocks.holdCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 2, idempotencyKey: expect.stringContaining(":hold") }));
    expect(mocks.finalizeCredits).toHaveBeenCalledOnce();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.prisma.publicProfileSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { captureKey: current.captureKey },
      create: expect.objectContaining({ monitorId: monitor.id, captureKey: current.captureKey, sourceUrls: [] }),
    }));
    expect(mocks.prisma.watchReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: current.id }),
      data: expect.objectContaining({ status: "COMPLETED", evidenceJson: expect.objectContaining({ type: "WATCH_CAPTURE" }) }),
    }));
  });

  it("does not let a second worker claim a fresh lease", async () => {
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([monitor]);
    mocks.prisma.watchReport.findFirst.mockResolvedValue(report({ attemptCount: 1, claimToken: "other-worker", claimedAt: now }));
    mocks.prisma.watchReport.updateMany.mockResolvedValue({ count: 0 });

    const { processDueWatchCaptures } = await import("./scheduled-watch");
    await expect(processDueWatchCaptures(now)).resolves.toMatchObject({ inspected: 1, skipped: 1, completed: 0 });
    expect(mocks.fetchSocialAudit).not.toHaveBeenCalled();
    expect(mocks.holdCredits).not.toHaveBeenCalled();
  });

  it("stops before settlement when the claim is lost after provider work", async () => {
    let current: Record<string, unknown> = report();
    let calls = 0;
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([monitor]);
    mocks.prisma.watchReport.findFirst.mockResolvedValue(null);
    mocks.prisma.watchReport.findUnique.mockImplementation(async ({ where }: { where: { captureKey?: string; id?: string } }) => where.captureKey ? null : current);
    mocks.prisma.watchReport.create.mockImplementation(async () => current);
    mocks.prisma.watchReport.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      calls += 1;
      if (typeof data.claimToken === "string") current = { ...current, claimToken: data.claimToken, claimedAt: data.claimedAt, attemptCount: 1 };
      return { count: calls === 3 ? 0 : 1 };
    });

    const { processDueWatchCaptures } = await import("./scheduled-watch");
    await expect(processDueWatchCaptures(now)).resolves.toMatchObject({ inspected: 1, skipped: 1, completed: 0, failed: 0 });
    expect(mocks.finalizeCredits).not.toHaveBeenCalled();
  });

  it("backs off transient provider failure and refunds after the terminal attempt", async () => {
    const active = report({ attemptCount: 3 });
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([monitor]);
    mocks.prisma.watchReport.findFirst.mockResolvedValue(active);
    let claimToken = "claim";
    mocks.prisma.watchReport.findUnique.mockImplementation(async () => ({ ...active, attemptCount: 4, claimToken, claimedAt: now }));
    mocks.prisma.watchReport.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if (typeof data.claimToken === "string") claimToken = data.claimToken;
      return { count: 1 };
    });
    mocks.fetchSocialAudit.mockRejectedValue(new Error("provider timeout"));

    const { processDueWatchCaptures, watchRetryDelayMs } = await import("./scheduled-watch");
    expect(watchRetryDelayMs(1)).toBe(5 * 60 * 1000);
    await expect(processDueWatchCaptures(now)).resolves.toMatchObject({ inspected: 1, failed: 1, retried: 0 });
    expect(mocks.refundCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 2, intent: active.intentKey }));
    expect(mocks.prisma.watchReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastError: "Provider timeout." }) }));
  });

  it("computes a baseline delta without storing raw provider payloads", async () => {
    let current: Record<string, unknown> = report();
    mocks.prisma.publicProfileMonitor.findMany.mockResolvedValue([monitor]);
    mocks.prisma.watchReport.findFirst.mockResolvedValue(null);
    mocks.prisma.watchReport.findUnique.mockImplementation(async ({ where }: { where: { captureKey?: string; id?: string } }) => where.captureKey ? null : current);
    mocks.prisma.watchReport.create.mockResolvedValue(current);
    mocks.prisma.watchReport.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      current = {
        ...current,
        attemptCount: 1,
        ...(Object.prototype.hasOwnProperty.call(data, "claimToken") ? { claimToken: data.claimToken } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "claimedAt") ? { claimedAt: data.claimedAt } : {}),
      };
      return { count: 1 };
    });
    mocks.prisma.publicProfileSnapshot.findFirst.mockResolvedValue({ capturedAt: new Date("2026-08-19T12:00:00.000Z"), followerCount: 90, followingCount: 10, postCount: 3, reelsCollected: 0, totalViews: 0, medianViews: 0, visibleInteractions: 0, visibleInteractionRate: 0 });
    mocks.fetchSocialAudit.mockResolvedValue({ profile: { platform: "instagram", provider: "apify", profileUrl: monitor.profileUrl, followerCount: 101, rawProviderPayload: { secret: "should-not-persist" } }, videos: [] });
    mocks.buildPublicSnapshotMetrics.mockReturnValue({ followerCount: 101, followingCount: 10, postCount: 3, reelsCollected: 0, totalViews: 0, medianViews: 0, visibleInteractions: 0, visibleInteractionRate: 0 });

    const { processDueWatchCaptures } = await import("./scheduled-watch");
    await processDueWatchCaptures(now);
    const updateCall = mocks.prisma.watchReport.updateMany.mock.calls.find((call) => call[0].data.status === "COMPLETED");
    expect(updateCall?.[0].data.deltaJson).toMatchObject({ metrics: { followerCount: { previous: 90, current: 101, delta: 11 } } });
    expect(JSON.stringify(updateCall?.[0].data.reportJson)).not.toContain("should-not-persist");
  });
});
