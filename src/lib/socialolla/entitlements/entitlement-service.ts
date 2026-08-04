import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { lifetimePlan } from "@/lib/socialolla/plans/plan-config";
import { newAuditEventExternalId } from "@/lib/socialolla/credits/batch-service";

function newEntitlementExternalId(): string {
  return `ent_${randomBytes(12).toString("base64url")}`;
}

function newCreditBatchExternalId(): string {
  return `cbt_${randomBytes(12).toString("base64url")}`;
}

/**
 * Slice E: grant a versioned lifetime entitlement + canonical credit batches
 * on a verified sandbox settlement. Exactly-once via squarePaymentId.
 */
export async function grantLifetimeEntitlement(input: {
  ownerUserId: string;
  squarePaymentId: string;
  priceCents: number;
}): Promise<{ externalIds: { planVersion: string; entitlement: string; batch: string }; creditsGranted: number }> {
  const workspace = await getOrCreatePersonalWorkspace(input.ownerUserId);
  const plan = lifetimePlan();

  const canonicalPlanExternalId = `plv_lifetime_v${plan.version}`;
  const planVersion = await prisma.planVersion.upsert({
    where: { externalId: canonicalPlanExternalId },
    update: {},
    create: {
      externalId: canonicalPlanExternalId,
      version: plan.version,
      name: plan.name,
      status: "ACTIVE",
    },
  });

  const entitlement = await prisma.entitlementSnapshot.create({
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

  const batch = await prisma.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: workspace.dbId,
      kind: "PURCHASED",
      amount: plan.entitlements.includedMonthlyCredits,
      remaining: plan.entitlements.includedMonthlyCredits,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditEvent.create({
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
        batch: batch.externalId,
        credits: plan.entitlements.includedMonthlyCredits,
      },
    },
  });

  return {
    externalIds: { planVersion: planVersion.externalId, entitlement: entitlement.externalId, batch: batch.externalId },
    creditsGranted: plan.entitlements.includedMonthlyCredits,
  };
}

/** Canonical pack grant (SINGLE_AUDIT/CREATOR_PACK) as a PURCHASED batch. */
export async function grantCanonicalPack(input: {
  ownerUserId: string;
  squarePaymentId: string;
  product: "SINGLE_AUDIT" | "CREATOR_PACK";
}): Promise<{ creditsGranted: number }> {
  const workspace = await getOrCreatePersonalWorkspace(input.ownerUserId);
  const credits = input.product === "SINGLE_AUDIT" ? 1 : 10;
  const batch = await prisma.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: workspace.dbId,
      kind: "PURCHASED",
      amount: credits,
      remaining: credits,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.auditEvent.create({
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
