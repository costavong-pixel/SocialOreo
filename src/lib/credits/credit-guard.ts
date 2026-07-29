export type CreditGuardResult =
  | {
      allowed: true;
      balance: number;
    }
  | {
      allowed: false;
      reason: "insufficient_credits";
      balance: number;
      requiredCredits: number;
    };

export function checkCreditBalance(balance: number, requiredCredits: number): CreditGuardResult {
  if (requiredCredits <= 0) {
    return { allowed: true, balance };
  }

  if (balance < requiredCredits) {
    return {
      allowed: false,
      reason: "insufficient_credits",
      balance,
      requiredCredits,
    };
  }

  return { allowed: true, balance };
}

export async function getCreditBalanceForUser(userId: string): Promise<number> {
  const { prisma } = await import("@/lib/db/prisma");

  const account = await prisma.creditAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });

  return account?.balance ?? 0;
}
