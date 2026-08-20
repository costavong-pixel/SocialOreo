import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelMonthlySubscription } from "./subscription-api";
import { squareApiBaseUrl, squareApiVersion, SQUARE_API_VERSION_MIN, SquareApiConfigError } from "./square-api";
import type { SquareConfig } from "./config";

const sandboxConfig: SquareConfig = {
  environment: "sandbox",
  applicationId: "app",
  expectedMerchantId: "merchant",
  accessToken: "secret",
  locationId: "location",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/api/square/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime",
  monthlyPlanId: "plan-parent",
  monthlyPlanVariationId: "plan",
  monthlyPriceCents: 1900,
  lifetimePriceCents: 7900,
  singleAuditPriceCents: 1100,
  creatorPackPriceCents: 9500,
  singleAuditCatalogVariationId: "single",
  creatorPackCatalogVariationId: "pack",
};

const productionConfig: SquareConfig = { ...sandboxConfig, environment: "production" };

const originalEnv = { ...process.env };

describe("cancelMonthlySubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("cancels against the sandbox API base byte-for-byte with the version header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscription: { status: "CANCELED", canceled_date: "2026-08-24" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(cancelMonthlySubscription({ subscriptionId: "sub-1", config: sandboxConfig })).resolves.toEqual({ status: "CANCELED", canceledDate: "2026-08-24" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/subscriptions/sub-1/cancel",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret", "Square-Version": "2026-07-15" }) }),
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("cancels against the production API base byte-for-byte", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscription: { status: "CANCELED" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(cancelMonthlySubscription({ subscriptionId: "sub-1", config: productionConfig })).resolves.toEqual({ status: "CANCELED", canceledDate: null });
    expect(fetchMock).toHaveBeenCalledWith("https://connect.squareup.com/v2/subscriptions/sub-1/cancel", expect.anything());
  });

  it("throws when Square rejects the cancellation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [] }), { status: 400 })));
    await expect(cancelMonthlySubscription({ subscriptionId: "sub-1", config: sandboxConfig })).rejects.toThrow("Square could not update the Monthly subscription.");
  });

  it.each([
    { status: "ACTIVE", canceled_date: null },
    { status: "ACTIVE", canceled_date: "not-a-date" },
    { status: "UNKNOWN", canceled_date: "2026-08-24" },
  ])("fails closed for an invalid cancellation response (%o)", async (subscription) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ subscription }), { status: 200 })));
    await expect(cancelMonthlySubscription({ subscriptionId: "sub-1", config: sandboxConfig })).rejects.toThrow("Square could not update the Monthly subscription.");
  });
});

describe("squareApiBaseUrl", () => {
  it("is a pure function of the environment", () => {
    expect(squareApiBaseUrl("sandbox")).toBe("https://connect.squareupsandbox.com");
    expect(squareApiBaseUrl("production")).toBe("https://connect.squareup.com");
  });

  it("throws for an unsupported environment (never defaults to sandbox)", () => {
    expect(() => squareApiBaseUrl("staging" as never)).toThrow(SquareApiConfigError);
  });
});

describe("squareApiVersion", () => {
  it("defaults to the hard floor", () => {
    delete process.env.SQUARE_API_VERSION;
    expect(squareApiVersion()).toBe(SQUARE_API_VERSION_MIN);
  });

  it("accepts a valid override at or above the floor", () => {
    process.env.SQUARE_API_VERSION = "2027-01-01";
    expect(squareApiVersion()).toBe("2027-01-01");
  });

  it("fails closed below the floor", () => {
    process.env.SQUARE_API_VERSION = "2025-12-01";
    expect(() => squareApiVersion()).toThrow(SquareApiConfigError);
  });

  it("fails closed on malformed or impossible values", () => {
    process.env.SQUARE_API_VERSION = "not-a-version";
    expect(() => squareApiVersion()).toThrow(SquareApiConfigError);
    process.env.SQUARE_API_VERSION = "2026-13-45";
    expect(() => squareApiVersion()).toThrow(SquareApiConfigError);
  });

  it("fails closed on calendar-impossible dates that would otherwise roll over", () => {
    process.env.SQUARE_API_VERSION = "2027-02-30";
    expect(() => squareApiVersion()).toThrow(SquareApiConfigError);
    process.env.SQUARE_API_VERSION = "2027-04-31";
    expect(() => squareApiVersion()).toThrow(SquareApiConfigError);
  });
});
