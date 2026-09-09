import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

function randomExternalId(prefix: string): string {
  return `${prefix}${randomBytes(12).toString("base64url")}`;
}

export const newCreditBatchExternalId = () => randomExternalId("cbt_");
export const newAuditEventExternalId = () => randomExternalId("evt_");

/**
 * Single canonical intent-key derivation shared by execute and release paths.
 * BLOCKER-2 fix: execute and releasePostHold MUST derive identical keys for the
 * same (workspace, destination, intent), so a refund always finds its HOLD.
 */
export function intentKey(workspaceExternalId: string, destinationExternalId: string, intent: string): string {
  const slug = intent.trim().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "default";
  const digest = createHash("sha256").update(`${workspaceExternalId}:${destinationExternalId}:${slug}`).digest("hex").slice(0, 12);
  return `so:${workspaceExternalId}:${destinationExternalId}:${slug}:${digest}`;
}

export function holdKey(intent: string): string {
  return `${intent}:hold`;
}

export function finalizeKey(intent: string): string {
  return `${intent}:finalize`;
}

export function refundKey(intent: string): string {
  return `${intent}:refund`;
}

export function periodKeyForDate(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monthly batches are an included-plan benefit, not an independent grant.
 * Keep the active-plan check in one place so every credit consumer applies the
 * same revocation boundary after a payment refund or subscription cancellation.
 */
export function hasActiveCreditPlan(accessPlan: string | null | undefined): boolean {
  return accessPlan === "LIFETIME" || accessPlan === "MONTHLY";
}

/**
 * Ensure the current-period MONTHLY batch for a workspace, created race-safely
 * under a unique (workspaceId, kind, periodKey) constraint. Reuses an existing
 * period batch instead of blind-creating (no double-grant / no double-credit),
 * and returns `created` so callers can report whether new credits were minted.
 * An optional `db` lets an active-plan caller run the create inside the
 * enclosing transaction. Confined to grant/settlement paths (never
 * read/preview/release). Direct callers must have an active paid plan.
 */
type MonthlyBatchDb = {
  user: Pick<Prisma.TransactionClient["user"], "updateMany">;
  workspace: Pick<Prisma.TransactionClient["workspace"], "findUnique">;
  creditBatch: Pick<Prisma.TransactionClient["creditBatch"], "findFirst" | "create">;
};

type EnsureMonthlyBatchInput = {
  internalWorkspaceId: string;
  externalWorkspaceId: string;
  includedCredits: number;
  periodKey?: string;
  db?: MonthlyBatchDb;
};

type EnsureMonthlyBatchSettlementInput = Omit<EnsureMonthlyBatchInput, "db"> & { db: MonthlyBatchDb };

async function ensureMonthlyBatchInTransaction(input: EnsureMonthlyBatchInput, db: MonthlyBatchDb, enforceActivePlan: boolean) {
  const period = input.periodKey ?? periodKeyForDate();
  if (enforceActivePlan) {
    const workspace = await db.workspace.findUnique({
      where: { id: input.internalWorkspaceId },
      select: { ownerUserId: true, ownerUser: { select: { accessPlan: true } } },
    });
    if (!workspace || !hasActiveCreditPlan(workspace.ownerUser?.accessPlan)) return null;
    // Keep the plan row locked through the batch lookup/create. A conditional
    // update prevents a refund that won the race from being overwritten by a
    // stale active-plan read.
    const locked = await db.user.updateMany({
      where: { id: workspace.ownerUserId, accessPlan: { in: ["LIFETIME", "MONTHLY"] } },
      // A no-op atomic update acquires the owner row lock without copying a
      // potentially stale plan value over a concurrent entitlement change.
      data: { freeAuditAllowanceRemaining: { increment: 0 } },
    });
    if (locked.count !== 1) return null;
  }
  const existing = await db.creditBatch.findFirst({
    where: { workspaceId: input.internalWorkspaceId, kind: "MONTHLY", periodKey: period },
  });
  if (existing) {
    return {
      id: existing.externalId,
      internalId: existing.id,
      workspaceId: input.externalWorkspaceId,
      kind: existing.kind,
      amount: existing.amount,
      remaining: existing.remaining,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
      createdAt: existing.createdAt.toISOString(),
      created: false,
    };
  }
  if (input.includedCredits <= 0) return null;
  const created = await db.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: input.internalWorkspaceId,
      kind: "MONTHLY",
      amount: input.includedCredits,
      remaining: input.includedCredits,
      periodKey: period,
    },
  });
  return {
    id: created.externalId,
    internalId: created.id,
    workspaceId: input.externalWorkspaceId,
    kind: created.kind,
    amount: created.amount,
    remaining: created.remaining,
    expiresAt: null,
    createdAt: created.createdAt.toISOString(),
    created: true,
  };
}

export async function ensureMonthlyBatch(input: EnsureMonthlyBatchInput) {
  if (input.db) {
    return ensureMonthlyBatchInTransaction(input, input.db, true);
  }
  // The normal customer path must hold the owner-plan lock until the
  // find-or-create completes, so a concurrent refund cannot leave a newly
  // minted MONTHLY batch behind after access is revoked.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => ensureMonthlyBatchInTransaction(input, transaction, true),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
      if ((code === "P2002" || code === "P2034" || code === "40001") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Could not ensure monthly batch");
}

/**
 * Settlement-only monthly grant. The caller must already be inside the
 * serializable, verified payment-settlement transaction that creates the
 * entitlement and recomputes the owner's access plan.
 */
export async function ensureMonthlyBatchForSettlement(input: EnsureMonthlyBatchSettlementInput) {
  return ensureMonthlyBatchInTransaction(input, input.db, false);
}

interface BatchRow {
  id: string;
  externalId: string;
  workspaceId: string;
  kind: string;
  amount: number;
  remaining: number;
  expiresAt: Date | null;
  periodKey: string | null;
  createdAt: Date;
}

/**
 * Shared batch selector (single source of truth for Post, Watch, admin adjust):
 * current-period MONTHLY first, then PURCHASED ordered by earliest expiresAt;
 * skip expired or insufficient batches; return the first sufficient batch.
 */
export async function selectSpendableBatch(internalWorkspaceId: string, amount: number): Promise<BatchRow | null> {
  const now = new Date();
  const period = periodKeyForDate(now);
  // Resolve the owner plan before selecting any batch. Historical MONTHLY
  // batches remain durable evidence, but they must not be spendable after the
  // owning payment/entitlement has been revoked. Purchased packs remain
  // usable independently of the included monthly benefit.
  const workspace = await prisma.workspace.findUnique({
    where: { id: internalWorkspaceId },
    select: { ownerUser: { select: { accessPlan: true } } },
  });
  if (!workspace) return null;
  const batches = await prisma.creditBatch.findMany({
    where: { workspaceId: internalWorkspaceId },
    orderBy: [{ kind: "asc" }, { expiresAt: "asc" }],
  });
  const monthly = hasActiveCreditPlan(workspace.ownerUser?.accessPlan)
    ? batches.filter((b) => b.kind === "MONTHLY" && b.periodKey === period)
    : [];
  const purchased = batches
    .filter((b) => b.kind === "PURCHASED" && (b.expiresAt === null || b.expiresAt > now))
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0));
  const ordered = [...monthly, ...purchased];
  return ordered.find((b) => b.remaining >= amount) ?? null;
}

async function auditEvent(workspaceId: string, eventType: string, payload: Record<string, unknown>, actorAuthUserId?: string) {
  await prisma.auditEvent.create({
    data: {
      externalId: newAuditEventExternalId(),
      workspaceId,
      actorAuthUserId,
      eventType,
      payload: payload as object,
    },
  });
}

/**
 * Idempotent credit hold against the selected spendable batch. The unique
 * idempotencyKey on CreditTransaction guarantees a given intent is never
 * charged twice. Expired batches are refused.
 */
export async function holdCredits(params: {
  internalWorkspaceId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
  actorAuthUserId?: string;
}) {
  if (!Number.isInteger(params.amount) || params.amount <= 0) throw new Error("Invalid hold amount");
  if (!params.idempotencyKey.startsWith("so:")) throw new Error("Invalid idempotency key");
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    select: { kind: true, batch: { select: { kind: true, workspace: { select: { ownerUser: { select: { accessPlan: true } } } } } } },
  });
  if (existing) {
    if (existing.kind === "HOLD" && existing.batch?.kind === "MONTHLY") {
      const ownerPlan = existing.batch.workspace?.ownerUser?.accessPlan;
      if (!hasActiveCreditPlan(ownerPlan)) throw new Error("Credit plan is no longer active");
    }
    return { held: true, replayed: true, batchExternalId: undefined as string | undefined };
  }

  const batch = await selectSpendableBatch(params.internalWorkspaceId, params.amount);
  if (!batch) throw new Error("Insufficient credits");

  // Interactive transaction: the HOLD create rolls back if the guarded decrement
  // matches 0 (concurrent drain) — no phantom HOLD is ever persisted.
  const transaction = await prisma.$transaction(async (tx) => {
    // Re-check the plan at the guarded decrement itself. The selector runs
    // before this transaction, so a refund committing between those two steps
    // must still make a MONTHLY hold fail closed instead of spending revoked
    // included credits. PURCHASED packs intentionally have no plan predicate.
    const activePlanGuard: Prisma.CreditBatchWhereInput = batch.kind === "MONTHLY"
      ? { workspace: { ownerUser: { accessPlan: { in: ["LIFETIME", "MONTHLY"] } } } }
      : {};
    const updated = await tx.creditBatch.updateMany({
      where: { id: batch.id, remaining: { gte: params.amount }, ...activePlanGuard },
      data: { remaining: { decrement: params.amount } },
    });
    if (updated.count === 0) throw new Error("Insufficient credits");
    return tx.creditTransaction.create({
      data: {
        batchId: batch.id,
        kind: "HOLD",
        amount: params.amount,
        reference: params.reference,
        idempotencyKey: params.idempotencyKey,
      },
    });
  });
  await auditEvent(batch.workspaceId, "credit.hold", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return { held: true, replayed: false, transactionId: transaction.id, batchExternalId: batch.externalId };
}

async function matchingHold(intent: string) {
  return prisma.creditTransaction.findUnique({
    where: { idempotencyKey: holdKey(intent) },
  });
}

/** Finalize requires a matching HOLD and refuses after a REFUND. */
export async function finalizeCredits(params: {
  amount: number;
  reference: string;
  intent: string;
  actorAuthUserId?: string;
}) {
  const hold = await matchingHold(params.intent);
  if (!hold) throw new Error("No matching hold for finalize");
  if (hold.amount !== params.amount) throw new Error("Finalize amount does not match hold");
  const settlement = await prisma.$transaction(async (tx) => {
    // Lock the batch so FINALIZE and REFUND cannot both pass their terminal
    // state checks concurrently for the same HOLD.
    await tx.creditBatch.update({ where: { id: hold.batchId }, data: { remaining: { increment: 0 } } });
    const batch = await tx.creditBatch.findUnique({
      where: { id: hold.batchId },
      select: { kind: true, workspace: { select: { ownerUserId: true } } },
    });
    if (!batch) throw new Error("Credit batch not found");
    const refunded = await tx.creditTransaction.findUnique({ where: { idempotencyKey: refundKey(params.intent) } });
    if (refunded) throw new Error("Cannot finalize after refund");
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: finalizeKey(params.intent) } });
    if (existing) return { finalized: true, replayed: true };
    if (batch.kind === "MONTHLY") {
      // Finalization is another spend boundary. Lock and re-check the owner
      // after the batch lock so a refund that wins the race makes this path
      // fail closed instead of settling an in-flight monthly HOLD.
      const locked = await tx.user.updateMany({
        where: { id: batch.workspace.ownerUserId, accessPlan: { in: ["LIFETIME", "MONTHLY"] } },
        data: { freeAuditAllowanceRemaining: { increment: 0 } },
      });
      if (locked.count !== 1) throw new Error("Credit plan is no longer active");
    }
    await tx.creditTransaction.create({
      data: {
        batchId: hold.batchId,
        kind: "FINALIZE",
        amount: params.amount,
        reference: params.reference,
        idempotencyKey: finalizeKey(params.intent),
      },
    });
    return { finalized: true, replayed: false };
  });
  const batch = await prisma.creditBatch.findUnique({ where: { id: hold.batchId } });
  if (batch && !settlement.replayed) await auditEvent(batch.workspaceId, "credit.finalize", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return settlement;
}

/** Refund requires a matching HOLD (no credit inflation). */
export async function refundCredits(params: {
  amount: number;
  reference: string;
  intent: string;
  actorAuthUserId?: string;
}) {
  const hold = await matchingHold(params.intent);
  if (!hold) throw new Error("No matching hold for refund");
  if (hold.amount !== params.amount) throw new Error("Refund amount does not match hold");
  const settlement = await prisma.$transaction(async (tx) => {
    // The no-op update takes the same row lock as FINALIZE, making the
    // opposite-state check and terminal write one serialized transition.
    await tx.creditBatch.update({ where: { id: hold.batchId }, data: { remaining: { increment: 0 } } });
    const finalized = await tx.creditTransaction.findUnique({ where: { idempotencyKey: finalizeKey(params.intent) } });
    if (finalized) throw new Error("Cannot refund after finalize");
    const existing = await tx.creditTransaction.findUnique({ where: { idempotencyKey: refundKey(params.intent) } });
    if (existing) return { refunded: true, replayed: true };
    await tx.creditBatch.update({
      where: { id: hold.batchId },
      data: { remaining: { increment: params.amount } },
    });
    await tx.creditTransaction.create({
      data: {
        batchId: hold.batchId,
        kind: "REFUND",
        amount: params.amount,
        reference: params.reference,
        idempotencyKey: refundKey(params.intent),
      },
    });
    return { refunded: true, replayed: false };
  });
  const batch = await prisma.creditBatch.findUnique({ where: { id: hold.batchId } });
  if (batch && !settlement.replayed) await auditEvent(batch.workspaceId, "credit.refund", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return settlement;
}

/**
 * Admin manual adjustment/refund with reason + audit (distinct from hold
 * refunds). Positive amount grants credits; negative amount removes them.
 * An AuditEvent is always recorded.
 */
export async function adjustCredits(params: {
  internalWorkspaceId: string;
  amount: number;
  reference: string;
  reason: string;
  actorAuthUserId: string;
  idempotencyKey: string;
}) {
  if (params.amount === 0) throw new Error("Adjustment amount must be non-zero");
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) return { adjusted: true, replayed: true };

  const batch = await selectSpendableBatch(params.internalWorkspaceId, Math.abs(params.amount));

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize all adjustments that target the same batch before the
      // idempotency re-check. Without this lock, an exact concurrent replay
      // can observe no ledger row, lose the guarded decrement race, and
      // incorrectly return "Insufficient credits" instead of replaying the
      // committed adjustment.
      if (batch) {
        await tx.creditBatch.update({
          where: { id: batch.id },
          data: { remaining: { increment: 0 } },
        });
      }

      // Re-check inside the transaction so the balance mutation and the
      // unique ledger insert share one rollback boundary. This also protects
      // concurrent replays of the same signed adjustment key.
      const replay = await tx.creditTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (replay) return { adjusted: true, replayed: true as const };

      if (!batch && params.amount < 0) throw new Error("Insufficient credits to remove");

      const target = batch ?? (await tx.creditBatch.create({
        data: {
          externalId: newCreditBatchExternalId(),
          workspaceId: params.internalWorkspaceId,
          kind: "PURCHASED",
          amount: 0,
          remaining: 0,
          expiresAt: params.amount > 0 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
        },
      }));

      if (params.amount < 0) {
        // The predicate and decrement execute as one database operation. A
        // concurrent negative adjustment therefore either obtains the
        // remaining balance or matches zero rows and rolls back, never
        // producing a negative CreditBatch.remaining value.
        const updated = await tx.creditBatch.updateMany({
          where: { id: target.id, remaining: { gte: Math.abs(params.amount) } },
          data: { remaining: { decrement: Math.abs(params.amount) } },
        });
        if (updated.count !== 1) throw new Error("Insufficient credits to remove");
      } else {
        await tx.creditBatch.update({
          where: { id: target.id },
          data: { remaining: { increment: params.amount }, amount: { increment: params.amount } },
        });
      }

      await tx.creditTransaction.create({
        data: {
          batchId: target.id,
          kind: "ADJUSTMENT",
          amount: params.amount,
          reference: params.reference,
          idempotencyKey: params.idempotencyKey,
        },
      });
      return { adjusted: true, replayed: false as const, batchExternalId: target.externalId };
    });

    if (!result.replayed && result.batchExternalId) {
      await auditEvent(params.internalWorkspaceId, "credit.adjustment", { batch: result.batchExternalId, amount: params.amount, reason: params.reason, reference: params.reference }, params.actorAuthUserId);
    }
    return { adjusted: result.adjusted, replayed: result.replayed };
  } catch (error) {
    // A concurrent exact replay can lose the unique-key race after its
    // transaction has already applied the guarded update. That transaction
    // is rolled back; return the committed ledger row as an idempotent replay.
    const code = error instanceof Error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "P2002") {
      const replay = await prisma.creditTransaction.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (replay) return { adjusted: true, replayed: true };
    }
    throw error;
  }
}
