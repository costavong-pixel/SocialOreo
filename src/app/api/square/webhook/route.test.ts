import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSettleSquareCheckout, mockSettleSquareRefund, mockSettleSquareRenewal, mockRecordSquareSubscription, mockWithSquareWebhookClaim } = vi.hoisted(() => ({
  mockSettleSquareCheckout: vi.fn(),
  mockSettleSquareRefund: vi.fn(),
  mockSettleSquareRenewal: vi.fn(),
  mockRecordSquareSubscription: vi.fn(),
  mockWithSquareWebhookClaim: vi.fn(),
}));

vi.mock("@/lib/payments/square/checkout-service", () => ({
  settleSquareCheckout: (...args: unknown[]) => mockSettleSquareCheckout(...args),
  settleSquareRefund: (...args: unknown[]) => mockSettleSquareRefund(...args),
  settleSquareRenewal: (...args: unknown[]) => mockSettleSquareRenewal(...args),
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
  process.env.SQUARE_SUBSCRIPTION_PLAN_MONTHLY = "monthly-plan-id";
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

  it("passes the completed payment amount and currency into settlement for refund provenance", async () => {
    configureSandbox();
    mockSettleSquareCheckout.mockResolvedValue({ status: "settled", creditsGranted: 1 });
    const body = JSON.stringify({
      event_id: "event-payment-with-money", created_at: "2026-07-26T15:09:32.671Z", type: "payment.updated",
      data: { object: { payment: { id: "payment-with-money", order_id: "order-with-money", customer_id: "customer-1", location_id: "location-1", status: "COMPLETED", total_money: { amount: 1100, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    expect(mockSettleSquareCheckout).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1100, currency: "CAD" }));
  });

  it("accepts a completed refund using payment ownership even when Square gives the refund a different order", async () => {
    configureSandbox();
    mockSettleSquareRefund.mockResolvedValue({ status: "settled", creditsReversed: 7 });
    const body = JSON.stringify({
      event_id: "event-refund-updated", merchant_id: "sandbox-merchant-id", created_at: "2026-08-12T15:09:32.671Z", type: "refund.updated",
      data: { object: { refund: { id: "refund-1", payment_id: "payment-1", order_id: "refund-order-1", location_id: "location-1", status: "COMPLETED", amount_money: { amount: 9500, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, creditsReversed: 7, duplicate: false, ignored: false });
    expect(mockSettleSquareRefund).toHaveBeenCalledWith(expect.objectContaining({
      refundId: "refund-1",
      paymentId: "payment-1",
      refundOrderId: "refund-order-1",
      merchantId: "sandbox-merchant-id",
      amountCents: 9500,
      currency: "CAD",
    }));
  });

  it("returns 503 for a refund whose payment mapping is not ready so the claim can be retried", async () => {
    configureSandbox();
    mockSettleSquareRefund.mockResolvedValue({ status: "retry", creditsReversed: 0 });
    const body = JSON.stringify({
      event_id: "event-refund-before-payment", merchant_id: "sandbox-merchant-id", type: "refund.updated",
      data: { object: { refund: { id: "refund-before-payment", payment_id: "payment-not-settled", order_id: "refund-order-2", location_id: "location-1", status: "COMPLETED", amount_money: { amount: 9500, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Square webhook will be retried." });
  });

  it("accepts a completed refund.created event with the same full-refund contract", async () => {
    configureSandbox();
    mockSettleSquareRefund.mockResolvedValue({ status: "settled", creditsReversed: 1 });
    const body = JSON.stringify({
      event_id: "event-refund-created", merchant_id: "sandbox-merchant-id", type: "refund.created",
      data: { object: { refund: { id: "refund-created", payment_id: "payment-created", order_id: "refund-order-created", location_id: "location-1", status: "COMPLETED", amount_money: { amount: 1100, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    expect(mockSettleSquareRefund).toHaveBeenCalledWith(expect.objectContaining({ refundId: "refund-created", paymentId: "payment-created" }));
  });

  it.each([
    { status: "PENDING", merchant_id: "sandbox-merchant-id", currency: "CAD", unlinked: false, location: "location-1" },
    { status: "COMPLETED", merchant_id: "wrong-merchant", currency: "CAD", unlinked: false, location: "location-1" },
    { status: "COMPLETED", merchant_id: "sandbox-merchant-id", currency: "USD", unlinked: false, location: "location-1" },
    { status: "COMPLETED", merchant_id: "sandbox-merchant-id", currency: "CAD", unlinked: true, location: "location-1" },
    { status: "COMPLETED", merchant_id: "sandbox-merchant-id", currency: "CAD", unlinked: false, location: "other-location" },
  ])("fails closed for a refund gate mismatch (%o)", async (gate) => {
    configureSandbox();
    const body = JSON.stringify({
      event_id: `event-refund-${gate.status}-${gate.merchant_id}-${gate.currency}-${gate.unlinked}`,
      merchant_id: gate.merchant_id,
      type: "refund.updated",
      data: { object: { refund: { id: "refund-invalid", payment_id: "payment-1", order_id: "refund-order-1", location_id: gate.location, status: gate.status, unlinked: gate.unlinked, amount_money: { amount: 9500, currency: gate.currency } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, ignored: true });
    expect(mockSettleSquareRefund).not.toHaveBeenCalled();
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

  it("ignores a subscription event whose plan ID is not the configured variation ID", async () => {
    configureSandbox();
    const body = JSON.stringify({
      event_id: "event-subscription-plan-id",
      created_at: "2026-07-26T15:09:32.671Z",
      type: "subscription.updated",
      data: { object: { subscription: { id: "subscription-plan-id", customer_id: "customer-1", location_id: "location-1", plan_variation_id: "monthly-plan-id", status: "ACTIVE" } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", {
      method: "POST",
      headers: { "x-square-hmacsha256-signature": signature(body) },
      body,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, ignored: true });
    expect(mockRecordSquareSubscription).not.toHaveBeenCalled();
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

  it("reconciles a COMPLETED unknown-order payment as a MONTHLY renewal when amount matches", async () => {
    configureSandbox();
    mockSettleSquareCheckout.mockResolvedValue({ status: "unknown", creditsGranted: 0 });
    mockSettleSquareRenewal.mockResolvedValue({ status: "settled", creditsGranted: 20 });
    const body = JSON.stringify({
      event_id: "event-renewal",
      created_at: "2026-07-26T15:09:32.671Z",
      type: "payment.updated",
      data: { object: { payment: { id: "pay-renew", order_id: "order-renew", customer_id: "customer-1", location_id: "location-1", status: "COMPLETED", amount_money: { amount: 1900, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, creditsGranted: 20, duplicate: false, ignored: false });
    expect(mockSettleSquareRenewal).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-renew",
      paymentId: "pay-renew",
      customerId: "customer-1",
      monthlyPlanVariationId: "monthly-plan-variation",
      amountCents: 1900,
    }));
  });

  it("does not reconcile an unknown-order payment whose amount does not match (renewal ignored)", async () => {
    configureSandbox();
    mockSettleSquareCheckout.mockResolvedValue({ status: "unknown", creditsGranted: 0 });
    mockSettleSquareRenewal.mockResolvedValue({ status: "unknown", creditsGranted: 0 });
    const body = JSON.stringify({
      event_id: "event-unknown-amount",
      created_at: "2026-07-26T15:09:32.671Z",
      type: "payment.updated",
      data: { object: { payment: { id: "pay-x", order_id: "order-x", customer_id: "customer-1", location_id: "location-1", status: "COMPLETED", amount_money: { amount: 2500, currency: "CAD" } } } },
    });

    const response = await POST(new Request("https://example.test/api/square/webhook", { method: "POST", headers: { "x-square-hmacsha256-signature": signature(body) }, body }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, creditsGranted: 0, duplicate: false, ignored: true });
  });
});
