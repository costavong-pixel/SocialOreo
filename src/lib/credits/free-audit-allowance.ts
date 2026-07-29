export class FreeAuditAllowanceExhaustedError extends Error {
  constructor() {
    super("Free audit allowance has already been used.");
    this.name = "FreeAuditAllowanceExhaustedError";
  }
}

export async function claimFreeAuditAllowance(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");

  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      freeAuditAllowanceRemaining: { gt: 0 },
    },
    data: {
      freeAuditAllowanceRemaining: { decrement: 1 },
    },
  });

  if (updated.count !== 1) {
    throw new FreeAuditAllowanceExhaustedError();
  }
}

export async function restoreFreeAuditAllowance(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");

  await prisma.user.updateMany({
    where: {
      id: userId,
      freeAuditAllowanceRemaining: { lt: 1 },
    },
    data: {
      freeAuditAllowanceRemaining: 1,
    },
  });
}
