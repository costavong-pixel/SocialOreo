import { afterEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));

import { recordSquareSubscription, settleSquareCheckout } from "./checkout-service";

describe("settleSquareCheckout", () => {
  afterEach(() => vi.clearAllMocks());

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
    mockTransaction.mockImplementation((callback) => callback({
      squareSubscription: { findUnique: vi.fn().mockResolvedValue({ userId: "user-1", status: "CANCELED", lastEventAt: new Date("2026-08-24T00:00:00.000Z") }), upsert: vi.fn() },
      squarePaymentAuditLog: { create: auditCreate },
    }));
    await recordSquareSubscription({ subscriptionId: "subscription-1", customerId: "customer-1", planVariationId: "monthly-plan", status: "CANCELED", eventCreatedAt: "2026-08-25T00:00:00.000Z" });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
