export class InsufficientCreditsError extends Error {
  constructor() {
    super("Insufficient credits for a paid audit.");
    this.name = "InsufficientCreditsError";
  }
}

export type CreditConsumptionResult = {
  ledgerEntryId: string;
  newBalance: number;
};

export async function consumeCreditForAudit(
  userId: string,
  amount: number,
  auditJobId: string,
): Promise<CreditConsumptionResult> {
  const { prisma } = await import("@/lib/db/prisma");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditAccount.updateMany({
      where: {
        userId,
        balance: { gte: amount },
      },
      data: {
        balance: { decrement: amount },
      },
    });

    if (updated.count !== 1) {
      throw new InsufficientCreditsError();
    }

    const ledgerEntry = await tx.creditLedger.create({
      data: {
        userId,
        delta: -amount,
        reason: `paid_audit:${auditJobId}`,
      },
    });

    const account = await tx.creditAccount.findUniqueOrThrow({
      where: { userId },
      select: { balance: true },
    });

    return {
      ledgerEntryId: ledgerEntry.id,
      newBalance: account.balance,
    };
  });
}

export async function refundAuditCredit(
  userId: string,
  amount: number,
  auditJobId: string,
  sourceLedgerEntryId: string,
): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");

  await prisma.$transaction(async (tx) => {
    await tx.creditAccount.update({
      where: { userId },
      data: {
        balance: { increment: amount },
      },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        reason: `refund_failed_audit:${auditJobId}:from:${sourceLedgerEntryId}`,
      },
    });
  });
}
