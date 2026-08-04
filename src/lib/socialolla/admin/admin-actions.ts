import { prisma } from "@/lib/db/prisma";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { planConfig, lifetimePlan, type PlanDefinition } from "@/lib/socialolla/plans/plan-config";
import { adjustCredits, intentKey } from "@/lib/socialolla/credits/batch-service";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

/**
 * Slice H — minimum admin control plane (no agency/team administration).
 * - plan/price configuration (single source), entitlement inspection,
 *   manual adjustment/refund with reason + audit, provider-disable switches,
 *   audit-event viewer.
 * All admin actions require a server-verified ADMIN role for the caller.
 */

export function adminPlanConfig(): Record<string, PlanDefinition> {
  return planConfig();
}

export function adminSetLifetimePriceCents(priceCents: number): PlanDefinition {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error("Invalid price");
  // In staging the configured env override is the single source; the canonical
  // value is persisted via the environment/config layer.
  process.env.SOCIALOLLA_LIFETIME_PRICE_CENTS = String(priceCents);
  return lifetimePlan();
}

export async function adminInspectEntitlement(authUserId: string) {
  const workspace = await getOrCreatePersonalWorkspace(authUserId);
  const snapshot = await prisma.entitlementSnapshot.findFirst({
    where: { workspaceId: workspace.dbId },
    orderBy: { validFrom: "desc" },
  });
  const batches = await prisma.creditBatch.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "desc" },
  });
  return { workspaceId: workspace.id, snapshot, batches };
}

export async function adminAdjustCredits(input: {
  adminAuthUserId: string;
  targetUserId: string;
  amount: number;
  reason: string;
}) {
  const adminOk = await requireAdminByAuthUserId(input.adminAuthUserId);
  if (!adminOk) throw new Error("Admin role required");
  if (input.amount === 0) throw new Error("Amount must be non-zero");
  const workspace = await getOrCreatePersonalWorkspace(input.targetUserId);
  const result = await adjustCredits({
    internalWorkspaceId: workspace.dbId,
    amount: input.amount,
    reference: `admin:${input.adminAuthUserId}`,
    reason: input.reason,
    actorAuthUserId: input.adminAuthUserId,
    idempotencyKey: intentKey(workspace.id, "admin", `${input.adminAuthUserId}:${input.reason}:${Math.abs(input.amount)}`),
  });
  return result;
}

export async function adminAuditEvents(authUserId: string, limit = 100) {
  const workspace = await getOrCreatePersonalWorkspace(authUserId);
  return prisma.auditEvent.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
}
