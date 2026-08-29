import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    auditJob: { findFirst: vi.fn() },
    competitorBoardEntry: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    publicProfileMonitor: { count: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    getSessionUser: vi.fn(),
    getAcceptedSessionUser: vi.fn(),
    getVerifiedSessionUser: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: mocks.getSessionUser,
  getAcceptedSessionUser: mocks.getAcceptedSessionUser,
  getVerifiedSessionUser: mocks.getVerifiedSessionUser,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/snapshots/public-profile-snapshots", () => ({ enablePublicSnapshotMonitor: vi.fn(), pausePublicSnapshotMonitor: vi.fn() }));
vi.mock("@/lib/trends/trend-scans", () => ({ runInstagramTrendScan: vi.fn(), runTikTokTrendScan: vi.fn(), runYouTubeTrendScan: vi.fn() }));

describe("competitor Watch actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "auth-1" });
    mocks.getAcceptedSessionUser.mockResolvedValue({ id: "auth-1", email: "owner@example.com", emailVerified: true, acceptance: "provider-verified" });
    mocks.getVerifiedSessionUser.mockResolvedValue({ id: "auth-1", email: "owner@example.com", emailVerified: true });
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

  it("removing a competitor from the board deletes its entry and pauses its watch", async () => {
    mocks.prisma.auditJob.findFirst.mockResolvedValue({ profileUrl: "https://www.instagram.com/competitor/" });
    const { removeCompetitorFromBoard } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "audit-1");

    await removeCompetitorFromBoard(formData);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.competitorBoardEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", auditJobId: "audit-1" },
    });
    expect(mocks.prisma.publicProfileMonitor.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", profileUrl: "https://www.instagram.com/competitor/" },
      data: { enabled: false, nextCaptureAt: null },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("performs both removal mutations inside one Prisma transaction", async () => {
    mocks.prisma.auditJob.findFirst.mockResolvedValue({ profileUrl: "https://www.instagram.com/competitor/" });
    const txLog: string[] = [];
    const tx = {
      competitorBoardEntry: { deleteMany: vi.fn(async () => { txLog.push("delete"); return { count: 1 }; }) },
      publicProfileMonitor: { updateMany: vi.fn(async () => { txLog.push("pause"); return { count: 1 }; }) },
    };
    let capturedCallback: ((t: typeof tx) => Promise<unknown>) | null = null;
    mocks.prisma.$transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => {
      capturedCallback = callback;
      return callback(tx);
    });

    const { removeCompetitorFromBoard } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "audit-1");

    await removeCompetitorFromBoard(formData);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(capturedCallback).not.toBeNull();
    expect(txLog).toEqual(["delete", "pause"]);
    expect(tx.competitorBoardEntry.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", auditJobId: "audit-1" } });
    expect(tx.publicProfileMonitor.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", profileUrl: "https://www.instagram.com/competitor/" },
      data: { enabled: false, nextCaptureAt: null },
    });
    expect(mocks.prisma.competitorBoardEntry.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.publicProfileMonitor.updateMany).not.toHaveBeenCalled();
  });

  it("does not leave a partial removal when the transaction fails", async () => {
    mocks.prisma.auditJob.findFirst.mockResolvedValue({ profileUrl: "https://www.instagram.com/competitor/" });
    const tx = {
      competitorBoardEntry: { deleteMany: vi.fn(async () => { throw new Error("boom"); }) },
      publicProfileMonitor: { updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation(async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx));

    const { removeCompetitorFromBoard } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "audit-1");

    await expect(removeCompetitorFromBoard(formData)).rejects.toThrow("boom");

    expect(mocks.prisma.competitorBoardEntry.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.publicProfileMonitor.updateMany).not.toHaveBeenCalled();
  });

  it("does not pause a watch when the audit cannot be resolved to the workspace", async () => {
    mocks.prisma.auditJob.findFirst.mockResolvedValue(null);
    const { removeCompetitorFromBoard } = await import("./actions");
    const formData = new FormData();
    formData.set("auditJobId", "foreign-audit");

    await removeCompetitorFromBoard(formData);

    expect(mocks.prisma.competitorBoardEntry.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.publicProfileMonitor.updateMany).not.toHaveBeenCalled();
  });
});
