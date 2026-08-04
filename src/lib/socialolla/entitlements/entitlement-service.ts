import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { lifetimePlan, monthlyPlan } from "@/lib/socialolla/plans/plan-config";
import { ensureMonthlyBatch, newAuditEventExternalId, periodKeyForDate } from "@/lib/socialolla/credits/batch-service";

type DbLike = Prisma.TransactionClient;

function newEntitlementExternalId(): string {
  return `ent_${randomBytes(12).toString("base64url")}`;
}

function newCreditBatchExternalId(): string {
  return `cbt_${randomBytes(12).toString("base64url")}`;
}

/**
 * Slice E: grant a versioned lifetime entitlement + canonical credit batches
 * on a verified sandbox settlement. Exactly-once via squarePaymentId.
 *
 * DATA-01 fix: an optional `db` (transaction client) keeps all writes inside
 * the settlement transaction so a partial failure cannot leave credits granted
 * while the payment stays unsettled (no double-grant on Square redelivery).
 */
export async function grantLifetimeEntitlement(
  input: {
    ownerUserId: string;
    squarePaymentId: string;
    priceCents: number;
  },
  db: DbLike = prisma,
): Promise<{ externalIds: { planVersion: string; entitlement: string; batch: string }; creditsGranted: number }> {
  const workspace = await getOrCreatePersonalWorkspace(input.ownerUserId, undefined, db);
  const plan = lifetimePlan();

  const canonicalPlanExternalId = `plv_lifetime_v${plan.version}`;
  const planVersion = await db.planVersion.upsert({
    where: { externalId: canonicalPlanExternalId },
    update: {},
    create: {
      externalId: canonicalPlanExternalId,
      version: plan.version,
      name: plan.name,
      status: "ACTIVE",
    },
  });

  const entitlement = await db.entitlementSnapshot.create({
    data: {
      externalId: newEntitlementExternalId(),
      workspaceId: workspace.dbId,
      planVersionId: planVersion.id,
      maxWatchCompetitors: plan.entitlements.maxWatchCompetitors,
      maxDestinations: plan.entitlements.maxDestinations,
      includedMonthlyCredits: plan.entitlements.includedMonthlyCredits,
      postCreditsPerRequest: plan.entitlements.postCreditsPerRequest,
      watchCreditsPerRequest: plan.entitlements.watchCreditsPerRequest,
      validFrom: new Date(),
    },
  });

  const now = new Date();
  const periodKey = periodKeyForDate(now);
  // BACKEND-01: upsert the period MONTHLY batch instead of blind-creating. The
  // @@unique([workspaceId, kind, periodKey]) constraint would otherwise abort a
  // second lifetime settlement in the same calendar period (or a re-purchase
  // after a manual m2EnsureMonthlyBatch) with P2002, rolling the settlement
  // transaction back and leaving squarePaymentId null (permanently unsettled).
  // Reuse never mints extra credits: `created` tells us if any were minted.
  const batch = await ensureMonthlyBatch({
    internalWorkspaceId: workspace.dbId,
    externalWorkspaceId: workspace.id,
    includedCredits: plan.entitlements.includedMonthlyCredits,
    periodKey,
    db,
  });
  if (!batch) throw new Error("Failed to provision monthly credit batch");

  await db.auditEvent.create({
    data: {
      externalId: newAuditEventExternalId(),
      workspaceId: workspace.dbId,
      actorAuthUserId: input.ownerUserId,
      eventType: "entitlement.grant",
      payload: {
        squarePaymentId: input.squarePaymentId,
        priceCents: input.priceCents,
        planVersion: planVersion.externalId,
        entitlement: entitlement.externalId,
        batch: batch.id,
        credits: batch.created ? plan.entitlements.includedMonthlyCredits : 0,
        batchReused: !batch.created,
      },
    },
  });

  return {
    externalIds: { planVersion: planVersion.externalId, entitlement: entitlement.externalId, batch: batch.id },
    creditsGranted: batch.created ? plan.entitlements.includedMonthlyCredits : 0,
  };
}

/**
 * Slice E: grant a versioned monthly entitlement + current-period MONTHLY
 * credit batch on a verified sandbox subscription settlement. Exactly-once via
 * squarePaymentId (enforced by the caller's settlement transaction). Reuses the
 * period batch so repeat monthly payments in the same period never double-mint.
 */
export async function grantMonthlyEntitlement(
  input: {
    ownerUserId: string;
    squarePaymentId: string;
    priceCents: number;
  },
  db: DbLike = prisma,
): Promise<{ externalIds: { planVersion: string; entitlement: string; batch: string }; creditsGranted: number }> {
  const workspace = await getOrCreatePersonalWorkspace(input.ownerUserId, undefined, db);
  const plan = monthlyPlan();

  const canonicalPlanExternalId = `plv_monthly_v${plan.version}`;
  const planVersion = await db.planVersion.upsert({
    where: { externalId: canonicalPlanExternalId },
    update: {},
    create: {
      externalId: canonicalPlanExternalId,
      version: plan.version,
      name: plan.name,
      status: "ACTIVE",
    },
  });

  const entitlement = await db.entitlementSnapshot.create({
    data: {
      externalId: newEntitlementExternalId(),
      workspaceId: workspace.dbId,
      planVersionId: planVersion.id,
      maxWatchCompetitors: plan.entitlements.maxWatchCompetitors,
      maxDestinations: plan.entitlements.maxDestinations,
      includedMonthlyCredits: plan.entitlements.includedMonthlyCredits,
      postCreditsPerRequest: plan.entitlements.postCreditsPerRequest,
      watchCreditsPerRequest: plan.entitlements.watchCreditsPerRequest,
      validFrom: new Date(),
    },
  });

  const batch = await ensureMonthlyBatch({
    internalWorkspaceId: workspace.dbId,
    externalWorkspaceId: workspace.id,
    includedCredits: plan.entitlements.includedMonthlyCredits,
    periodKey: periodKeyForDate(),
    db,
  });
  if (!batch) throw new Error("Failed to provision monthly credit batch");

  await db.auditEvent.create({
    data: {
      externalId: newAuditEventExternalId(),
      workspaceId: workspace.dbId,
      actorAuthUserId: input.ownerUserId,
      eventType: "entitlement.grant",
      payload: {
        squarePaymentId: input.squarePaymentId,
        priceCents: input.priceCents,
        planVersion: planVersion.externalId,
        entitlement: entitlement.externalId,
        batch: batch.id,
        credits: batch.created ? plan.entitlements.includedMonthlyCredits : 0,
        batchReused: !batch.created,
      },
    },
  });

  return {
    externalIds: { planVersion: planVersion.externalId, entitlement: entitlement.externalId, batch: batch.id },
    creditsGranted: batch.created ? plan.entitlements.includedMonthlyCredits : 0,
  };
}

/** Canonical pack grant (SINGLE_AUDIT/CREATOR_PACK) as a PURCHASED batch. */
export async function grantCanonicalPack(
  input: {
    ownerUserId: string;
    squarePaymentId: string;
    product: "SINGLE_AUDIT" | "CREATOR_PACK";
  },
  db: DbLike = prisma,
): Promise<{ creditsGranted: number }> {
  const workspace = await getOrCreatePersonalWorkspace(input.ownerUserId, undefined, db);
  const credits = input.product === "SINGLE_AUDIT" ? 1 : 10;
  const batch = await db.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: workspace.dbId,
      kind: "PURCHASED",
      amount: credits,
      remaining: credits,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  await db.auditEvent.create({
    data: {
      externalId: newAuditEventExternalId(),
      workspaceId: workspace.dbId,
      actorAuthUserId: input.ownerUserId,
      eventType: "credit.grant.pack",
      payload: { squarePaymentId: input.squarePaymentId, product: input.product, batch: batch.externalId, credits },
    },
  });
  return { creditsGranted: credits };
}
