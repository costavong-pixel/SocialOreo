import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveWatchCompetitorLimit } from "./config";
import { WATCH_MAX_COMPETITORS } from "@/lib/snapshots/watch-policy";

const mocks = vi.hoisted(() => {
  const prisma = {
    entitlementSnapshot: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("Slice D — Watch integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_WATCH_CONFIG_ENABLED", "false");
  });

  it("preserves plan-based caps exactly when no entitlement snapshot exists", () => {
    expect(resolveWatchCompetitorLimit(null, "NONE")).toBe(0);
    expect(resolveWatchCompetitorLimit(null, "LIFETIME")).toBe(1);
    expect(resolveWatchCompetitorLimit(null, "MONTHLY")).toBe(3);
  });

  it("applies a configured snapshot cap without weakening the hard safety boundary", () => {
    expect(resolveWatchCompetitorLimit(2, "MONTHLY")).toBe(2);
    expect(resolveWatchCompetitorLimit(4, "MONTHLY")).toBe(WATCH_MAX_COMPETITORS);
    expect(resolveWatchCompetitorLimit(0, "MONTHLY")).toBe(0);
  });

  it("never raises the cap above the hard maximum even with a generous snapshot", () => {
    expect(resolveWatchCompetitorLimit(100, "MONTHLY")).toBe(WATCH_MAX_COMPETITORS);
  });

  it("resolver falls back to the plan limit when configurable entitlements are disabled", async () => {
    const { watchCompetitorLimitForUser } = await import("./resolver");
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({
      maxWatchCompetitors: 2,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ accessPlan: "MONTHLY" });
    const limit = await watchCompetitorLimitForUser("user-1");
    // Config disabled -> snapshot never queried -> plan limit 3 (hard cap) used.
    expect(mocks.prisma.entitlementSnapshot.findFirst).not.toHaveBeenCalled();
    expect(limit).toBe(3);
  });

  it("resolver honors the snapshot when configurable entitlements are enabled", async () => {
    vi.stubEnv("SOCIALOLLA_WATCH_CONFIG_ENABLED", "true");
    const { watchCompetitorLimitForUser } = await import("./resolver");
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({
      maxWatchCompetitors: 2,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ accessPlan: "MONTHLY" });
    const limit = await watchCompetitorLimitForUser("user-1");
    expect(mocks.prisma.entitlementSnapshot.findFirst).toHaveBeenCalled();
    expect(limit).toBe(2);
  });

  it("does not enable a real worker or provider", () => {
    // The slice must only adapt the cap contract; scheduling stays unwired.
    expect(process.env.SOCIALOLLA_WATCH_WORKER_ENABLED).toBeUndefined();
  });
});
