import { prisma } from "@/lib/db/prisma";
import { creditTransactionSchema, creditBatchSchema } from "@/lib/socialolla/contracts";

function randomExternalId(prefix: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 22; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const newCreditBatchExternalId = () => randomExternalId("cbt_");
export const newAuditEventExternalId = () => randomExternalId("evt_");

export async function ensureMonthlyBatch(input: {
  internalWorkspaceId: string;
  externalWorkspaceId: string;
  includedCredits: number;
}) {
  const existing = await prisma.creditBatch.findFirst({
    where: { workspaceId: input.internalWorkspaceId, kind: "MONTHLY" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return creditBatchSchema.parse({
      id: existing.externalId,
      workspaceId: input.externalWorkspaceId,
      kind: existing.kind,
      amount: existing.amount,
      remaining: existing.remaining,
      expiresAt: existing.expiresAt?.toISOString() ?? null,
      createdAt: existing.createdAt.toISOString(),
    });
  }
  if (input.includedCredits <= 0) return null;
  const created = await prisma.creditBatch.create({
    data: {
      externalId: newCreditBatchExternalId(),
      workspaceId: input.internalWorkspaceId,
      kind: "MONTHLY",
      amount: input.includedCredits,
      remaining: input.includedCredits,
    },
  });
  return creditBatchSchema.parse({
    id: created.externalId,
    workspaceId: input.externalWorkspaceId,
    kind: created.kind,
    amount: created.amount,
    remaining: created.remaining,
    expiresAt: null,
    createdAt: created.createdAt.toISOString(),
  });
}

/**
 * Idempotent credit hold. The unique idempotencyKey on CreditTransaction is the
 * guarantee that a given post intent can never be charged twice.
 */
export async function holdCredits(params: {
  batchExternalId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
}) {
  const input = creditTransactionSchema.parse({ ...params, batchId: params.batchExternalId, kind: "HOLD" });
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { held: true, replayed: true };

  const batch = await prisma.creditBatch.findUnique({
    where: { externalId: input.batchId },
  });
  if (!batch) throw new Error("Credit batch not found");
  if (batch.remaining < input.amount) throw new Error("Insufficient credits");

  const [updated, transaction] = await prisma.$transaction([
    prisma.creditBatch.updateMany({
      where: { externalId: input.batchId, remaining: { gte: input.amount } },
      data: { remaining: { decrement: input.amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        batchId: batch.id,
        kind: "HOLD",
        amount: input.amount,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      },
    }),
  ]);
  if (updated.count === 0) {
    throw new Error("Insufficient credits");
  }
  return { held: true, replayed: false, transactionId: transaction.id };
}

export async function finalizeCredits(params: {
  batchExternalId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
}) {
  const input = creditTransactionSchema.parse({ ...params, batchId: params.batchExternalId, kind: "FINALIZE" });
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { finalized: true, replayed: true };

  const batch = await prisma.creditBatch.findUnique({ where: { externalId: input.batchId } });
  if (!batch) throw new Error("Credit batch not found");
  await prisma.creditTransaction.create({
    data: {
      batchId: batch.id,
      kind: "FINALIZE",
      amount: input.amount,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
    },
  });
  return { finalized: true, replayed: false };
}

export async function refundCredits(params: {
  batchExternalId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
}) {
  const input = creditTransactionSchema.parse({ ...params, batchId: params.batchExternalId, kind: "REFUND" });
  const existing = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { refunded: true, replayed: true };

  const batch = await prisma.creditBatch.findUnique({ where: { externalId: input.batchId } });
  if (!batch) throw new Error("Credit batch not found");
  await prisma.$transaction([
    prisma.creditBatch.update({
      where: { id: batch.id },
      data: { remaining: { increment: input.amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        batchId: batch.id,
        kind: "REFUND",
        amount: input.amount,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
      },
    }),
  ]);
  return { refunded: true, replayed: false };
}
