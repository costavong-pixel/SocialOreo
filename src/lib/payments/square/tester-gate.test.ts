import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetVerifiedSessionUser, mockRequireAdminByAuthUserId } = vi.hoisted(() => ({
  mockGetVerifiedSessionUser: vi.fn(),
  mockRequireAdminByAuthUserId: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getVerifiedSessionUser: () => mockGetVerifiedSessionUser() }));
vi.mock("@/lib/auth/roles", () => ({ requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdminByAuthUserId(...args) }));

import { getSquareSandboxTesterEmails, requireSquareSandboxTester } from "./tester-gate";

const originalEnv = { ...process.env };

describe("Square Sandbox tester gate", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("fails closed when no allowlist is configured", async () => {
    delete process.env.SQUARE_SANDBOX_TESTER_EMAILS;
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-owner", email: "owner@example.com" });

    await expect(requireSquareSandboxTester()).resolves.toBeNull();
    expect(mockRequireAdminByAuthUserId).not.toHaveBeenCalled();
  });

  it("denies an allowlisted verified user who is not an owner", async () => {
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "owner@example.com, user@example.com";
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-user", email: "user@example.com" });
    mockRequireAdminByAuthUserId.mockResolvedValue(false);

    await expect(requireSquareSandboxTester()).resolves.toBeNull();
    expect(mockRequireAdminByAuthUserId).toHaveBeenCalledWith("auth0-user");
  });

  it("allows only a normalized allowlisted owner", async () => {
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "  OWNER@example.com  ";
    const owner = { id: "auth0-owner", email: "owner@example.com" };
    mockGetVerifiedSessionUser.mockResolvedValue(owner);
    mockRequireAdminByAuthUserId.mockResolvedValue(true);

    await expect(requireSquareSandboxTester()).resolves.toEqual(owner);
    expect(getSquareSandboxTesterEmails()).toEqual(new Set(["owner@example.com"]));
  });
});
