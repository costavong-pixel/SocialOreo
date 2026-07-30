import { afterEach, describe, expect, it, vi } from "vitest";

import { createSquarePaymentLink, SquareCheckoutError } from "./create-payment-link";
import { getSquareProduct } from "./products";
vi.mock("./merchant-context", () => ({ verifySquareMerchantContext: vi.fn().mockResolvedValue(true) }));

const config = {
  applicationId: "app",
  expectedMerchantId: "merchant",
  accessToken: "token",
  locationId: "location",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/api/square/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime-variation",
  monthlyPlanVariationId: "monthly-plan-variation",
  monthlyPriceCents: 1900,
  singleAuditCatalogVariationId: "single-variation",
  creatorPackCatalogVariationId: "pack-variation",
};

describe("createSquarePaymentLink", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a server-owned sandbox hosted checkout for a one-time product", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-1", url: "https://square.link/u/test", order_id: "order-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSquarePaymentLink({ checkoutId: "checkout-1", idempotencyKey: "server-key", config, product: getSquareProduct(config, "single_audit") })).resolves.toEqual({ checkoutUrl: "https://square.link/u/test", orderId: "order-1", paymentLinkId: "link-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/online-checkout/payment-links",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token", "Square-Version": "2026-07-15" }),
        body: JSON.stringify({
          idempotency_key: "server-key",
          order: {
            location_id: "location",
            reference_id: "so:checkout-1",
            line_items: [{ catalog_object_id: "single-variation", quantity: "1" }],
          },
          checkout_options: { redirect_url: "https://example.test/pricing?checkout=checkout-1" },
          payment_note: "so:checkout-1",
        }),
      }),
    );
  });

  it("uses Square hosted quick pay with the fixed Monthly plan variation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-monthly", url: "https://square.link/u/monthly", order_id: "order-monthly" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createSquarePaymentLink({ checkoutId: "checkout-2", idempotencyKey: "server-monthly-key", config, product: getSquareProduct(config, "monthly") });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({
        idempotency_key: "server-monthly-key",
        quick_pay: { location_id: "location", name: "SocialOreo Monthly", price_money: { amount: 1900, currency: "CAD" } },
        checkout_options: { subscription_plan_id: "monthly-plan-variation", redirect_url: "https://example.test/pricing?checkout=checkout-2" },
        description: "SocialOreo Monthly Sandbox subscription",
      }),
    }));
  });

  it("does not expose Square failures to callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));

    await expect(createSquarePaymentLink({ checkoutId: "checkout-3", idempotencyKey: "server-key-3", config, product: getSquareProduct(config, "lifetime") })).rejects.toBeInstanceOf(SquareCheckoutError);
  });
});
