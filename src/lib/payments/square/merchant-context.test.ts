import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySquareMerchantContext } from "./merchant-context";
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

describe("Square merchant context", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts only the configured location and merchant identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "merchant" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifySquareMerchantContext(sandboxConfig)).resolves.toBe(true);
  });

  it("fails closed for a mismatched merchant or failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "other" } }), { status: 200 })));
    await expect(verifySquareMerchantContext(sandboxConfig)).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(verifySquareMerchantContext(sandboxConfig)).resolves.toBe(false);
  });

  it("calls the sandbox API base URL byte-for-byte in sandbox mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "merchant" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await verifySquareMerchantContext(sandboxConfig);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/locations/location",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret", "Square-Version": "2026-07-15" }) }),
    );
  });

  it("calls the production API base URL byte-for-byte in production mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "merchant" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await verifySquareMerchantContext(productionConfig);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareup.com/v2/locations/location",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret", "Square-Version": "2026-07-15" }) }),
    );
  });
});
