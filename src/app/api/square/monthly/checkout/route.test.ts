import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireCheckoutAccess, mockConfig, mockSyncUser, mockStart, mockIsAuthIdentityCollisionError } = vi.hoisted(() => ({
  mockRequireCheckoutAccess: vi.fn(), mockConfig: vi.fn(), mockSyncUser: vi.fn(), mockStart: vi.fn(), mockIsAuthIdentityCollisionError: vi.fn(),
}));

vi.mock("@/lib/payments/square/tester-gate", () => ({
  requireSquareCheckoutAccess: () => mockRequireCheckoutAccess(),
  requireSquareSandboxTester: () => mockRequireCheckoutAccess(),
}));
vi.mock("@/lib/payments/square/config", () => ({ getSquareConfig: () => mockConfig() }));
vi.mock("@/lib/auth/sync-user", () => ({
  syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args),
  isAuthIdentityCollisionError: (...args: unknown[]) => mockIsAuthIdentityCollisionError(...args),
}));
vi.mock("@/lib/payments/square/checkout-service", () => ({
  SquareCheckoutServiceError: class SquareCheckoutServiceError extends Error {},
  startSquareCheckout: (...args: unknown[]) => mockStart(...args),
}));

import { POST } from "./route";
import { clearRateLimits } from "@/lib/rate-limit/rate-limit";

describe("POST /api/square/monthly/checkout", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  it("creates a hosted checkout only for the authenticated allowlisted tester", async () => {
    const config = { applicationId: "app", monthlyPlanVariationId: "monthly-plan", monthlyPriceCents: 1900 };
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue(config);
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockStart.mockResolvedValue({ checkoutUrl: "https://square.link/u/hosted" });

    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checkoutUrl: "https://square.link/u/hosted" });
    expect(mockStart).toHaveBeenCalledWith({ userId: "user-1", productId: "monthly", config });
  });

  it("fails closed before configuration or Square calls for unauthenticated/non-allowlisted callers", async () => {
    mockRequireCheckoutAccess.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(403);
    expect(mockConfig).not.toHaveBeenCalled();
    expect(mockSyncUser).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-Sandbox configuration", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue(null);
    const response = await POST();
    expect(response.status).toBe(503);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("opens the hosted checkout to any verified user in production mode", async () => {
    const config = { applicationId: "app", monthlyPlanVariationId: "monthly-plan", monthlyPriceCents: 1900 };
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-prod", email: "buyer@example.com" });
    mockConfig.mockReturnValue(config);
    mockSyncUser.mockResolvedValue({ id: "user-prod" });
    mockStart.mockResolvedValue({ checkoutUrl: "https://square.link/u/prod" });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith({ userId: "user-prod", productId: "monthly", config });
  });

  it("returns 429 after the per-user rate limit is exhausted", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan", monthlyPriceCents: 1900 });
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockStart.mockResolvedValue({ checkoutUrl: "https://square.link/u/ok" });

    let lastStatus = 0;
    for (let i = 0; i < 12; i += 1) lastStatus = (await POST()).status;
    expect(lastStatus).toBe(429);
  });

  it("fails closed without a Square call when the Auth0 identity conflicts with an existing account", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-2", email: "creator@example.com" });
    mockConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan", monthlyPriceCents: 1900 });
    mockSyncUser.mockRejectedValue(new Error("identity conflict"));
    mockIsAuthIdentityCollisionError.mockReturnValue(true);

    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This account needs support review before checkout can continue." });
    expect(mockStart).not.toHaveBeenCalled();
  });
});
