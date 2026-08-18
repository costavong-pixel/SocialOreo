import { createHash, randomUUID } from "node:crypto";

import { Prisma, type SquareProduct } from "@prisma/client";

import type { SquareConfig } from "./config";
import { createSquarePaymentLink } from "./create-payment-link";
import { getSquareProduct, type SquareProductId } from "./products";

export class SquareCheckoutServiceError extends Error {
  constructor(message = "We could not open checkout.") {
    super(message);
    this.name = "SquareCheckoutServiceError";
  }
}

class SquareWebhookClaimLostError extends SquareCheckoutServiceError {
  constructor() {
    super("Webhook claim was lost before completion.");
    this.name = "SquareWebhookClaimLostError";
  }
}

const WEBHOOK_LEASE_MS = 5 * 60 * 1000;
const PENDING_CHECKOUT_TTL_MS = 15 * 60 * 1000;
let squarePrisma: (typeof import("@/lib/db/prisma"))["prisma"] | null = null;
async function getSquarePrisma() {
  squarePrisma ??= (await import("@/lib/db/prisma")).prisma;
  return squarePrisma;
}

export type SquareWebhookClaim =
  | { state: "claimed"; processingToken: string }
  | { state: "completed" | "processing" };

export async function claimSquareWebhookEvent(input: { eventId: string; eventType: string; rawBody: string; now?: Date }): Promise<SquareWebhookClaim> {
  const { prisma } = await import("@/lib/db/prisma");
  const now = input.now ?? new Date();
  const processingToken = randomUUID();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  try {
    await prisma.squareWebhookEvent.create({
      data: {
        squareEventId: input.eventId,
        eventType: input.eventType,
        payloadHash,
        processingToken,
        processingStartedAt: now,
      },
    });
    return { state: "claimed", processingToken };
  } catch (error) {
    const duplicate = (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002");
    if (!duplicate) throw error;
  }

  const existing = await prisma.squareWebhookEvent.findUnique({
    where: { squareEventId: input.eventId },
    select: { processedAt: true, processingStartedAt: true },
  });
  if (existing?.processedAt) return { state: "completed" };

  const staleBefore = new Date(now.getTime() - WEBHOOK_LEASE_MS);
  const reclaimed = await prisma.squareWebhookEvent.updateMany({
    where: {
      squareEventId: input.eventId,
      processedAt: null,
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }],
    },
    data: { eventType: input.eventType, payloadHash, processingToken, processingStartedAt: now },
  });
  if (reclaimed.count === 1) return { state: "claimed", processingToken };
  return { state: "processing" };
}

export async function completeSquareWebhookEvent(input: { eventId: string; processingToken: string }) {
  const { prisma } = await import("@/lib/db/prisma");
  const result = await prisma.squareWebhookEvent.updateMany({
    where: { squareEventId: input.eventId, processingToken: input.processingToken, processedAt: null },
    data: { processedAt: new Date() },
  });
  if (result.count !== 1) throw new SquareWebhookClaimLostError();
}

export async function releaseSquareWebhookEvent(input: { eventId: string; processingToken: string }) {
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.squareWebhookEvent.deleteMany({
    where: { squareEventId: input.eventId, processingToken: input.processingToken, processedAt: null },
  });
}

export const squareWebhookLeaseMs = WEBHOOK_LEASE_MS;

// Kept outside route code so retry, crash recovery, and concurrent-delivery
// behavior can be tested without receiving or logging raw webhook bodies.
export async function withSquareWebhookClaim<T>(input: { eventId: string; eventType: string; rawBody: string }, work: () => Promise<T>): Promise<{ state: "completed" | "processing" | "processed"; value?: T }> {
  const claim = await claimSquareWebhookEvent(input);
  if (claim.state !== "claimed") return { state: claim.state };

  let value: T;
  try {
    value = await work();
  } catch (error) {
    await releaseSquareWebhookEvent({ eventId: input.eventId, processingToken: claim.processingToken });
    throw error;
  }

  try {
    await completeSquareWebhookEvent({ eventId: input.eventId, processingToken: claim.processingToken });
  } catch (error) {
    if (error instanceof SquareWebhookClaimLostError) {
      console.warn("Square webhook claim lost after processing.", { eventId: input.eventId, eventType: input.eventType });
      return { state: "processed", value };
    }
    await releaseSquareWebhookEvent({ eventId: input.eventId, processingToken: claim.processingToken });
    throw error;
  }

  return { state: "processed", value };
}

export async function startSquareCheckout(input: {
  userId: string;
  productId: SquareProductId;
  config: SquareConfig;
}): Promise<{ checkoutUrl: string }> {
  if (input.productId === "monthly" && (!input.config.monthlyPlanId || !input.config.monthlyPlanVariationId)) {
    throw new SquareCheckoutServiceError("Monthly checkout is not configured.");
  }
  const prisma = await getSquarePrisma();
  const product = getSquareProduct(input.config, input.productId);
  const monthlyPlanVariationId = product.kind === "subscription" ? input.config.monthlyPlanVariationId : null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PENDING_CHECKOUT_TTL_MS);
  // Serialize the complete find/abandon/create/remote-call sequence with a
  // PostgreSQL advisory lock. This is database-backed (never an in-memory
  // mutex), so concurrent web processes cannot create two links for one
  // user/product/Square context. pendingKey is also unique as a last-resort
  // database guard.
  const pendingKey = createHash("sha256")
    .update([
      input.userId,
      product.ledgerProduct,
      input.config.applicationId,
      input.config.environment,
      input.config.locationId,
      product.kind === "subscription" ? input.config.monthlyPlanId : "",
      monthlyPlanVariationId ?? "",
    ].join("\u0000"))
    .digest("hex");

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${pendingKey}))::text`);
    // A retry reuses a short-lived, server-owned link only when every Square
    // context field matches that used to create it. Browser input never
    // supplies the checkout/session identifier or Square idempotency key.
    const pending = await transaction.squareCheckout.findFirst({
      where: {
        pendingKey,
        squarePaymentId: null,
        completedAt: null,
        checkoutUrl: { not: null },
        expiresAt: { gt: now },
        userId: input.userId,
        product: product.ledgerProduct as SquareProduct,
        squareApplicationId: input.config.applicationId,
        squareEnvironment: input.config.environment,
        squareLocationId: input.config.locationId,
        squarePlanVariationId: monthlyPlanVariationId,
      },
      orderBy: { updatedAt: "desc" },
      select: { checkoutUrl: true },
    });
    if (pending?.checkoutUrl) return { checkoutUrl: pending.checkoutUrl };

    // Abandon stale or configuration-mismatched links locally. We do not
    // claim that the Square-hosted link was deactivated. The sweep is scoped
    // to this Square environment/application so one environment never expires
    // another environment's pending links.
    await transaction.squareCheckout.updateMany({
      where: {
        userId: input.userId,
        product: product.ledgerProduct as SquareProduct,
        squareEnvironment: input.config.environment,
        squareApplicationId: input.config.applicationId,
        squarePaymentId: null,
        completedAt: null,
        checkoutUrl: { not: null },
      },
      data: { expiresAt: now, pendingKey: null },
    });

    const checkout = await transaction.squareCheckout.create({
      data: {
        userId: input.userId,
        product: product.ledgerProduct as SquareProduct,
        squareApplicationId: input.config.applicationId,
        squareEnvironment: input.config.environment,
        squareLocationId: input.config.locationId,
        squarePlanVariationId: monthlyPlanVariationId,
        pendingKey,
        expiresAt,
        // Generated only on the server and sent only to Square as an idempotency key.
        idempotencyKey: randomUUID(),
      },
      select: { id: true, idempotencyKey: true },
    });

    try {
      const link = await createSquarePaymentLink({
        checkoutId: checkout.id,
        idempotencyKey: checkout.idempotencyKey ?? checkout.id,
        config: input.config,
        product,
      });

      await transaction.squareCheckout.update({
        where: { id: checkout.id },
        data: { squareOrderId: link.orderId, squarePaymentLinkId: link.paymentLinkId, checkoutUrl: link.checkoutUrl },
      });

      return { checkoutUrl: link.checkoutUrl };
    } catch (error) {
      await transaction.squareCheckout.delete({ where: { id: checkout.id } }).catch(() => undefined);

      if (error instanceof Error) throw error;
      throw new SquareCheckoutServiceError();
    }
  }, { maxWait: 5_000, timeout: 20_000 });
}

type SettlementInput = {
  orderId: string;
  paymentId: string;
  customerId: string | null;
  monthlyPlanVariationId: string;
  /** Authoritative monthly price (config.monthlyPriceCents) for the entitlement audit. */
  priceCents: number;
  /** Captured from Square's completed payment; missing values fail closed for refunds. */
  amountCents?: number | null;
  currency?: string | null;
};

type Transaction = Prisma.TransactionClient;

async function recomputeAccessPlan(transaction: Transaction, userId: string) {
  const subscriptions = await transaction.squareSubscription.findMany({
    where: { userId },
    select: { status: true },
  });
  const hasActiveMonthlySubscription = subscriptions.some((subscription) => subscription.status === "ACTIVE");
  const lifetimeCheckout = await transaction.squareCheckout.findFirst({
    where: { userId, product: "LIFETIME", completedAt: { not: null }, refundedAt: null },
    select: { id: true },
  });
  // A successful one-time checkout is not proof of an active recurring plan.
  // Square grants Monthly only after its subscription webhook has been stored.
  const accessPlan = hasActiveMonthlySubscription
    ? "MONTHLY"
    : lifetimeCheckout
      ? "LIFETIME"
      : "NONE";

  await transaction.user.update({ where: { id: userId }, data: { accessPlan } });
  return accessPlan;
}

export async function settleSquareCheckout(input: SettlementInput): Promise<{
  status: "settled" | "duplicate" | "unknown";
  creditsGranted: number;
}> {
  const { prisma } = await import("@/lib/db/prisma");

  try {
    return await prisma.$transaction(async (transaction) => {
      const checkout = await transaction.squareCheckout.findUnique({
        where: { squareOrderId: input.orderId },
        select: { id: true, userId: true, product: true, squarePaymentId: true },
      });

      if (!checkout) return { status: "unknown" as const, creditsGranted: 0 };
      if (checkout.squarePaymentId) return { status: "duplicate" as const, creditsGranted: 0 };

      await transaction.squareCheckout.update({
        where: { id: checkout.id },
        data: {
          squarePaymentId: input.paymentId,
          squareCustomerId: input.customerId,
          pendingKey: null,
          completedAt: new Date(),
          ...(input.amountCents != null ? { amountCents: input.amountCents } : {}),
          ...(input.currency != null ? { currency: input.currency } : {}),
        },
      });

      if (checkout.product === "SINGLE_AUDIT" || checkout.product === "CREATOR_PACK") {
        if (process.env.SOCIALOLLA_LEGACY_CREDITS === "true") {
          // Legacy path preserved only under the explicit legacy flag (rollback).
          const credits = checkout.product === "SINGLE_AUDIT" ? 1 : 10;
          await transaction.creditAccount.upsert({
            where: { userId: checkout.userId },
            update: { balance: { increment: credits } },
            create: { userId: checkout.userId, balance: credits },
          });
          await transaction.creditLedger.create({
            data: {
              userId: checkout.userId,
              delta: credits,
              reason: `square_purchase:${checkout.product.toLowerCase()}`,
              squarePaymentId: input.paymentId,
              squareCustomerId: input.customerId,
            },
          });
          return { status: "settled" as const, creditsGranted: credits };
        }
        // M2 canonical path: credits granted as PURCHASED CreditBatch via the
        // canonical entitlement service (no legacy CreditAccount writes).
        const { grantCanonicalPack } = await import("@/lib/socialolla/entitlements/entitlement-service");
        const granted = await grantCanonicalPack({ ownerUserId: checkout.userId, squarePaymentId: input.paymentId, product: checkout.product }, transaction);
        return { status: "settled" as const, creditsGranted: granted.creditsGranted };
      }

      if (checkout.product === "MONTHLY" && input.customerId) {
        await transaction.squareSubscription.updateMany({
          where: {
            userId: null,
            squareCustomerId: input.customerId,
            planVariationId: input.monthlyPlanVariationId,
          },
          data: { userId: checkout.userId },
        });
        // M2 canonical monthly grant: entitlement snapshot + current-period
        // MONTHLY credit batch (reuse-first, exactly-once per squarePaymentId).
        const { grantMonthlyEntitlement } = await import("@/lib/socialolla/entitlements/entitlement-service");
        const granted = await grantMonthlyEntitlement(
          {
            ownerUserId: checkout.userId,
            squarePaymentId: input.paymentId,
            priceCents: input.priceCents,
          },
          transaction,
        );
        await recomputeAccessPlan(transaction, checkout.userId);
        return { status: "settled" as const, creditsGranted: granted.creditsGranted };
      }

      if (checkout.product === "LIFETIME") {
        // M2 canonical lifetime grant: versioned entitlement + PURCHASED batch.
        const { grantLifetimeEntitlement } = await import("@/lib/socialolla/entitlements/entitlement-service");
        const granted = await grantLifetimeEntitlement(
          {
            ownerUserId: checkout.userId,
            squarePaymentId: input.paymentId,
            priceCents: Number(process.env.SOCIALOLLA_LIFETIME_PRICE_CENTS ?? 7900),
          },
          transaction,
        );
        await recomputeAccessPlan(transaction, checkout.userId);
        return { status: "settled" as const, creditsGranted: granted.creditsGranted };
      }

      await recomputeAccessPlan(transaction, checkout.userId);
      return { status: "settled" as const, creditsGranted: 0 };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "duplicate", creditsGranted: 0 };
    }

    throw error;
  }
}

type SquareRefundSettlementInput = {
  refundId: string;
  paymentId: string;
  refundOrderId: string | null;
  locationId: string;
  merchantId: string;
  status: string;
  amountCents: number;
  currency: string;
  config: Pick<SquareConfig, "locationId" | "expectedMerchantId" | "currency">;
};

/**
 * Accept only one completed full refund for a completed payment. Refund order
 * IDs are retained as evidence but are deliberately not used for ownership:
 * Square may create a separate order for a refund. Ownership is the durable
 * payment -> checkout mapping, and pack ownership is the durable payment ->
 * PURCHASED batch mapping.
 */
export async function settleSquareRefund(input: SquareRefundSettlementInput): Promise<{
  status: "settled" | "duplicate" | "ignored" | "retry";
  creditsReversed: number;
}> {
  if (
    input.status !== "COMPLETED" ||
    input.locationId !== input.config.locationId ||
    input.merchantId !== input.config.expectedMerchantId ||
    input.currency !== input.config.currency ||
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !input.refundId ||
    !input.paymentId
  ) {
    return { status: "ignored", creditsReversed: 0 };
  }

  const { prisma } = await import("@/lib/db/prisma");
  try {
    return await prisma.$transaction(async (transaction) => {
      const existingRefund = await transaction.squareRefund.findUnique({
        where: { squareRefundId: input.refundId },
        select: { squareRefundId: true },
      });
      if (existingRefund) return { status: "duplicate" as const, creditsReversed: 0 };

      const checkout = await transaction.squareCheckout.findUnique({
        where: { squarePaymentId: input.paymentId },
        select: {
          id: true,
          userId: true,
          product: true,
          squarePaymentId: true,
          squareLocationId: true,
          completedAt: true,
          amountCents: true,
          currency: true,
          refundedAt: true,
        },
      });

      // If the payment has not been settled yet, release the webhook claim so
      // the provider can retry after the payment.updated mapping arrives.
      // Historical completed rows without immutable amount/currency provenance
      // and policy mismatches are permanent fail-closed ignores.
      if (!checkout || !checkout.squarePaymentId || !checkout.completedAt) {
        return { status: "retry" as const, creditsReversed: 0 };
      }
      if (checkout.amountCents == null || checkout.currency == null) {
        return { status: "ignored" as const, creditsReversed: 0 };
      }
      if (
        checkout.squareLocationId !== input.config.locationId ||
        checkout.amountCents !== input.amountCents ||
        checkout.currency !== input.currency ||
        checkout.refundedAt
      ) {
        return { status: "ignored" as const, creditsReversed: 0 };
      }

      // PROD-IMP-015 intentionally supports full refunds only. A partial
      // refund, including a series of partial refunds, cannot claw back an
      // entire purchased grant and is therefore rejected without a business
      // write. This can be expanded later with proportional allocation.
      let purchasedBatch: { id: string; workspaceId: string; kind: string; amount: number; remaining: number } | null = null;
      if (checkout.product === "SINGLE_AUDIT" || checkout.product === "CREATOR_PACK") {
        purchasedBatch = await transaction.creditBatch.findUnique({
          where: { squarePaymentId: input.paymentId },
          select: { id: true, workspaceId: true, kind: true, amount: true, remaining: true },
        });
        const expectedCredits = checkout.product === "SINGLE_AUDIT" ? 1 : 10;
        if (!purchasedBatch || purchasedBatch.kind !== "PURCHASED" || purchasedBatch.amount !== expectedCredits) {
          return { status: "ignored" as const, creditsReversed: 0 };
        }
      }

      const refundedAt = new Date();
      const claimed = await transaction.squareCheckout.updateMany({
        where: { id: checkout.id, refundedAt: null },
        data: { refundedAt },
      });
      if (claimed.count !== 1) return { status: "ignored" as const, creditsReversed: 0 };

      await transaction.squareRefund.create({
        data: {
          squareRefundId: input.refundId,
          squarePaymentId: input.paymentId,
          squareRefundOrderId: input.refundOrderId,
          squareCheckoutId: checkout.id,
          userId: checkout.userId,
          product: checkout.product,
          status: input.status,
          amountCents: input.amountCents,
          currency: input.currency,
          refundedAt,
          processedAt: refundedAt,
        },
      });

      let creditsReversed = 0;
      if (purchasedBatch) {
        // Only unused credits can be removed. The guarded update plus the
        // serializable transaction prevents a negative remaining balance even
        // when a pack was partly consumed before the refund arrived.
        const target = Math.max(0, purchasedBatch.remaining);
        if (target > 0) {
          const reduced = await transaction.creditBatch.updateMany({
            where: { id: purchasedBatch.id, remaining: { gte: target } },
            data: { remaining: { decrement: target } },
          });
          if (reduced.count !== 1) throw new Error("Square refund batch changed concurrently; retry.");
          await transaction.creditTransaction.create({
            data: {
              batchId: purchasedBatch.id,
              kind: "ADJUSTMENT",
              amount: -target,
              reference: `square_refund:${input.refundId}`,
              idempotencyKey: `square:refund:${input.refundId}`,
            },
          });
          creditsReversed = target;
        }
      }

      await transaction.squarePaymentAuditLog.create({
        data: {
          userId: checkout.userId,
          squareCheckoutId: checkout.id,
          source: "WEBHOOK",
          eventType: "refund.completed",
          effectiveDate: refundedAt.toISOString(),
        },
      });
      await recomputeAccessPlan(transaction, checkout.userId);
      return { status: "settled" as const, creditsReversed };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : (error as { code?: unknown }).code;
    if (code === "P2002") {
      const existingRefund = await prisma.squareRefund.findUnique({
        where: { squareRefundId: input.refundId },
        select: { squareRefundId: true },
      });
      if (existingRefund) return { status: "duplicate", creditsReversed: 0 };
    }
    throw error;
  }
}

/**
 * Reconcile recurring MONTHLY renewal payments (Square auto-charge orders never
 * map to a server-created SquareCheckout). PROD-IMP-014: exactly-one ACTIVE
 * subscription match, amount must equal the configured monthly price, and a
 * synthetic settlement row (inert: checkoutUrl/pending/link/idempotency/expiry
 * all null) gives exactly-once via the existing unique keys.
 */
export async function settleSquareRenewal(input: {
  orderId: string;
  paymentId: string;
  customerId: string;
  monthlyPlanVariationId: string;
  amountCents: number;
  currency?: string | null;
  config: SquareConfig;
}): Promise<{ status: "settled" | "duplicate" | "unknown"; creditsGranted: number }> {
  const { prisma } = await import("@/lib/db/prisma");

  const auditUnknown = async (transaction: Transaction, reason: string) => {
    await transaction.squarePaymentAuditLog.create({
      data: { source: "WEBHOOK", eventType: "payment.renewal.unknown", subscriptionStatus: reason },
    });
  };

  try {
    return await prisma.$transaction(async (transaction) => {
      // C1: a renewal must equal the configured monthly price. A non-renewal
      // COMPLETED payment (invoice, dashboard, Tap-to-Pay) must never be minted
      // as a renewal; amount mismatch -> audit-only, no grant.
      if (input.amountCents !== input.config.monthlyPriceCents) {
        await auditUnknown(transaction, "amount_mismatch");
        return { status: "unknown" as const, creditsGranted: 0 };
      }
      if (!input.customerId) {
        await auditUnknown(transaction, "no_customer");
        return { status: "unknown" as const, creditsGranted: 0 };
      }

      // Exactly-one ACTIVE MONTHLY subscription match (fail closed on ambiguity).
      const subscriptions = await transaction.squareSubscription.findMany({
        where: { squareCustomerId: input.customerId, planVariationId: input.monthlyPlanVariationId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, userId: true },
        take: 2,
      });
      if (subscriptions.length !== 1) {
        await auditUnknown(transaction, subscriptions.length === 0 ? "no_active_subscription" : "subscription_ambiguous");
        return { status: "unknown" as const, creditsGranted: 0 };
      }
      const subscription = subscriptions[0];

      // Duplicate short-circuit: this payment already settled.
      const existing = await transaction.squareCheckout.findFirst({
        where: { squarePaymentId: input.paymentId },
        select: { id: true },
      });
      if (existing) return { status: "duplicate" as const, creditsGranted: 0 };

      // Ownership: prefer the subscription's userId; fall back to exactly-one
      // completed MONTHLY checkout EXCLUDING synthetic rows (checkoutUrl IS NULL)
      // so synthetic renewal rows never pollute count-based inference.
      let userId = subscription.userId;
      if (!userId) {
        const completed = await transaction.squareCheckout.findMany({
          where: { product: "MONTHLY", squareCustomerId: input.customerId, completedAt: { not: null }, checkoutUrl: { not: null } },
          select: { id: true, userId: true },
          take: 2,
        });
        if (completed.length !== 1 || !completed[0].userId) {
          await auditUnknown(transaction, "owner_inference_failed");
          return { status: "unknown" as const, creditsGranted: 0 };
        }
        userId = completed[0].userId;
      }

      // Synthetic settlement row (inert; C4 keeps every pending/unique column null).
      const synthetic = await transaction.squareCheckout.create({
        data: {
          userId,
          product: "MONTHLY",
          squareOrderId: input.orderId,
          squarePaymentId: input.paymentId,
          squareCustomerId: input.customerId,
          squareApplicationId: input.config.applicationId,
          squareEnvironment: input.config.environment,
          squareLocationId: input.config.locationId,
          squarePlanVariationId: input.config.monthlyPlanVariationId,
          amountCents: input.amountCents,
          currency: input.currency ?? input.config.currency,
          checkoutUrl: null,
          pendingKey: null,
          expiresAt: null,
          idempotencyKey: null,
          squarePaymentLinkId: null,
          completedAt: new Date(),
        },
        select: { id: true },
      });

      const { grantMonthlyEntitlement } = await import("@/lib/socialolla/entitlements/entitlement-service");
      const granted = await grantMonthlyEntitlement(
        { ownerUserId: userId, squarePaymentId: input.paymentId, priceCents: input.config.monthlyPriceCents },
        transaction,
      );
      await recomputeAccessPlan(transaction, userId);
      await transaction.squarePaymentAuditLog.create({
        data: {
          userId,
          squareCheckoutId: synthetic.id,
          squareSubscriptionId: subscription.id,
          source: "WEBHOOK",
          eventType: "payment.renewal",
        },
      });
      return { status: "settled" as const, creditsGranted: granted.creditsGranted };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as { code?: unknown }).code;
    if (code === "P2002" || code === "40001") {
      return { status: "duplicate", creditsGranted: 0 };
    }
    throw error;
  }
}

export async function recordSquareSubscription(input: {
  subscriptionId: string;
  customerId: string;
  planVariationId: string;
  status: string;
  canceledDate?: string | null;
  source?: "API" | "WEBHOOK";
  eventType?: string;
  eventCreatedAt?: string | null;
}): Promise<{ userId: string | null }> {
  const { prisma } = await import("@/lib/db/prisma");

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.squareSubscription.findUnique({
      where: { squareSubscriptionId: input.subscriptionId },
      select: { userId: true, status: true, lastEventAt: true },
    });
    const parsedEventAt = input.eventCreatedAt ? new Date(input.eventCreatedAt) : null;
    const incomingEventAt = parsedEventAt && !Number.isNaN(parsedEventAt.getTime()) ? parsedEventAt : null;
    // A terminal subscription state must never be resurrected by a delayed
    // ACTIVE delivery. When Square includes event time, ignore stale events.
    if (existing?.status === "CANCELED") {
      // Square's terminal CANCELED state is irreversible for this subscription.
      // Duplicate or delayed ACTIVE events must not restore paid access.
      if (existing.userId && input.status === "CANCELED") await recomputeAccessPlan(transaction, existing.userId);
      return { userId: existing.userId };
    }
    if (existing && incomingEventAt && existing.lastEventAt && incomingEventAt.getTime() <= existing.lastEventAt.getTime()) return { userId: existing.userId };
    let userId = existing?.userId ?? null;
    let squareCheckoutId: string | null = null;

    if (!userId) {
      const completedCheckouts = await transaction.squareCheckout.findMany({
        where: {
          product: "MONTHLY",
          squareCustomerId: input.customerId,
          completedAt: { not: null },
          // Exclude synthetic renewal rows (checkoutUrl IS NULL) so they never
          // pollute the exactly-one ownership inference (PROD-IMP-014).
          checkoutUrl: { not: null },
        },
        select: { id: true, userId: true },
        take: 2,
      });
      // Do not infer ownership when a Square customer maps to more than one
      // SocialOreo account. The payment/order mapping remains authoritative.
      if (completedCheckouts.length === 1) {
        userId = completedCheckouts[0].userId;
        squareCheckoutId = completedCheckouts[0].id;
      }
    }

    await transaction.squareSubscription.upsert({
      where: { squareSubscriptionId: input.subscriptionId },
      create: {
        squareSubscriptionId: input.subscriptionId,
        squareCustomerId: input.customerId,
        planVariationId: input.planVariationId,
        status: input.status,
        canceledDate: input.canceledDate ?? null,
        ...(incomingEventAt ? { lastEventAt: incomingEventAt } : {}),
        ...(userId ? { userId } : {}),
      },
      update: {
        squareCustomerId: input.customerId,
        planVariationId: input.planVariationId,
        status: input.status,
        canceledDate: input.canceledDate ?? null,
        ...(incomingEventAt ? { lastEventAt: incomingEventAt } : {}),
        ...(userId ? { userId } : {}),
      },
    });

    await transaction.squarePaymentAuditLog.create({
      data: {
        userId,
        squareCheckoutId,
        squareSubscriptionId: input.subscriptionId,
        source: input.source ?? "WEBHOOK",
        eventType: input.eventType ?? "subscription.updated",
        subscriptionStatus: input.status,
        effectiveDate: input.canceledDate ?? null,
      },
    });

    if (userId) await recomputeAccessPlan(transaction, userId);
    return { userId };
  }, { isolationLevel: "Serializable" });
}

export async function getActiveMonthlySubscriptionForUser(userId: string, planVariationId: string): Promise<{ subscriptionId: string; customerId: string; planVariationId: string } | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const subscription = await prisma.squareSubscription.findFirst({
    where: { userId, status: "ACTIVE", planVariationId },
    orderBy: { updatedAt: "desc" },
    select: { squareSubscriptionId: true, squareCustomerId: true, planVariationId: true },
  });
  return subscription ? {
    subscriptionId: subscription.squareSubscriptionId,
    customerId: subscription.squareCustomerId,
    planVariationId: subscription.planVariationId,
  } : null;
}
