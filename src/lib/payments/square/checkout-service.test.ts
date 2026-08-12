import { afterEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockPrisma } = vi.hoisted(() => {
  const mockTransaction = vi.fn();
  const mockPrisma = {
    $transaction: vi.fn((...args: unknown[]) => mockTransaction(...args)),
    squareCheckout: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    squareRefund: { findUnique: vi.fn(), create: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    squarePaymentAuditLog: { create: vi.fn() },
    squareSubscription: { findMany: vi.fn() },
    user: { update: vi.fn() },
    $queryRaw: vi.fn(),
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    creditBatch: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
    planVersion: { upsert: vi.fn() },
    entitlementSnapshot: { create: vi.fn() },
    providerCallLog: { create: vi.fn() },
  };
  return { mockTransaction, mockPrisma };
});

mockTransaction.mockImplementation((callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

import { recordSquareSubscription, settleSquareCheckout, settleSquareRefund, settleSquareRenewal, startSquareCheckout } from "./checkout-service";
import type { SquareConfig } from "./config";
vi.mock("./merchant-context", () => ({ verifySquareMerchantContext: vi.fn().mockResolvedValue(true) }));

const checkoutConfig: SquareConfig = {
  environment: "sandbox",
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
    expect(mockPrisma.squareCheckout.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ squareEnvironment: "sandbox", squareApplicationId: "app-b" }), data: expect.objectContaining({ expiresAt: expect.any(Date), pendingKey: null }) }));
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
    // Both requests start transactions concurrently; the second waits at the
    // database advisory-lock boundary while the first calls Square.
    let lockTail = Promise.resolve();
    let transactionStarts = 0;
    let activeTransactions = 0;
    let maxActiveTransactions = 0;
    mockPrisma.$transaction.mockImplementation(async (callback: unknown) => {
      transactionStarts += 1;
      activeTransactions += 1;
      maxActiveTransactions = Math.max(maxActiveTransactions, activeTransactions);
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await (callback as (transaction: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
      } finally {
        activeTransactions -= 1;
        release();
      }
    });

    await expect(Promise.all([
      startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig }),
      startSquareCheckout({ userId: "user-1", productId: "monthly", config: checkoutConfig }),
    ])).resolves.toEqual([
      { checkoutUrl: "https://square.link/u/parallel" },
      { checkoutUrl: "https://square.link/u/parallel" },
    ]);
    expect(transactionStarts).toBe(2);
    expect(maxActiveTransactions).toBe(2);
    expect(paymentLinkCalls).toHaveBeenCalledTimes(1);
    expect(createCount).toBe(1);
  });


  it("credits a completed configured audit purchase once and stores the Square references", async () => {
    vi.stubEnv("SOCIALOLLA_LEGACY_CREDITS", "true");
    const checkoutFindUnique = vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "CREATOR_PACK", squarePaymentId: null });
    const checkoutUpdate = vi.fn().mockResolvedValue({});
    const accountUpsert = vi.fn().mockResolvedValue({});
    const ledgerCreate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: { findUnique: checkoutFindUnique, update: checkoutUpdate },
      creditAccount: { upsert: accountUpsert },
      creditLedger: { create: ledgerCreate },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 })).resolves.toEqual({ status: "settled", creditsGranted: 10 });
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

  it("grants a pack through the canonical credit batch by default (no legacy writes)", async () => {
    vi.stubEnv("SOCIALOLLA_LEGACY_CREDITS", "false");
    const tx = {
      squareCheckout: { findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "CREATOR_PACK", squarePaymentId: null }), update: vi.fn().mockResolvedValue({}) },
      creditAccount: { upsert: vi.fn() },
      creditLedger: { create: vi.fn() },
      workspace: { findUnique: vi.fn().mockResolvedValue({ id: "ws-1", externalId: "wsp_test00000000000", ownerUserId: "user-1", label: "Personal workspace", defaultLocale: "en-US", provider: "PERSONAL", createdAt: new Date() }), create: vi.fn() },
      creditBatch: { create: vi.fn().mockResolvedValue({ externalId: "cbt_x000000000000000" }) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
      planVersion: { upsert: vi.fn() },
      entitlementSnapshot: { create: vi.fn() },
    };
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 })).resolves.toEqual({ status: "settled", creditsGranted: 10 });
    expect(tx.creditBatch.create).toHaveBeenCalled();
    expect(tx.auditEvent.create).toHaveBeenCalled();
  });

  it("does not grant a payment that was already settled", async () => {
    const accountUpsert = vi.fn();
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: { findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "SINGLE_AUDIT", squarePaymentId: "payment-1" }) },
      creditAccount: { upsert: accountUpsert },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: null, monthlyPlanVariationId: "monthly-plan", priceCents: 1900 })).resolves.toEqual({ status: "duplicate", creditsGranted: 0 });
    expect(accountUpsert).not.toHaveBeenCalled();
  });

  it("grants Monthly only after the completed payment is mapped to the active subscription", async () => {
    const checkoutUpdate = vi.fn().mockResolvedValue({});
    const subscriptionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userUpdate = vi.fn().mockResolvedValue({});
    const planVersionUpsert = vi.fn().mockResolvedValue({ id: "plv-1", externalId: "plv_monthly_v1" });
    const entitlementCreate = vi.fn().mockResolvedValue({ id: "ent-1", externalId: "ent_1" });
    const batchFindFirst = vi.fn().mockResolvedValue(null);
    const batchCreate = vi.fn().mockResolvedValue({ id: "batch-1", externalId: "cbt_1", amount: 20, remaining: 20, kind: "MONTHLY", expiresAt: null, periodKey: "2026-08", createdAt: new Date() });
    const auditCreate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: {
        findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "MONTHLY", squarePaymentId: null }),
        update: checkoutUpdate,
        findFirst: vi.fn().mockResolvedValue(null),
      },
      squareSubscription: { updateMany: subscriptionUpdateMany, findMany: vi.fn().mockResolvedValue([{ status: "ACTIVE" }]) },
      user: { update: userUpdate },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: "ws-1", externalId: "wsp_monthly0000000", ownerUserId: "user-1", label: "Personal workspace", defaultLocale: "en-US", provider: "PERSONAL", createdAt: new Date() }),
        create: vi.fn(),
      },
      planVersion: { upsert: planVersionUpsert },
      entitlementSnapshot: { create: entitlementCreate },
      creditBatch: { findFirst: batchFindFirst, create: batchCreate },
      auditEvent: { create: auditCreate },
    }));

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 })).resolves.toEqual({ status: "settled", creditsGranted: 20 });
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: null, squareCustomerId: "customer-1", planVariationId: "monthly-plan" },
      data: { userId: "user-1" },
    });
    expect(checkoutUpdate).toHaveBeenCalledWith({
      where: { id: "checkout-1" },
      data: expect.objectContaining({ pendingKey: null, completedAt: expect.any(Date) }),
    });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "MONTHLY" } });
    expect(entitlementCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planVersionId: "plv-1" }) }));
    expect(batchCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "MONTHLY", amount: 20 }) }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "entitlement.grant" }) }));
  });

  it("uses the single authoritative monthly price (config.monthlyPriceCents) for the entitlement audit", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation((callback) => callback({
      squareCheckout: {
        findUnique: vi.fn().mockResolvedValue({ id: "checkout-1", userId: "user-1", product: "MONTHLY", squarePaymentId: null }),
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      squareSubscription: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn().mockResolvedValue([{ status: "ACTIVE" }]) },
      user: { update: vi.fn().mockResolvedValue({}) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: "ws-1", externalId: "wsp_monthly0000000", ownerUserId: "user-1", label: "Personal workspace", defaultLocale: "en-US", provider: "PERSONAL", createdAt: new Date() }),
        create: vi.fn(),
      },
      planVersion: { upsert: vi.fn().mockResolvedValue({ id: "plv-1", externalId: "plv_monthly_v1" }) },
      entitlementSnapshot: { create: vi.fn().mockResolvedValue({ id: "ent-1" }) },
      creditBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "batch-1", amount: 20, remaining: 20, kind: "MONTHLY", createdAt: new Date() }) },
      auditEvent: { create: auditCreate },
    }));

    await settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 2400 });

    const auditPayload = auditCreate.mock.calls[0][0].data.payload;
    expect(auditPayload.priceCents).toBe(2400);
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

    await expect(settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: null, monthlyPlanVariationId: "monthly-plan", priceCents: 1900 })).resolves.toEqual({ status: "settled", creditsGranted: 0 });
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

  function lifetimeTx() {
    const checkouts: Array<{ id: string; orderId: string; userId: string; product: string; squarePaymentId: string | null; completedAt: Date | null; refundedAt: Date | null }> = [
      { id: "chk-1", orderId: "order-1", userId: "user-1", product: "LIFETIME", squarePaymentId: null, completedAt: null, refundedAt: null },
      { id: "chk-2", orderId: "order-2", userId: "user-1", product: "LIFETIME", squarePaymentId: null, completedAt: null, refundedAt: null },
    ];
    const batchStore: Record<string, unknown> = {};
    let entitlementSeq = 0;
    return {
      squareCheckout: {
        findUnique: vi.fn(async ({ where }: { where: { squareOrderId: string } }) => checkouts.find((c) => c.orderId === where.squareOrderId) ?? null),
        findFirst: vi.fn(async () => checkouts.find((c) => c.product === "LIFETIME" && c.completedAt !== null && c.refundedAt === null) ?? null),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { squarePaymentId: string; completedAt: Date } }) => {
          const checkout = checkouts.find((c) => c.id === where.id);
          if (checkout) {
            checkout.squarePaymentId = data.squarePaymentId;
            checkout.completedAt = data.completedAt;
          }
          return checkout;
        }),
      },
      squareSubscription: { findMany: vi.fn().mockResolvedValue([]) },
      user: { update: vi.fn().mockResolvedValue({}) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: "ws-1", externalId: "wsp_lifetime00000000", ownerUserId: "user-1", label: "Personal workspace", defaultLocale: "en-US", provider: "PERSONAL", createdAt: new Date() }),
        create: vi.fn(),
      },
      planVersion: { upsert: vi.fn().mockResolvedValue({ id: "pv-1", externalId: "plv_lifetime_v1", version: 1, name: "SocialOlla Lifetime", status: "ACTIVE" }) },
      entitlementSnapshot: {
        create: vi.fn(async () => {
          entitlementSeq += 1;
          return { id: `ent-${entitlementSeq}`, externalId: `ent_x${entitlementSeq}` };
        }),
      },
      creditBatch: {
        findFirst: vi.fn(async ({ where }: { where: { workspaceId: string; periodKey: string } }) => batchStore[`${where.workspaceId}:${where.periodKey}`] ?? null),
        create: vi.fn(async ({ data }: { data: { externalId: string; workspaceId: string; kind: string; amount: number; remaining: number; periodKey: string } }) => {
          const row = { id: "cb-1", externalId: data.externalId, workspaceId: data.workspaceId, kind: data.kind, amount: data.amount, remaining: data.remaining, expiresAt: null, periodKey: data.periodKey, createdAt: new Date() };
          batchStore[`${data.workspaceId}:${data.periodKey}`] = row;
          return row;
        }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
    };
  }

  it("Lifetime: two same-period payments each settle once and share one MONTHLY batch (BACKEND-01)", async () => {
    const tx = lifetimeTx();
    mockTransaction.mockImplementation((callback) => callback(tx));

    const first = await settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 });
    const second = await settleSquareCheckout({ orderId: "order-2", paymentId: "payment-2", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 });

    expect(first).toEqual({ status: "settled", creditsGranted: 20 });
    expect(second).toEqual({ status: "settled", creditsGranted: 0 });
    // Exactly-once per squarePaymentId: both payments are durably marked settled.
    expect(tx.squareCheckout.update).toHaveBeenCalledTimes(2);
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledTimes(2);
    // One MONTHLY batch for the period — no double credit, no P2002 abort.
    expect(tx.creditBatch.create).toHaveBeenCalledTimes(1);
    const auditPayloads = tx.auditEvent.create.mock.calls.map((call) => call[0].data.payload);
    expect(auditPayloads.map((p) => p.squarePaymentId)).toEqual(["payment-1", "payment-2"]);
    expect(auditPayloads[0].batch).toBe(auditPayloads[1].batch);
    expect(auditPayloads[1].batchReused).toBe(true);
  });

  it("Lifetime: a redelivered payment settles exactly once by squarePaymentId", async () => {
    const tx = lifetimeTx();
    mockTransaction.mockImplementation((callback) => callback(tx));

    const first = await settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 });
    const second = await settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 });

    expect(first).toEqual({ status: "settled", creditsGranted: 20 });
    expect(second).toEqual({ status: "duplicate", creditsGranted: 0 });
    // The entitlement grant happened exactly once for this payment.
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.creditBatch.create).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "LIFETIME" } });
  });

  function refundTx(product: string, batchRemaining: number | null = null, activeMonthly = false) {
    const checkout = {
      id: "checkout-refund",
      userId: "user-1",
      product,
      squarePaymentId: "payment-refund",
      squareLocationId: "location-a",
      completedAt: new Date("2026-08-12T15:00:00.000Z"),
      amountCents: 9500,
      currency: "CAD",
      refundedAt: null,
    };
    const batch = batchRemaining == null ? null : {
      id: "batch-pack",
      workspaceId: "workspace-1",
      kind: "PURCHASED",
      amount: product === "SINGLE_AUDIT" ? 1 : 10,
      remaining: batchRemaining,
    };
    const tx = {
      squareRefund: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      squareCheckout: {
        findUnique: vi.fn().mockResolvedValue(checkout),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      creditBatch: {
        findUnique: vi.fn().mockResolvedValue(batch),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      creditTransaction: { create: vi.fn().mockResolvedValue({}) },
      squarePaymentAuditLog: { create: vi.fn().mockResolvedValue({}) },
      squareSubscription: { findMany: vi.fn().mockResolvedValue(activeMonthly ? [{ status: "ACTIVE" }] : []) },
      user: { update: vi.fn().mockResolvedValue({}) },
    };
    return { tx, checkout, batch };
  }

  const refundInput = (overrides: Partial<Parameters<typeof settleSquareRefund>[0]> = {}) => ({
    refundId: "refund-1",
    paymentId: "payment-refund",
    refundOrderId: "refund-order-created-by-square",
    locationId: "location-a",
    merchantId: "merchant-a",
    status: "COMPLETED",
    amountCents: 9500,
    currency: "CAD",
    config: checkoutConfig,
    ...overrides,
  });

  it("accepts one full pack refund by payment-owned batch and clamps unused credits", async () => {
    const { tx } = refundTx("CREATOR_PACK", 7);
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRefund(refundInput())).resolves.toEqual({ status: "settled", creditsReversed: 7 });
    expect(tx.squareCheckout.updateMany).toHaveBeenCalledWith({
      where: { id: "checkout-refund", refundedAt: null },
      data: { refundedAt: expect.any(Date) },
    });
    expect(tx.creditBatch.updateMany).toHaveBeenCalledWith({
      where: { id: "batch-pack", remaining: { gte: 7 } },
      data: { remaining: { decrement: 7 } },
    });
    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "ADJUSTMENT", amount: -7, idempotencyKey: "square:refund:refund-1" }),
    });
    expect(tx.squareRefund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ squareRefundOrderId: "refund-order-created-by-square", squarePaymentId: "payment-refund" }),
    });
  });

  it("rejects partial refunds, including two partial events that sum to the payment", async () => {
    const { tx } = refundTx("CREATOR_PACK", 10);
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRefund(refundInput({ refundId: "refund-part-1", amountCents: 4000 }))).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    await expect(settleSquareRefund(refundInput({ refundId: "refund-part-2", amountCents: 5500 }))).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    expect(tx.squareCheckout.updateMany).not.toHaveBeenCalled();
    expect(tx.creditBatch.updateMany).not.toHaveBeenCalled();
    expect(tx.squareRefund.create).not.toHaveBeenCalled();
  });

  it("ignores non-completed, wrong-currency, and wrong-merchant refunds before opening a transaction", async () => {
    await expect(settleSquareRefund(refundInput({ status: "PENDING" }))).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    await expect(settleSquareRefund(refundInput({ currency: "USD" }))).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    await expect(settleSquareRefund(refundInput({ merchantId: "other-merchant" }))).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns retry for a completed refund that arrives before payment settlement", async () => {
    const { tx } = refundTx("CREATOR_PACK", 10);
    tx.squareCheckout.findUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRefund(refundInput({ refundId: "refund-before-payment" }))).resolves.toEqual({ status: "retry", creditsReversed: 0 });
    expect(tx.squareCheckout.updateMany).not.toHaveBeenCalled();
    expect(tx.squareRefund.create).not.toHaveBeenCalled();
  });

  it("revokes refunded Lifetime access while leaving an active Monthly subscription authoritative", async () => {
    const lifetime = refundTx("LIFETIME");
    mockTransaction.mockImplementation((callback) => callback(lifetime.tx));
    await expect(settleSquareRefund(refundInput())).resolves.toEqual({ status: "settled", creditsReversed: 0 });
    expect(lifetime.tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "NONE" } });

    const monthly = refundTx("MONTHLY", null, true);
    mockTransaction.mockImplementation((callback) => callback(monthly.tx));
    await expect(settleSquareRefund(refundInput({ refundId: "refund-monthly" }))).resolves.toEqual({ status: "settled", creditsReversed: 0 });
    expect(monthly.tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { accessPlan: "MONTHLY" } });
  });

  it("does not treat a legacy pack without payment-owned canonical provenance as refundable", async () => {
    const { tx } = refundTx("CREATOR_PACK", null);
    mockTransaction.mockImplementation((callback) => callback(tx));
    await expect(settleSquareRefund(refundInput())).resolves.toEqual({ status: "ignored", creditsReversed: 0 });
    expect(tx.squareCheckout.updateMany).not.toHaveBeenCalled();
    expect(tx.squareRefund.create).not.toHaveBeenCalled();
  });

  it("treats a repeated refund ID as a no-op", async () => {
    const { tx } = refundTx("CREATOR_PACK", 10);
    tx.squareRefund.findUnique.mockResolvedValue({ squareRefundId: "refund-1" });
    mockTransaction.mockImplementation((callback) => callback(tx));
    await expect(settleSquareRefund(refundInput())).resolves.toEqual({ status: "duplicate", creditsReversed: 0 });
    expect(tx.squareCheckout.findUnique).not.toHaveBeenCalled();
    expect(tx.creditBatch.updateMany).not.toHaveBeenCalled();
  });

  it("stamps the configured square environment into the checkout row (production)", async () => {
    mockPrisma.squareCheckout.findFirst.mockResolvedValue(null);
    mockPrisma.squareCheckout.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.squareCheckout.create.mockResolvedValue({ id: "checkout-prod", idempotencyKey: "key-prod" });
    mockPrisma.squareCheckout.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-p", order_id: "order-p", url: "https://square.link/u/prod" } }), { status: 200 })));

    const prodConfig = { ...checkoutConfig, environment: "production" as const };
    await startSquareCheckout({ userId: "user-1", productId: "monthly", config: prodConfig });

    expect(mockPrisma.squareCheckout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ squareEnvironment: "production" }) }),
    );
  });

  it("keeps the environment out of the sandbox reuse context (sandbox never matches production rows)", async () => {
    mockPrisma.squareCheckout.findFirst.mockResolvedValue(null);
    mockPrisma.squareCheckout.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.squareCheckout.create.mockResolvedValue({ id: "checkout-sandbox", idempotencyKey: "key-sb" });
    mockPrisma.squareCheckout.update.mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ payment_link: { id: "link-s", order_id: "order-s", url: "https://square.link/u/sb" } }), { status: 200 })));

    const sandboxConfig = { ...checkoutConfig, environment: "sandbox" as const };
    await startSquareCheckout({ userId: "user-1", productId: "monthly", config: sandboxConfig });

    expect(mockPrisma.squareCheckout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ squareEnvironment: "sandbox" }) }),
    );
  });

  it("never writes ProviderCallLog during Square settlement (payment flows are provider-free)", async () => {
    const tx = lifetimeTx();
    mockTransaction.mockImplementation((callback) => callback(tx));

    await settleSquareCheckout({ orderId: "order-1", paymentId: "payment-1", customerId: "customer-1", monthlyPlanVariationId: "monthly-plan", priceCents: 1900 });

    // ProviderCallLog is written only by audit provider calls (Apify/AI), never
    // by Square payment/webhook/credit flows. PROD-IMP-011 invariant.
    expect(mockPrisma.providerCallLog.create).not.toHaveBeenCalled();
  });
});

describe("settleSquareRenewal", () => {
  function renewalTx() {
    const tx = {
      squareSubscription: { findMany: vi.fn() },
      squareCheckout: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      squarePaymentAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({ id: "ws-1", externalId: "wsp_monthly0000000", ownerUserId: "user-1", label: "Personal workspace", defaultLocale: "en-US", provider: "PERSONAL", createdAt: new Date() }),
        create: vi.fn(),
      },
      planVersion: { upsert: vi.fn().mockResolvedValue({ id: "plv-1", externalId: "plv_monthly_v1" }) },
      entitlementSnapshot: { create: vi.fn().mockResolvedValue({ id: "ent-1" }) },
      creditBatch: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "batch-1", amount: 20, remaining: 20, kind: "MONTHLY", createdAt: new Date() }) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
      user: { update: vi.fn().mockResolvedValue({}) },
    };
    return tx;
  }

  afterEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation((callback: (transaction: typeof mockPrisma) => unknown) => callback(mockPrisma));
  });

  it("settles a renewal matching exactly-one ACTIVE subscription and grants once", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: "user-1" }]);
    tx.squareCheckout.findFirst.mockResolvedValue(null);
    tx.squareCheckout.create.mockResolvedValue({ id: "synthetic-1" });
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "settled", creditsGranted: 20 });

    expect(tx.squareCheckout.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        product: "MONTHLY", squareOrderId: "order-renew-1", squarePaymentId: "pay-renew-1",
        squareEnvironment: "sandbox", checkoutUrl: null, pendingKey: null, idempotencyKey: null,
        squarePaymentLinkId: null, expiresAt: null, completedAt: expect.any(Date),
      }),
    }));
    expect(tx.squarePaymentAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "payment.renewal", source: "WEBHOOK" }) }));
    expect(mockPrisma.providerCallLog.create).not.toHaveBeenCalled();
  });

  it("treats a redelivered renewal as duplicate exactly once by squarePaymentId", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: "user-1" }]);
    tx.squareCheckout.findFirst.mockResolvedValue({ id: "synthetic-1" });
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "duplicate", creditsGranted: 0 });
    expect(tx.squareCheckout.create).not.toHaveBeenCalled();
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();
  });

  it("maps a concurrent double delivery P2002/40001 to duplicate (no double grant)", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: "user-1" }]);
    tx.squareCheckout.findFirst.mockResolvedValue(null);
    tx.squareCheckout.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "duplicate", creditsGranted: 0 });
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();

    tx.squareCheckout.create.mockRejectedValue(Object.assign(new Error("serialization"), { code: "40001" }));
    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "duplicate", creditsGranted: 0 });
  });

  it("fails closed (no grant, audit only) when the payment amount does not equal the monthly price", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: "user-1" }]);
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 2500, config: checkoutConfig,
    })).resolves.toEqual({ status: "unknown", creditsGranted: 0 });
    expect(tx.squareCheckout.create).not.toHaveBeenCalled();
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();
    expect(tx.squarePaymentAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "payment.renewal.unknown", subscriptionStatus: "amount_mismatch" }) }));
  });

  it("fails closed when there is no ACTIVE subscription or the match is ambiguous", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([]);
    mockTransaction.mockImplementation((callback) => callback(tx));
    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "unknown", creditsGranted: 0 });

    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: "user-1" }, { id: "sub-2", userId: "user-1" }]);
    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "unknown", creditsGranted: 0 });
    expect(tx.squareCheckout.create).not.toHaveBeenCalled();
  });

  it("infers ownership from exactly-one completed MONTHLY checkout excluding synthetic rows", async () => {
    const tx = renewalTx();
    tx.squareSubscription.findMany.mockResolvedValue([{ id: "sub-1", userId: null }]);
    tx.squareCheckout.findFirst.mockResolvedValue(null);
    tx.squareCheckout.create.mockResolvedValue({ id: "synthetic-1" });
    tx.squareCheckout.findMany.mockResolvedValue([{ id: "c1", userId: "user-1" }]);
    mockTransaction.mockImplementation((callback) => callback(tx));

    await expect(settleSquareRenewal({
      orderId: "order-renew-1", paymentId: "pay-renew-1", customerId: "customer-1",
      monthlyPlanVariationId: "plan-a", amountCents: 1900, config: checkoutConfig,
    })).resolves.toEqual({ status: "settled", creditsGranted: 20 });
    // Inference must exclude synthetic rows (checkoutUrl IS NULL).
    expect(tx.squareCheckout.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ checkoutUrl: { not: null } }) }));
  });
});
