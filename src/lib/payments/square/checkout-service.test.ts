import { afterEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockPrisma } = vi.hoisted(() => {
  const mockTransaction = vi.fn();
  const mockPrisma = {
    $transaction: vi.fn((...args: unknown[]) => mockTransaction(...args)),
    squareCheckout: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return { mockTransaction, mockPrisma };
});

mockTransaction.mockImplementation((callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { recordSquareSubscription, settleSquareCheckout, startSquareCheckout } from "./checkout-service";
import type { SquareConfig } from "./config";
vi.mock("./merchant-context", () => ({ verifySquareMerchantContext: vi.fn().mockResolvedValue(true) }));

const checkoutConfig: SquareConfig = {
  applicationId: "app-a",
  expectedMerchantId: "merchant-a",
  accessToken: "token",
  locationId: "location-a",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime",
  monthlyPlanVariationId: "plan-a",
  monthlyPriceCents: 1900,
  singleAuditCatalogVariationId: "single",
  creatorPackCatalogVariationId: "pack",
};

describe("settleSquareCheckout", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockTransaction.mockImplementation((callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma));
    mockPrisma.$transaction.mockImplementation((...args: unknown[]) => mockTransaction(...args));
  });

  it("reuses only a matching, unexpired configuration context", async () => {
    mockPrisma.squareCheckout.findFirst.mockResolvedValue({ checkoutUrl: "https://square.link/u/current" });
    await expect(startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig })).resolves.toEqual({ checkoutUrl: "https://square.link/u/current" });
    expect(mockPrisma.squareCheckout.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ squareApplicationId: "app-a", squareEnvironment: "sandbox", squareLocationId: "location-a", squarePlanVariationId: "plan-a", expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }) }));
    expect(mockPrisma.squareCheckout.create).not.toHaveBeenCalled();
  });

  it("abandons a stale or mismatched link and creates a fresh context", async () => {
    mockPrisma.squareCheckout.findFirst.mockResolvedValue(null);
    mockPrisma.squareCheckout.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.squareCheckout.create.mockResolvedValue({ id: "checkout-2", idempotencyKey: "key-2" });
    mockPrisma.squareCheckout.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-2", order_id: "order-2", url: "https://square.link/u/new" } }), { status: 200 })));

    await expect(startSquareCheckout({ userId: "user-1", productId: "monthly", config: { ...checkoutConfig, applicationId: "app-b" } })).resolves.toEqual({ checkoutUrl: "https://square.link/u/new" });
    expect(mockPrisma.squareCheckout.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiresAt: expect.any(Date), pendingKey: null }) }));
    expect(mockPrisma.squareCheckout.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ squareApplicationId: "app-b", squareEnvironment: "sandbox", squareLocationId: "location-a", squarePlanVariationId: "plan-a", expiresAt: expect.any(Date) }) }));
  });

  it("makes one payment-link call for parallel requests and reuses the pending checkout", async () => {
    let pendingUrl: string | null = null;
    let createCount = 0;
    const paymentLinkCalls = vi.fn();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.squareCheckout.findFirst.mockImplementation(async () => pendingUrl ? { checkoutUrl: pendingUrl } : null);
    mockPrisma.squareCheckout.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.squareCheckout.create.mockImplementation(async () => ({ id: `parallel-${++createCount}`, idempotencyKey: `key-${createCount}` }));
    mockPrisma.squareCheckout.update.mockImplementation(async ({ data }: { data: { checkoutUrl: string } }) => { pendingUrl = data.checkoutUrl; return {}; });
    // Prime the dynamically imported mocked Prisma module before launching
    // concurrent calls; production resolves this module once at startup.
    pendingUrl = "https://square.link/u/prime";
    await startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig });
    pendingUrl = null;
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => {
      paymentLinkCalls();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ payment_link: { id: "link-parallel", order_id: "order-parallel", url: "https://square.link/u/parallel" } }), { status: 200 });
    }));
    let queue: Promise<unknown> = Promise.resolve();
    mockTransaction.mockImplementation((callback: unknown) => {
      const run = queue.then(() => (callback as (transaction: typeof mockPrisma) => Promise<unknown>)(mockPrisma));
      queue = run.catch(() => undefined);
      return run;
    });

    await expect(Promise.all([
      startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig }),
      startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig }),
    ])).resolves.toEqual([
      { checkoutUrl: "https://square.link/u/parallel" },
      { checkoutUrl: "https://square.link/u/parallel" },
    ]);
    expect(paymentLinkCalls).toHaveBeenCalledTimes(1);
    expect(createCount).toBe(1);
  });


  it("credits a completed configured audit purchase once and stores the Square references", async () => {
    const checkoutFindUnique = vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "CREATOR_PACK", squarePaymentId: null });
    const checkoutUpdate = vi.fn().mockResolvedValue({});
    const accountUpsert = vi.fn().mockResolvedValue({});
    const ledgerCreate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: { findUnique: checkoutFindUnique, update: checkoutUpdate },
      creditAccount: { upsert: accountUpsert },
      creditLedger: { create: ledgerCreate },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan" })).resolves.toEqual({ status: "settled", creditsGranted: 10 });
    expect(accountUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: { balance: { increment: 10 } },
      create: { userId: "user-1", balance: 10 },
    });
    expect(ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: "square_purchase:creator_pack",
        squarePaymentId: "payment-1",
        squareCustomerId: "customer-1",
      }),
    });
  });

  it("does not grant a payment that was already settled", async () => {
    const accountUpsert = vi.fn();
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: { findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "SINGLE_AUDIT", squarePaymentId: "payment-1" }) },
      creditAccount: { upsert: accountUpsert },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: null, monthlyPlanVariationId: "monthly-plan" })).resolves.toEqual({ status: "duplicate", creditsGranted: 0 });
    expect(accountUpsert).not.toHaveBeenCalled();
  });

  it("grants Monthly only after the completed payment is mapped to the active subscription", async () => {
    const checkoutUpdate = vi.fn().mockResolvedValue({});
    const subscriptionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: {
        findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "MONTHLY", squarePaymentId: null }),
        update: checkoutUpdate,
        findFirst: vi.fn().mockResolvedValue(null),
      },
      squareSubscription: { updateMany: subscriptionUpdateMany, findMany: vi.fn().mockResolvedValue([{ status: "ACTIVE" }]) },
      user: { update: userUpdate },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan" })).resolves.toEqual({ status: "settled", creditsGranted: 0 });
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: null, squareCustomerId: "customer-1", planVariationId: "monthly-plan" },
      data: { userId: "user-1" },
    });
    expect(checkoutUpdate).toHaveBeenCalledWith({
      where: { id: "checkout-1" },
      data: expect.objectContaining({ pendingKey: null, completedAt: expect.any(Date) }),
    });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "MONTHLY" } });
  });

  it("does not grant Monthly from a payment when Square has not confirmed an active subscription", async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: {
        findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "MONTHLY", squarePaymentId: null }),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      squareSubscription: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) },
      user: { update: userUpdate },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: null, monthlyPlanVariationId: "monthly-plan" })).resolves.toEqual({ status: "settled", creditsGranted: 0 });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "NONE" } });
  });

  it("falls back to Lifetime when a terminal CANCELED webhook is stored", async () => {
    const subscriptionUpsert = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const userUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user-1" }),
        upsert: subscriptionUpsert,
        findMany: vi.fn().mockResolvedValue([{ status: "CANCELED" }]),
      },
      squareCheckout: { findFirst: vi.fn().mockResolvedValue({ id: "lifetime-checkout" }) },
      squarePaymentAuditLog: { create: auditCreate },
      user: { update: userUpdate },
    }));

    await expect(recordSquareSubscription({
      subscriptionId: "subscription-1",
      customerId: "customer-1",
      planVariationId: "monthly-plan",
      status: "CANCELED",
      canceledDate: "2026-08-24",
      source: "WEBHOOK",
      eventType: "subscription.updated",
    })).resolves.toEqual({ userId: "user-1" });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "LIFETIME" } });
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ subscriptionStatus: "CANCELED", effectiveDate: "2026-08-24" }) });
  });

  it("falls back to NONE when a terminal CANCELED webhook has no Lifetime purchase", async () => {
    const userUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user-1" }),
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([{ status: "CANCELED" }]),
      },
      squareCheckout: { findFirst: vi.fn().mockResolvedValue(null) },
      squarePaymentAuditLog: { create: vi.fn().mockResolvedValue({}) },
      user: { update: userUpdate },
    }));

    await recordSquareSubscription({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan", status: "CANCELED" });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "NONE" } });
  });

  it("attaches a later ACTIVE subscription after the payment/order has settled", async () => {
    const subscriptionUpsert = vi.fn().mockResolvedValue({});
    const userUpdate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: subscriptionUpsert,
        findMany: vi.fn().mockResolvedValue([{ status: "ACTIVE" }]),
      },
      squareCheckout: {
        findMany: vi.fn().mockResolvedValue([{ id: "checkout-1", userId: "user-1" }]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      squarePaymentAuditLog: { create: vi.fn().mockResolvedValue({}) },
      user: { update: userUpdate },
    }));

    await expect(recordSquareSubscription({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan", status: "ACTIVE", eventCreatedAt: "2026-08-24T00:00:00.000Z" })).resolves.toEqual({ userId: "user-1" });
    expect(subscriptionUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: "user-1", status: "ACTIVE" }) }));
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "MONTHLY" } });
  });

  it.each([
    "2026-08-23T00:00:00.000Z",
    "2026-08-24T00:00:00.000Z",
    "2026-08-25T00:00:00.000Z",
  ])("never resurrects a terminal CANCELED subscription from an ACTIVE event (%s)", async (eventCreatedAt) => {
    const subscriptionUpsert = vi.fn();
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: { findUnique: vi.fn().mockResolvedValue({ userId: "user-1", status: "CANCELED", lastEventAt: new Date("2026-08-24T00:00:00.000Z") }), upsert: subscriptionUpsert },
    }));

    await expect(recordSquareSubscription({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan", status: "ACTIVE", eventCreatedAt })).resolves.toEqual({ userId: "user-1" });
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("treats a duplicate terminal CANCELED update as idempotent", async () => {
    const auditCreate = vi.fn();
    const userUpdate = vi.fn();
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: { findUnique: vi.fn().mockResolvedValue({ userId: "user-1", status: "CANCELED", lastEventAt: new Date("2026-08-24T00:00:00.000Z") }), upsert: vi.fn(), findMany: vi.fn().mockResolvedValue([{ status: "CANCELED" }]) },
      squareCheckout: { findFirst: vi.fn().mockResolvedValue(null) },
      squarePaymentAuditLog: { create: auditCreate },
      user: { update: userUpdate },
    }));
    await recordSquareSubscription({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan", status: "CANCELED", eventCreatedAt: "2026-08-25T00:00:00.000Z" });
    expect(auditCreate).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "NONE" } });
  });
});
