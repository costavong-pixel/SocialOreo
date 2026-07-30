import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireTester, mockConfig, mockSyncUser, mockStart } = vi.hoisted(() => ({
  mockRequireTester: vi.fn(), mockConfig: vi.fn(), mockSyncUser: vi.fn(), mockStart: vi.fn(),
}));

vi.mock("@/lib/payments/square/tester-gate", () => ({ requireSquareSandboxTester: () => mockRequireTester() }));
vi.mock("@/lib/payments/square/config", () => ({ getSquareConfig: () => mockConfig() }));
vi.mock("@/lib/auth/sync-user", () => ({ syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args) }));
vi.mock("@/lib/payments/square/checkout-service", () => ({
  SquareCheckoutServiceError: class SquareCheckoutServiceError extends Error {},
  startSquareCheckout: (...args: unknown[]) => mockStart(...args),
}));

import { POST } from "./route";

describe("POST /api/square/monthly/checkout", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a hosted checkout only for the authenticated allowlisted tester", async () => {
    const config = { applicationId: "app", monthlyPlanVariationId: "monthly-plan", monthlyPriceCents: 1900 };
    mockRequireTester.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue(config);
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockStart.mockResolvedValue({ checkoutUrl: "https://square.link/u/hosted" });

    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checkoutUrl: "https://square.link/u/hosted" });
    expect(mockStart).toHaveBeenCalledWith({ userId: "user-1", productId: "monthly", config });
  });

  it("fails closed before configuration or Square calls for unauthenticated/non-allowlisted callers", async () => {
    mockRequireTester.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mockConfig).not.toHaveBeenCalled();
    expect(mockSyncUser).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-Sandbox configuration", async () => {
    mockRequireTester.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue(null);
    const response = await POST();
    expect(response.status).toBe(503);
    expect(mockStart).not.toHaveBeenCalled();
  });
});
