import { Prisma } from "@prisma/client";

export class AuditAlreadyRunningError extends Error {
  constructor() {
    super("An audit is already running for this account.");
    this.name = "AuditAlreadyRunningError";
  }
}

type TransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export function mapRunningAuditConstraintError(error: unknown): AuditAlreadyRunningError | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = error.meta?.target;
    const targetFields = Array.isArray(target)
      ? target
      : typeof target === "string"
        ? [target]
        : [];

    if (targetFields.includes("userId")) {
      return new AuditAlreadyRunningError();
    }
  }

  return null;
}

export async function createRunningAuditJob<T>(
  userId: string,
  createJob: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("@/lib/db/prisma");

  try {
    return await prisma.$transaction((tx) => createJob(tx));
  } catch (error) {
    const mapped = mapRunningAuditConstraintError(error);
    if (mapped) {
      throw mapped;
    }

    throw error;
  }
}
