import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockMonitorUpdate = vi.fn();
const mockSnapshotCreate = vi.fn();
const mockTransaction = vi.fn();
const mockFetchSocialAudit = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    publicProfileMonitor: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockMonitorUpdate(...args),
    },
    publicProfileSnapshot: { create: (...args: unknown[]) => mockSnapshotCreate(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/providers/social/provider-router", () => ({
  fetchSocialAudit: (...args: unknown[]) => mockFetchSocialAudit(...args),
}));

describe("scheduled public snapshots", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const monitor = {
    id: "monitor-1",
    platform: "instagram",
    provider: "apify",
    profileUrl: "https://www.instagram.com/example/",
    reelLimit: 30,
    cadenceHours: 168,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([monitor]);
    mockSnapshotCreate.mockReturnValue({ snapshot: true });
    mockMonitorUpdate.mockReturnValue({ monitor: true });
    mockTransaction.mockResolvedValue([]);
    mockFetchSocialAudit.mockResolvedValue({
      profile: { platform: "instagram", provider: "apify", profileUrl: monitor.profileUrl, followerCount: 100 },
      videos: [{ platform: "instagram", provider: "apify", url: "https://www.instagram.com/reel/a/", hashtags: [], mentions: [], viewCount: 200, likeCount: 20 }],
    });
  });

  it("persists an observed public sample and schedules the next weekly refresh", async () => {
    const { processDuePublicProfileSnapshots } = await import("./public-profile-snapshots");

    await expect(processDuePublicProfileSnapshots(now)).resolves.toBe(1);

    expect(mockFetchSocialAudit).toHaveBeenCalledWith("instagram", { url: monitor.profileUrl, limit: 30 });
    expect(mockSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ monitorId: "monitor-1", capturedAt: now, totalViews: 200, visibleInteractionRate: 0.1 }),
    });
    expect(mockMonitorUpdate).toHaveBeenCalledWith({
      where: { id: "monitor-1" },
      data: expect.objectContaining({ lastCapturedAt: now, nextCaptureAt: new Date("2026-07-23T12:00:00.000Z"), lastError: null }),
    });
  });

  it("keeps the previous baseline and retries a failed refresh within one day", async () => {
    mockFetchSocialAudit.mockRejectedValue(new Error("Provider unavailable"));
    const { processDuePublicProfileSnapshots } = await import("./public-profile-snapshots");

    await processDuePublicProfileSnapshots(now);

    expect(mockSnapshotCreate).not.toHaveBeenCalled();
    expect(mockMonitorUpdate).toHaveBeenCalledWith({
      where: { id: "monitor-1" },
      data: { lastError: "Provider unavailable", nextCaptureAt: new Date("2026-07-17T12:00:00.000Z") },
    });
  });
});
