import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    competitorBoardEntry: { findFirst: vi.fn(), findMany: vi.fn() },
    publicProfileMonitor: { count: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    getSessionUser: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/current-user", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/snapshots/public-profile-snapshots", () => ({ enablePublicSnapshotMonitor: vi.fn(), pausePublicSnapshotMonitor: vi.fn() }));
vi.mock("@/lib/trends/trend-scans", () => ({ runInstagramTrendScan: vi.fn(), runTikTokTrendScan: vi.fn(), runYouTubeTrendScan: vi.fn() }));

describe("competitor Watch actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "auth-1" });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-1", accessPlan: "MONTHLY" });
    mocks.prisma.competitorBoardEntry.findFirst.mockResolvedValue({
      auditJob: { profileUrl: "https://www.instagram.com/competitor/", platform: "instagram", provider: "apify", reelLimit: 30 },
    });
    mocks.prisma.competitorBoardEntry.findMany.mockResolvedValue([{ auditJob: { profileUrl: "https://www.instagram.com/competitor/" } }]);
    mocks.prisma.publicProfileMonitor.count.mockResolvedValue(0);
    mocks.prisma.publicProfileMonitor.findUnique.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(async (callback: (transaction: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  });

  it("starts an explicitly opted-in watch only for an owned saved competitor", async () => {
    const { startCompetitorWatch } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "audit-1");
    formData.set("cadenceHours", "336");

    await startCompetitorWatch(formData);

    expect(mocks.prisma.publicProfileMonitor.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_profileUrl: { userId: "user-1", profileUrl: "https://www.instagram.com/competitor/" } },
      create: expect.objectContaining({ userId: "user-1", enabled: true, cadenceHours: 336 }),
      update: expect.objectContaining({ enabled: true, cadenceHours: 336 }),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects a watch request for a competitor outside the workspace", async () => {
    mocks.prisma.competitorBoardEntry.findFirst.mockResolvedValue(null);
    const { startCompetitorWatch } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "other-workspace-audit");
    formData.set("cadenceHours", "168");

    await startCompetitorWatch(formData);

    expect(mocks.prisma.publicProfileMonitor.upsert).not.toHaveBeenCalled();
  });

  it("refuses to exceed the three-watch cap", async () => {
    mocks.prisma.publicProfileMonitor.count.mockResolvedValue(3);
    const { startCompetitorWatch } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "audit-4");
    formData.set("cadenceHours", "168");

    await startCompetitorWatch(formData);

    expect(mocks.prisma.publicProfileMonitor.upsert).not.toHaveBeenCalled();
  });

  it("pauses only a monitor owned by the authenticated workspace", async () => {
    const { pauseCompetitorWatch } = await import("./actions");
    const formData = new FormData();
    formData.set("monitorId", "monitor-1");

    await pauseCompetitorWatch(formData);

    expect(mocks.prisma.publicProfileMonitor.updateMany).toHaveBeenCalledWith({
      where: { id: "monitor-1", userId: "user-1" },
      data: { enabled: false, nextCaptureAt: null },
    });
  });
});
