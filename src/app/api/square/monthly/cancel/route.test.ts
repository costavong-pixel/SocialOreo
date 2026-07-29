import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireSquareSandboxTester, mockSyncUser, mockGetSquareConfig, mockActiveSubscription, mockRecord, mockCancelSubscription } = vi.hoisted(() => ({
  mockRequireSquareSandboxTester: vi.fn(), mockSyncUser: vi.fn(), mockGetSquareConfig: vi.fn(), mockActiveSubscription: vi.fn(), mockRecord: vi.fn(), mockCancelSubscription: vi.fn(),
}));

vi.mock("@/lib/payments/square/tester-gate", () => ({ requireSquareSandboxTester: () => mockRequireSquareSandboxTester() }));
vi.mock("@/lib/auth/sync-user", () => ({ syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args) }));
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

describe("POST /api/square/monthly/cancel", () => {
  afterEach(() => vi.clearAllMocks());

  it("schedules the authenticated user's real subscription at period end while it remains ACTIVE", async () => {
    mockRequireSquareSandboxTester.mockResolvedValue({ id: "auth0-owner", email: "owner@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockGetSquareConfig.mockReturnValue({ monthlyPlanVariationId: "monthly-plan-1" });
    mockActiveSubscription.mockResolvedValue({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan-1" });
    mockCancelSubscription.mockResolvedValue({ status: "ACTIVE", canceledDate: "2026-08-24" });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ACTIVE", canceledDate: "2026-08-24" });
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "subscription-1", customerId: "customer-1", status: "ACTIVE", canceledDate: "2026-08-24", eventType: "subscription.cancel_requested" }));
  });

  it("rejects a non-owner before database work or Square calls", async () => {
    mockRequireSquareSandboxTester.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mockGetSquareConfig).not.toHaveBeenCalled();
    expect(mockSyncUser).not.toHaveBeenCalled();
    expect(mockActiveSubscription).not.toHaveBeenCalled();
    expect(mockCancelSubscription).not.toHaveBeenCalled();
  });
});
