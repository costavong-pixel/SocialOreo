import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransaction,
  mockFindFirst,
  mockFindUnique,
  mockUpdate,
  mockCreate,
  mockGetVerifiedSessionUser,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockGetVerifiedSessionUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>, options: unknown) => mockTransaction(callback, options),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getVerifiedSessionUser: () => mockGetVerifiedSessionUser(),
}));

import {
  AuthIdentityCollisionError,
  hasDbSessionIdentityConflict,
  isAuthIdentityCollisionError,
  resolveDbUserFromVerifiedSession,
  syncUserFromAuth0,
} from "./sync-user";

describe("syncUserFromAuth0", () => {
  beforeEach(() => {
    mockTransaction.mockImplementation((callback) => callback({
      user: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        create: (...args: unknown[]) => mockCreate(...args),
      },
    }));
  });

  afterEach(() => vi.clearAllMocks());

  it("updates the exact existing Auth0 subject without changing its account identity", async () => {
    mockFindUnique.mockResolvedValue({ id: "db-owner", email: "owner@example.com" });
    mockUpdate.mockResolvedValue({ id: "db-owner", authUserId: "auth0-owner", email: "owner@example.com" });

    const user = await syncUserFromAuth0({ id: "auth0-owner", email: " Owner@Example.com " });

    expect(user.id).toBe("db-owner");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { authUserId: "auth0-owner" },
      data: { email: "owner@example.com" },
    }));
  });

  it("fails closed when the verified email already belongs to a different Auth0 subject", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue({ authUserId: "auth0-existing" });

    await expect(
      syncUserFromAuth0({ id: "google-oauth2|new-subject", email: "Creator@Example.com" }),
    ).rejects.toBeInstanceOf(AuthIdentityCollisionError);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { authUserId: "google-oauth2|new-subject" },
      select: { id: true, email: true },
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("creates a new USER only when neither the subject nor verified email exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "db-new", authUserId: "auth0-new", email: "new@example.com" });

    const user = await syncUserFromAuth0({ id: "auth0-new", email: "NEW@example.com" });

    expect(user.id).toBe("db-new");
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        authUserId: "auth0-new",
        email: "new@example.com",
      }),
    }));
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });

  it("keeps a historical known subject usable even when another legacy subject has the same email", async () => {
    mockFindUnique.mockResolvedValue({ id: "db-known", email: "creator@example.com" });
    mockUpdate.mockResolvedValue({ id: "db-known", authUserId: "auth0-known", email: "creator@example.com" });

    const user = await syncUserFromAuth0({ id: "auth0-known", email: "creator@example.com" });

    expect(user.id).toBe("db-known");
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("resolveDbUserFromVerifiedSession", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns a distinct conflict state instead of treating an identity collision as a missing login", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-new", email: "creator@example.com" });
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue({ authUserId: "auth0-existing" });
    mockTransaction.mockImplementation((callback) => callback({
      user: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findUnique: (...args: unknown[]) => mockFindUnique(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        create: (...args: unknown[]) => mockCreate(...args),
      },
    }));

    const resolution = await resolveDbUserFromVerifiedSession();

    expect(hasDbSessionIdentityConflict(resolution)).toBe(true);
    expect(isAuthIdentityCollisionError(new AuthIdentityCollisionError())).toBe(true);
  });
});
