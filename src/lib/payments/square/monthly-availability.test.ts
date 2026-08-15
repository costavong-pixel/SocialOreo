import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdminByAuthUserId, mockGetSquareConfigDiagnostics } = vi.hoisted(() => ({
  mockRequireAdminByAuthUserId: vi.fn(),
  mockGetSquareConfigDiagnostics: vi.fn(),
}));

vi.mock("@/lib/auth/roles", () => ({ requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdminByAuthUserId(...args) }));
vi.mock("@/lib/payments/square/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/square/config")>()),
  getSquareConfigDiagnostics: () => mockGetSquareConfigDiagnostics(),
}));

import { evaluateServerMonthlyAvailability } from "./monthly-availability";

const originalEnv = { ...process.env };
const owner = { id: "auth-owner", email: "owner@example.com", emailVerified: true };

describe("server Monthly presentation availability", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("is true only for a verified ADMIN tester with complete Sandbox configuration", async () => {
    process.env.SQUARE_ENV = "sandbox";
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "owner@example.com";
    mockRequireAdminByAuthUserId.mockResolvedValue(true);
    mockGetSquareConfigDiagnostics.mockReturnValue({ valid: true, invalidOrMissing: [] });

    await expect(evaluateServerMonthlyAvailability(owner, true)).resolves.toEqual({ available: true, reason: "READY" });
  });

  it("is false for an ADMIN outside the tester allowlist", async () => {
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "owner@example.com";
    const admin = { id: "auth-admin", email: "admin@example.com", emailVerified: true };

    await expect(evaluateServerMonthlyAvailability(admin, true)).resolves.toEqual({ available: false, reason: "TESTER_EMAIL_MISMATCH" });
    expect(mockGetSquareConfigDiagnostics).not.toHaveBeenCalled();
  });

  it("is false for an allowlisted non-ADMIN", async () => {
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "owner@example.com";
    mockRequireAdminByAuthUserId.mockResolvedValue(false);

    await expect(evaluateServerMonthlyAvailability(owner, false)).resolves.toEqual({ available: false, reason: "NOT_ADMIN" });
    expect(mockGetSquareConfigDiagnostics).not.toHaveBeenCalled();
  });

  it("is false when Sandbox configuration is incomplete", async () => {
    process.env.SQUARE_ENV = "sandbox";
    process.env.SQUARE_SANDBOX_TESTER_EMAILS = "owner@example.com";
    mockGetSquareConfigDiagnostics.mockReturnValue({ valid: false, invalidOrMissing: ["SQUARE_ACCESS_TOKEN"] });

    await expect(evaluateServerMonthlyAvailability(owner, true)).resolves.toEqual({ available: false, reason: "SQUARE_CONFIG_INCOMPLETE", invalidOrMissingConfig: ["SQUARE_ACCESS_TOKEN"] });
  });

  it("is false without a verified authenticated user", async () => {
    await expect(evaluateServerMonthlyAvailability(null, false)).resolves.toEqual({ available: false, reason: "NO_SESSION" });
    expect(mockRequireAdminByAuthUserId).not.toHaveBeenCalled();
    expect(mockGetSquareConfigDiagnostics).not.toHaveBeenCalled();
  });

  it("is true in production for a verified user without any tester allowlist or admin gate", async () => {
    process.env.SQUARE_ENV = "production";
    delete process.env.SQUARE_SANDBOX_TESTER_EMAILS;
    mockGetSquareConfigDiagnostics.mockReturnValue({ valid: true, invalidOrMissing: [] });

    await expect(evaluateServerMonthlyAvailability(owner)).resolves.toEqual({ available: true, reason: "READY" });
    expect(mockRequireAdminByAuthUserId).not.toHaveBeenCalled();
  });

  it("is unavailable in production when Square configuration is incomplete (no config-field leakage)", async () => {
    process.env.SQUARE_ENV = "production";
    mockGetSquareConfigDiagnostics.mockReturnValue({ valid: false, invalidOrMissing: ["SQUARE_ACCESS_TOKEN"] });

    const result = await evaluateServerMonthlyAvailability(owner);
    expect(result).toEqual({ available: false, reason: "SQUARE_CONFIG_INCOMPLETE", invalidOrMissingConfig: ["SQUARE_ACCESS_TOKEN"] });
  });
});
