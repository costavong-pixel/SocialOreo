import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockGetVerifiedSessionUser,
  mockSyncUserFromAuth0,
  mockRequireAdminByAuthUserId,
  mockTargetFindUnique,
  mockAdminAdjustCredits,
} = vi.hoisted(() => ({
  mockGetVerifiedSessionUser: vi.fn(),
  mockSyncUserFromAuth0: vi.fn(),
  mockRequireAdminByAuthUserId: vi.fn(),
  mockTargetFindUnique: vi.fn(),
  mockAdminAdjustCredits: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockTargetFindUnique(...args) } },
}));
vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: vi.fn(),
  getAcceptedSessionUser: () => mockGetVerifiedSessionUser(),
  getVerifiedSessionUser: () => mockGetVerifiedSessionUser(),
}));
vi.mock("@/lib/auth/sync-user", () => ({
  isAuthIdentityCollisionError: vi.fn(() => false),
  syncUserFromAuth0: (...args: unknown[]) => mockSyncUserFromAuth0(...args),
}));
vi.mock("@/lib/auth/roles", () => ({
  requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdminByAuthUserId(...args),
}));
vi.mock("@/lib/socialolla/admin/admin-actions", () => ({
  adminAdjustCredits: (...args: unknown[]) => mockAdminAdjustCredits(...args),
}));

import { m2AdminAdjust, m2RequireAdmin } from "./m2-actions";

describe("m2RequireAdmin verification boundary", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects an unverified session before checking the DB role", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue(null);

    await expect(m2RequireAdmin()).resolves.toEqual({ admin: false });
    expect(mockRequireAdminByAuthUserId).not.toHaveBeenCalled();
  });

  it("checks the DB role only for a provider-verified session", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-admin", email: "admin@example.com", emailVerified: true });
    mockRequireAdminByAuthUserId.mockResolvedValue(true);

    await expect(m2RequireAdmin()).resolves.toEqual({ admin: true });
    expect(mockRequireAdminByAuthUserId).toHaveBeenCalledWith("auth0-admin");
  });
});

describe("m2AdminAdjust target identity boundary", () => {
  afterEach(() => vi.clearAllMocks());

  it("does not resolve or mutate an arbitrary target for a non-admin", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-actor", email: "actor@example.com", emailVerified: true });
    mockSyncUserFromAuth0.mockResolvedValue({ id: "db-actor", authUserId: "auth0-actor", email: "actor@example.com" });
    mockRequireAdminByAuthUserId.mockResolvedValue(false);

    await expect(m2AdminAdjust("auth0|arbitrary-target", 10, "test")).rejects.toThrow("Admin role required");

    expect(mockSyncUserFromAuth0).toHaveBeenCalledTimes(1);
    expect(mockSyncUserFromAuth0).toHaveBeenCalledWith({ id: "auth0-actor", email: "actor@example.com" });
    expect(mockTargetFindUnique).not.toHaveBeenCalled();
    expect(mockAdminAdjustCredits).not.toHaveBeenCalled();
  });

  it("fails closed when an admin target has no canonical User row", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-admin", email: "admin@example.com", emailVerified: true });
    mockSyncUserFromAuth0.mockResolvedValue({ id: "db-admin", authUserId: "auth0-admin", email: "admin@example.com" });
    mockRequireAdminByAuthUserId.mockResolvedValue(true);
    mockTargetFindUnique.mockResolvedValue(null);

    await expect(m2AdminAdjust("auth0|missing-target", 10, "test")).rejects.toThrow("canonical account");

    expect(mockTargetFindUnique).toHaveBeenCalledWith({
      where: { authUserId: "auth0|missing-target" },
      select: { id: true, authUserId: true },
    });
    expect(mockAdminAdjustCredits).not.toHaveBeenCalled();
  });

  it("passes an existing exact-subject target to the admin service", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-admin", email: "admin@example.com", emailVerified: true });
    mockSyncUserFromAuth0.mockResolvedValue({ id: "db-admin", authUserId: "auth0-admin", email: "admin@example.com" });
    mockRequireAdminByAuthUserId.mockResolvedValue(true);
    mockTargetFindUnique.mockResolvedValue({ id: "db-target", authUserId: "auth0|target" });
    mockAdminAdjustCredits.mockResolvedValue({ adjusted: true });

    await expect(m2AdminAdjust("auth0|target", 10, "support grant")).resolves.toEqual({ adjusted: true });

    expect(mockAdminAdjustCredits).toHaveBeenCalledWith({
      adminAuthUserId: "auth0-admin",
      adminDbUserId: "db-admin",
      targetAuthUserId: "auth0|target",
      targetDbUserId: "db-target",
      amount: 10,
      reason: "support grant",
    });
  });
});
