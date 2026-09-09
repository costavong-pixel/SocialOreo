import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    creditTransaction: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    getAcceptedSessionUser: vi.fn(),
    syncUserFromAuth0: vi.fn(),
    getOrCreatePersonalWorkspace: vi.fn(),
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/current-user", () => ({
  getAcceptedSessionUser: () => mocks.getAcceptedSessionUser(),
  getSessionUser: vi.fn(),
  getVerifiedSessionUser: vi.fn(),
}));
vi.mock("@/lib/auth/sync-user", () => ({
  isAuthIdentityCollisionError: vi.fn(() => false),
  syncUserFromAuth0: (...args: unknown[]) => mocks.syncUserFromAuth0(...args),
}));
vi.mock("@/lib/socialolla/workspace", () => ({
  getOrCreatePersonalWorkspace: (...args: unknown[]) => mocks.getOrCreatePersonalWorkspace(...args),
}));

import { m2CreditsOverview, m2EnsureMonthlyBatch } from "./m2-actions";

const MONTHLY_BATCH = {
  id: "cb-monthly",
  externalId: "cbt_monthly",
  workspaceId: "ws-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  periodKey: "2026-09",
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

const PURCHASED_BATCH = {
  id: "cb-purchased",
  externalId: "cbt_purchased",
  workspaceId: "ws-1",
  kind: "PURCHASED",
  amount: 10,
  remaining: 0,
  expiresAt: new Date("2027-09-01T00:00:00Z"),
  periodKey: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

describe("M2 credit actions honor payment entitlement revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAcceptedSessionUser.mockResolvedValue({ id: "auth0-user", email: "user@example.com" });
    mocks.syncUserFromAuth0.mockResolvedValue({ id: "user-1", authUserId: "auth0-user", email: "user@example.com" });
    mocks.getOrCreatePersonalWorkspace.mockResolvedValue({ dbId: "ws-1", id: "wsp-1" });
    mocks.prisma.user.findUnique.mockResolvedValue({ accessPlan: "NONE" });
    mocks.prisma.workspace.findUnique.mockResolvedValue({ ownerUser: { accessPlan: "NONE" } });
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ includedMonthlyCredits: 20, postCreditsPerRequest: 1, watchCreditsPerRequest: 1 });
    mocks.prisma.creditBatch.findMany.mockResolvedValue([MONTHLY_BATCH, PURCHASED_BATCH]);
    mocks.prisma.creditTransaction.findMany.mockResolvedValue([]);
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(null);
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  });

  it("hides revoked monthly entitlement and does not expose a spendable monthly batch", async () => {
    const overview = await m2CreditsOverview();

    expect(overview.entitlement).toBeNull();
    expect(overview.batches).toEqual([PURCHASED_BATCH]);
    expect(overview.spendableBatchExternalId).toBeNull();
    expect(mocks.prisma.entitlementSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("refuses to mint or reuse a monthly batch after access is revoked", async () => {
    await expect(m2EnsureMonthlyBatch()).resolves.toBeNull();

    expect(mocks.prisma.entitlementSnapshot.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.creditBatch.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.creditBatch.create).not.toHaveBeenCalled();
  });

  it("still allows an active lifetime plan to reuse the current monthly batch", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ accessPlan: "LIFETIME" });
    mocks.prisma.workspace.findUnique.mockResolvedValue({ ownerUserId: "user-1", ownerUser: { accessPlan: "LIFETIME" } });
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ includedMonthlyCredits: 20 });
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(MONTHLY_BATCH);

    const result = await m2EnsureMonthlyBatch();

    expect(result?.id).toBe(MONTHLY_BATCH.externalId);
    expect(mocks.prisma.entitlementSnapshot.findFirst).toHaveBeenCalled();
    expect(mocks.prisma.creditBatch.findFirst).toHaveBeenCalled();
  });
});
