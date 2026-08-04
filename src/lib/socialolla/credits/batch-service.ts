import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

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
 * Ensure the current-period MONTHLY batch for a workspace, created race-safely
 * under a unique (workspaceId, kind, periodKey) constraint. Confined to
 * grant/settlement paths (never called from read/preview paths).
 */
export async function ensureMonthlyBatch(input: {
  internalWorkspaceId: string;
  externalWorkspaceId: string;
  includedCredits: number;
  periodKey?: string;
}) {
  const period = input.periodKey ?? periodKeyForDate();
  const existing = await prisma.creditBatch.findFirst({
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
    };
  }
  if (input.includedCredits <= 0) return null;
  const created = await prisma.creditBatch.create({
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
  };
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
  const batches = await prisma.creditBatch.findMany({
    where: { workspaceId: internalWorkspaceId },
    orderBy: [{ kind: "asc" }, { expiresAt: "asc" }],
  });
  const monthly = batches.filter((b) => b.kind === "MONTHLY" && b.periodKey === period);
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
  });
  if (existing) return { held: true, replayed: true, batchExternalId: undefined as string | undefined };

  const batch = await selectSpendableBatch(params.internalWorkspaceId, params.amount);
  if (!batch) throw new Error("Insufficient credits");

  const [updated, transaction] = await prisma.$transaction([
    prisma.creditBatch.updateMany({
      where: { id: batch.id, remaining: { gte: params.amount } },
      data: { remaining: { decrement: params.amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        batchId: batch.id,
        kind: "HOLD",
        amount: params.amount,
        reference: params.reference,
        idempotencyKey: params.idempotencyKey,
      },
    }),
  ]);
  if (updated.count === 0) {
    throw new Error("Insufficient credits");
  }
  await auditEvent(batch.workspaceId, "credit.hold", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return { held: true, replayed: false, transactionId: transaction.id, batchExternalId: batch.externalId };
}

async function matchingHold(intent: string) {
  return prisma.creditTransaction.findUnique({
    where: { idempotencyKey: holdKey(intent) },
  });
}

/** Finalize requires a matching HOLD on the same base intent key. */
export async function finalizeCredits(params: {
  amount: number;
  reference: string;
  intent: string;
  actorAuthUserId?: string;
}) {
  const hold = await matchingHold(params.intent);
  if (!hold) throw new Error("No matching hold for finalize");
  if (hold.amount !== params.amount) throw new Error("Finalize amount does not match hold");
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: finalizeKey(params.intent) },
  });
  if (existing) return { finalized: true, replayed: true };
  await prisma.creditTransaction.create({
    data: {
      batchId: hold.batchId,
      kind: "FINALIZE",
      amount: params.amount,
      reference: params.reference,
      idempotencyKey: finalizeKey(params.intent),
    },
  });
  const batch = await prisma.creditBatch.findUnique({ where: { id: hold.batchId } });
  if (batch) await auditEvent(batch.workspaceId, "credit.finalize", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return { finalized: true, replayed: false };
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
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: refundKey(params.intent) },
  });
  if (existing) return { refunded: true, replayed: true };
  await prisma.$transaction([
    prisma.creditBatch.update({
      where: { id: hold.batchId },
      data: { remaining: { increment: params.amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        batchId: hold.batchId,
        kind: "REFUND",
        amount: params.amount,
        reference: params.reference,
        idempotencyKey: refundKey(params.intent),
      },
    }),
  ]);
  const batch = await prisma.creditBatch.findUnique({ where: { id: hold.batchId } });
  if (batch) await auditEvent(batch.workspaceId, "credit.refund", { batch: batch.externalId, amount: params.amount, reference: params.reference }, params.actorAuthUserId);
  return { refunded: true, replayed: false };
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
  if (!batch && params.amount < 0) throw new Error("Insufficient credits to remove");

  const target = batch ?? (await prisma.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: params.internalWorkspaceId,
      kind: "PURCHASED",
      amount: params.amount > 0 ? params.amount : 0,
      remaining: params.amount > 0 ? params.amount : 0,
      expiresAt: params.amount > 0 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
    },
  }));

  if (params.amount < 0) {
    await prisma.creditBatch.update({
      where: { id: target.id },
      data: { remaining: { decrement: Math.abs(params.amount) } },
    });
  } else {
    await prisma.creditBatch.update({
      where: { id: target.id },
      data: { remaining: { increment: params.amount }, amount: { increment: params.amount } },
    });
  }
  await prisma.creditTransaction.create({
    data: {
      batchId: target.id,
      kind: "ADJUSTMENT",
      amount: params.amount,
      reference: params.reference,
      idempotencyKey: params.idempotencyKey,
    },
  });
  await auditEvent(params.internalWorkspaceId, "credit.adjustment", { batch: target.externalId, amount: params.amount, reason: params.reason, reference: params.reference }, params.actorAuthUserId);
  return { adjusted: true, replayed: false };
}
