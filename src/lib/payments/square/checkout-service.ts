import { createHash, randomUUID } from "node:crypto";

import { Prisma, type SquareProduct } from "@prisma/client";
import { prisma as dbPrisma } from "@/lib/db/prisma";

import type { SquareConfig } from "./config";
import { createSquarePaymentLink } from "./create-payment-link";
import { getSquareProduct, type SquareProductId } from "./products";

export class SquareCheckoutServiceError extends Error {
  constructor(message = "We could not open checkout.") {
    super(message);
    this.name = "SquareCheckoutServiceError";
  }
}

const WEBHOOK_LEASE_MS = 5 * 60 * 1000;
const PENDING_CHECKOUT_TTL_MS = 15 * 60 * 1000;

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
  if (result.count !== 1) throw new SquareCheckoutServiceError("Webhook claim was lost before completion.");
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
  try {
    const value = await work();
    await completeSquareWebhookEvent({ eventId: input.eventId, processingToken: claim.processingToken });
    return { state: "processed", value };
  } catch (error) {
    await releaseSquareWebhookEvent({ eventId: input.eventId, processingToken: claim.processingToken });
    throw error;
  }
}

export async function startSquareCheckout(input: {
  userId: string;
  productId: SquareProductId;
  config: SquareConfig;
}): Promise<{ checkoutUrl: string }> {
  const prisma = dbPrisma;
  const product = getSquareProduct(input.config, input.productId);
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
      "sandbox",
      input.config.locationId,
      product.kind === "subscription" ? product.catalogVariationId : "",
    ].join("\u0000"))
    .digest("hex");

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${pendingKey}))`);
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
        squareEnvironment: "sandbox",
        squareLocationId: input.config.locationId,
        squarePlanVariationId: product.kind === "subscription" ? product.catalogVariationId : null,
      },
      orderBy: { updatedAt: "desc" },
      select: { checkoutUrl: true },
    });
    if (pending?.checkoutUrl) return { checkoutUrl: pending.checkoutUrl };

    // Abandon stale or configuration-mismatched links locally. We do not
    // claim that the Square-hosted link was deactivated.
    await transaction.squareCheckout.updateMany({
      where: {
        userId: input.userId,
        product: product.ledgerProduct as SquareProduct,
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
        squareEnvironment: "sandbox",
        squareLocationId: input.config.locationId,
        squarePlanVariationId: product.kind === "subscription" ? product.catalogVariationId : null,
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
};

type Transaction = Prisma.TransactionClient;

async function recomputeAccessPlan(transaction: Transaction, userId: string) {
  const subscriptions = await transaction.squareSubscription.findMany({
    where: { userId },
    select: { status: true },
  });
  const hasActiveMonthlySubscription = subscriptions.some((subscription) => subscription.status === "ACTIVE");
  const lifetimeCheckout = await transaction.squareCheckout.findFirst({
    where: { userId, product: "LIFETIME", completedAt: { not: null } },
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
        },
      });

      if (checkout.product === "SINGLE_AUDIT" || checkout.product === "CREATOR_PACK") {
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

      if (checkout.product === "MONTHLY" && input.customerId) {
        await transaction.squareSubscription.updateMany({
          where: {
            userId: null,
            squareCustomerId: input.customerId,
            planVariationId: input.monthlyPlanVariationId,
          },
          data: { userId: checkout.userId },
        });
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

export async function getActiveMonthlySubscriptionForUser(userId: string): Promise<{ subscriptionId: string; customerId: string; planVariationId: string } | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const subscription = await prisma.squareSubscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { squareSubscriptionId: true, squareCustomerId: true, planVariationId: true },
  });
  return subscription ? {
    subscriptionId: subscription.squareSubscriptionId,
    customerId: subscription.squareCustomerId,
    planVariationId: subscription.planVariationId,
  } : null;
}
