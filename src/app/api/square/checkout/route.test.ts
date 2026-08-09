import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetVerifiedSessionUser, mockSyncUser, mockStartSquareCheckout, mockRequireTester } = vi.hoisted(() => ({
  mockGetVerifiedSessionUser: vi.fn(),
  mockSyncUser: vi.fn(),
  mockStartSquareCheckout: vi.fn(),
  mockRequireTester: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getVerifiedSessionUser: () => mockGetVerifiedSessionUser() }));
vi.mock("@/lib/auth/sync-user", () => ({ syncUserFromAuth0: (...args: unknown[]) => mockSyncUser(...args) }));
vi.mock("@/lib/payments/square/checkout-service", () => ({ startSquareCheckout: (...args: unknown[]) => mockStartSquareCheckout(...args) }));
vi.mock("@/lib/payments/square/tester-gate", () => ({ requireSquareSandboxTester: () => mockRequireTester() }));

import { POST } from "./route";

const originalEnv = { ...process.env };

function configureSandbox() {
  process.env.SQUARE_ENV = "sandbox";
  process.env.SQUARE_APPLICATION_ID = "sandbox-app-id";
  process.env.SQUARE_EXPECTED_MERCHANT_ID = "sandbox-merchant-id";
  process.env.SQUARE_ACCESS_TOKEN = "sandbox-token";
  process.env.SQUARE_LOCATION_ID = "location-1";
  process.env.SQUARE_CURRENCY = "CAD";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "signature-key";
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = "https://example.test/api/square/webhook";
  process.env.APP_BASE_URL = "https://example.test";
  process.env.SQUARE_CATALOG_VARIATION_LIFETIME = "lifetime-variation";
  process.env.SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY = "monthly-plan-variation";
  process.env.SQUARE_MONTHLY_PRICE_CENTS = "1900";
  process.env.SQUARE_CATALOG_VARIATION_SINGLE_AUDIT = "single-variation";
  process.env.SQUARE_CATALOG_VARIATION_CREATOR_PACK = "pack-variation";
}

describe("POST /api/square/checkout", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    mockRequireTester.mockReset();
  });

  it("requires an authenticated user", async () => {
    configureSandbox();
    mockGetVerifiedSessionUser.mockResolvedValue(null);
    mockRequireTester.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", body: JSON.stringify({ product: "lifetime" }) }));
    expect(response.status).toBe(403);
  });

  it("rejects a client-supplied product outside the server catalog", async () => {
    configureSandbox();
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockRequireTester.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "free_access" }) }));
    expect(response.status).toBe(400);
    expect(mockStartSquareCheckout).not.toHaveBeenCalled();
  });

  it("starts a server-owned sandbox checkout for an approved one-time product", async () => {
    configureSandbox();
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockRequireTester.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockSyncUser.mockResolvedValue({ id: "user-1" });
    mockStartSquareCheckout.mockResolvedValue({ checkoutUrl: "https://square.link/u/sandbox" });

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "lifetime" }) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checkoutUrl: "https://square.link/u/sandbox" });
    expect(mockStartSquareCheckout).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", productId: "lifetime" }));
  });

  it("rejects Monthly on the general checkout endpoint because it uses the dedicated owner-gated hosted route", async () => {
    configureSandbox();
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockRequireTester.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "monthly" }) }));

    expect(response.status).toBe(400);
    expect(mockStartSquareCheckout).not.toHaveBeenCalled();
  });

  it("returns a JSON error when syncing the authenticated user fails", async () => {
    configureSandbox();
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockRequireTester.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockSyncUser.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "single_audit" }) }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "We could not open checkout." });
  });

  it("fails closed with 503 in production mode when config is incomplete (no Square call, no DB write)", async () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });
    mockRequireTester.mockResolvedValue({ id: "auth0-1", email: "creator@example.com" });

    const response = await POST(new Request("http://localhost/api/square/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: "single_audit" }) }));

    expect(response.status).toBe(503);
    expect(mockStartSquareCheckout).not.toHaveBeenCalled();
    expect(mockSyncUser).not.toHaveBeenCalled();
  });
});
