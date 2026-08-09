import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSettleSquareCheckout, mockRecordSquareSubscription, mockWithSquareWebhookClaim } = vi.hoisted(() => ({
  mockSettleSquareCheckout: vi.fn(),
  mockRecordSquareSubscription: vi.fn(),
  mockWithSquareWebhookClaim: vi.fn(),
}));

vi.mock("@/lib/payments/square/checkout-service", () => ({
  settleSquareCheckout: (...args: unknown[]) => mockSettleSquareCheckout(...args),
  recordSquareSubscription: (...args: unknown[]) => mockRecordSquareSubscription(...args),
  withSquareWebhookClaim: (...args: unknown[]) => mockWithSquareWebhookClaim(...args),
}));

import { POST } from "./route";

const originalEnv = { ...process.env };
const notificationUrl = "https://example.test/api/square/webhook";
const signatureKey = "signature-key";

function configureSandbox() {
  process.env.SQUARE_ENV = "sandbox";
  process.env.SQUARE_APPLICATION_ID = "sandbox-app-id";
  process.env.SQUARE_EXPECTED_MERCHANT_ID = "sandbox-merchant-id";
  process.env.SQUARE_ACCESS_TOKEN = "sandbox-token";
  process.env.SQUARE_LOCATION_ID = "location-1";
  process.env.SQUARE_CURRENCY = "CAD";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = signatureKey;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = notificationUrl;
  process.env.APP_BASE_URL = "https://example.test";
  process.env.SQUARE_CATALOG_VARIATION_LIFETIME = "lifetime-variation";
  process.env.SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY = "monthly-plan-variation";
  process.env.SQUARE_MONTHLY_PRICE_CENTS = "1900";
  process.env.SQUARE_CATALOG_VARIATION_SINGLE_AUDIT = "single-variation";
  process.env.SQUARE_CATALOG_VARIATION_CREATOR_PACK = "pack-variation";
}

function signature(body: string) {
  return createHmac("sha256", signatureKey).update(notificationUrl + body).digest("base64");
}

describe("POST /api/square/webhook", () => {
  beforeEach(() => {
    mockWithSquareWebhookClaim.mockImplementation(async (_input: unknown, work: () => Promise<unknown>) => ({ state: "processed", value: await work() }));
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("rejects unsigned requests", async () => {
    configureSandbox();
    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
  });

  it("rejects a signed body that is not a Square event", async () => {
    configureSandbox();
    const body = "not-json";

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(400);
  });

  it("settles only a signed completed payment from the configured location", async () => {
    configureSandbox();
    mockSettleSquareCheckout.mockResolvedValue({ status: "settled", creditsGranted: 10 });
    const body = JSON.stringify({
      event_id: "event-payment-1", created_at: "2026-07-26T15:09:32.671Z", type: "payment.updated",
      data: { object: { payment: { id: "payment-1", order_id: "order-1", customer_id: "customer-1", location_id: "location-1", status: "COMPLETED" } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, creditsGranted: 10, duplicate: false, ignored: false });
    expect(mockSettleSquareCheckout).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentId: "payment-1",
      customerId: "customer-1",
      monthlyPlanVariationId: "monthly-plan-variation",
      priceCents: 1900,
    });
  });

  it("records a signed Monthly subscription status without trusting client data", async () => {
    configureSandbox();
    mockRecordSquareSubscription.mockResolvedValue({ userId: "user-1" });
    const body = JSON.stringify({
      event_id: "event-subscription-1", created_at: "2026-07-26T15:09:32.671Z", type: "subscription.updated",
      data: { object: { subscription: { id: "subscription-1", customer_id: "customer-1", location_id: "location-1", plan_variation_id: "monthly-plan-variation", status: "CANCELED" } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    expect(mockRecordSquareSubscription).toHaveBeenCalledWith({
      subscriptionId: "subscription-1",
      customerId: "customer-1",
      planVariationId: "monthly-plan-variation",
      status: "CANCELED",
      canceledDate: null,
      source: "WEBHOOK",
      eventType: "subscription.updated",
      eventCreatedAt: "2026-07-26T15:09:32.671Z",
    });
  });

  it("returns HTTP 200 for a signed subscription.created event", async () => {
    configureSandbox();
    const body = JSON.stringify({
      event_id: "event-subscription-created", created_at: "2026-07-26T15:09:32.671Z", type: "subscription.created",
      data: { object: { subscription: { id: "subscription-1", customer_id: "customer-1", location_id: "location-1", plan_variation_id: "monthly-plan-variation", status: "ACTIVE" } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    expect(mockRecordSquareSubscription).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: "subscription-1",
      customerId: "customer-1",
      status: "ACTIVE",
      eventType: "subscription.created",
    }));
  });

  it("accepts a signed terminal CANCELED update for the lifecycle fallback", async () => {
    configureSandbox();
    const body = JSON.stringify({
      event_id: "event-subscription-canceled", created_at: "2026-07-26T15:09:32.671Z", type: "subscription.updated",
      data: { object: { subscription: { id: "subscription-1", customer_id: "customer-1", location_id: "location-1", plan_variation_id: "monthly-plan-variation", status: "CANCELED", canceled_date: "2026-08-24" } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    expect(mockRecordSquareSubscription).toHaveBeenCalledWith(expect.objectContaining({
      status: "CANCELED",
      canceledDate: "2026-08-24",
      source: "WEBHOOK",
    }));
  });

  it("processes a signed duplicate event only once", async () => {
    configureSandbox();
    mockWithSquareWebhookClaim.mockResolvedValue({ state: "completed" });
    const body = JSON.stringify({ event_id: "event-duplicate", created_at: "2026-07-26T15:09:32.671Z", type: "subscription.updated" });
    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(mockRecordSquareSubscription).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when production mode config is incomplete", async () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const body = JSON.stringify({ event_id: "event-1", type: "payment.updated" });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(503);
    expect(mockWithSquareWebhookClaim).not.toHaveBeenCalled();
    expect(mockSettleSquareCheckout).not.toHaveBeenCalled();
  });
});
