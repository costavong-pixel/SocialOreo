import { afterEach, describe, expect, it, vi } from "vitest";

import { createSquarePaymentLink, SquareCheckoutError } from "./create-payment-link";
import { getSquareProduct } from "./products";
import type { SquareConfig } from "./config";
vi.mock("./merchant-context", () => ({ verifySquareMerchantContext: vi.fn().mockResolvedValue(true) }));

const config: SquareConfig = {
  environment: "sandbox",
  applicationId: "app",
  expectedMerchantId: "merchant",
  accessToken: "token",
  locationId: "location",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/api/square/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime-variation",
  monthlyPlanId: "monthly-plan-id",
  monthlyPlanVariationId: "monthly-plan-variation",
  monthlyPriceCents: 1900,
  lifetimePriceCents: 7900,
  singleAuditPriceCents: 1100,
  creatorPackPriceCents: 9500,
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

  it("uses the subscription plan variation ID for Monthly checkout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "monthly-link", url: "https://square.link/u/monthly", order_id: "monthly-order" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSquarePaymentLink({ checkoutId: "checkout-monthly", idempotencyKey: "monthly-key", config, product: getSquareProduct(config, "monthly") })).resolves.toEqual({
      checkoutUrl: "https://square.link/u/monthly",
      orderId: "monthly-order",
      paymentLinkId: "monthly-link",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect.squareupsandbox.com/v2/online-checkout/payment-links",
      expect.objectContaining({
        body: JSON.stringify({
          idempotency_key: "monthly-key",
          quick_pay: {
            location_id: "location",
            name: "SocialOlla Monthly",
            price_money: { amount: 1900, currency: "CAD" },
          },
          checkout_options: {
            subscription_plan_id: "monthly-plan-variation",
            redirect_url: "https://example.test/pricing?checkout=checkout-monthly",
          },
            description: "SocialOlla Monthly subscription",
        }),
      }),
    );
  });

  it("fails closed before a Square request when Monthly plan identity is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSquarePaymentLink({ checkoutId: "checkout-missing-plan", idempotencyKey: "monthly-key", config: { ...config, monthlyPlanId: "" }, product: getSquareProduct(config, "monthly") })).rejects.toBeInstanceOf(SquareCheckoutError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("targets the production API base when the config environment is production", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-p", url: "https://square.link/u/prod", order_id: "order-p" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const productionConfig: SquareConfig = { ...config, environment: "production" };

    await expect(createSquarePaymentLink({ checkoutId: "checkout-p", idempotencyKey: "server-key", config: productionConfig, product: getSquareProduct(productionConfig, "single_audit") })).resolves.toEqual({ checkoutUrl: "https://square.link/u/prod", orderId: "order-p", paymentLinkId: "link-p" });
    expect(fetchMock).toHaveBeenCalledWith("https://connect.squareup.com/v2/online-checkout/payment-links", expect.objectContaining({ headers: expect.objectContaining({ "Square-Version": "2026-07-15" }) }));
  });

  it("throws a fail-closed error when Square returns no usable payment link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link", url: "https://square.link/u/x" } }), { status: 200 })));

    await expect(createSquarePaymentLink({ checkoutId: "checkout-2", idempotencyKey: "server-key", config, product: getSquareProduct(config, "single_audit") })).rejects.toBeInstanceOf(SquareCheckoutError);
  });
});
