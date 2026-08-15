import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireCheckoutAccess, mockSyncUser, mockGetSquareConfig, mockActiveSubscription, mockRecord, mockCancelSubscription, mockIsAuthIdentityCollisionError } = vi.hoisted(() => ({
  mockRequireCheckoutAccess: vi.fn(), mockSyncUser: vi.fn(), mockGetSquareConfig: vi.fn(), mockActiveSubscription: vi.fn(), mockRecord: vi.fn(), mockCancelSubscription: vi.fn(), mockIsAuthIdentityCollisionError: vi.fn(),
}));

vi.mock("@/lib/payments/square/tester-gate", () => ({
  requireSquareCheckoutAccess: () => mockRequireCheckoutAccess(),
  requireSquareSandboxTester: () => mockRequireCheckoutAccess(),
}));
vi.mock("@/lib/auth/sync-user", () => ({
  syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args),
  isAuthIdentityCollisionError: (...args: unknown[]) => mockIsAuthIdentityCollisionError(...args),
}));
vi.mock("@/lib/payments/square/config", () => ({ getSquareConfig: () => mockGetSquareConfig() }));
vi.mock("@/lib/payments/square/checkout-service", () => ({
  getActiveMonthlySubscriptionForUser: (...args: unknown[]) => mockActiveSubscription(...args),
  recordSquareSubscription: (...args: unknown[]) => mockRecord(...args),
}));
vi.mock("@/lib/payments/square/subscription-api", () => ({
  cancelMonthlySubscription: (...args: unknown[]) => mockCancelSubscription(...args),
  SquareSubscriptionError: class SquareSubscriptionError extends Error {},
}));

import { POST } from "./route";
import { clearRateLimits } from "@/lib/rate-limit/rate-limit";

describe("POST /api/square/monthly/cancel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });

  it("schedules the authenticated user's real subscription at period end while it remains ACTIVE", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-owner", email: "owner@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockGetSquareConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan-1" });
    mockActiveSubscription.mockResolvedValue({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan-1" });
    mockCancelSubscription.mockResolvedValue({ status: "ACTIVE", canceledDate: "2026-08-24" });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ACTIVE", canceledDate: "2026-08-24" });
    expect(mockActiveSubscription).toHaveBeenCalledWith("user-1", "monthly-plan-1");
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "subscription-1", customerId: "customer-1", status: "ACTIVE", canceledDate: "2026-08-24", eventType: "subscription.cancel_requested" }));
  });

  it("rejects a non-owner before database work or Square calls", async () => {
    mockRequireCheckoutAccess.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mockGetSquareConfig).not.toHaveBeenCalled();
    expect(mockSyncUser).not.toHaveBeenCalled();
    expect(mockActiveSubscription).not.toHaveBeenCalled();
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });

  it("returns 404 when an authenticated user does not own a configured Monthly subscription", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-other", email: "other@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-other" });
    mockGetSquareConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan-1" });
    mockActiveSubscription.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(404);
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });

  it("cancels for any verified subscription owner in production mode", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-prod", email: "buyer@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-prod" });
    mockGetSquareConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan-1" });
    mockActiveSubscription.mockResolvedValue({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan-1" });
    mockCancelSubscription.mockResolvedValue({ status: "CANCELED", canceledDate: "2026-08-24" });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "CANCELED", canceledDate: "2026-08-24" });
    expect(mockRecord).toHaveBeenCalled();
  });

  it("returns 429 after the per-user rate limit is exhausted", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-owner", email: "owner@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockGetSquareConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan-1" });
    mockActiveSubscription.mockResolvedValue({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan-1" });
    mockCancelSubscription.mockResolvedValue({ status: "ACTIVE", canceledDate: "2026-08-24" });

    let lastStatus = 0;
    for (let i = 0; i < 12; i += 1) lastStatus = (await POST()).status;
    expect(lastStatus).toBe(429);
  });

  it("fails closed without a cancellation request when the Auth0 identity conflicts with an existing account", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth0-2", email: "creator@example.com" });
    mockGetSquareConfig.mockReturnValue({ applicationId: "app", monthlyPlanVariationId: "monthly-plan-1" });
    mockSyncUser.mockRejectedValue(new Error("identity conflict"));
    mockIsAuthIdentityCollisionError.mockReturnValue(true);

    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "This account needs support review before cancellation can continue." });
    expect(mockActiveSubscription).not.toHaveBeenCalled();
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });
});
