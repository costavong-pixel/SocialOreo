import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  AuditAlreadyRunningError,
  createRunningAuditJob,
  mapRunningAuditConstraintError,
} from "./audit-running-guard";

const mockTransaction = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => mockTransaction(callback),
  },
}));

function runningAuditUniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
    meta: { modelName: "AuditJob", target: ["userId"] },
  });
}

describe("mapRunningAuditConstraintError", () => {
  it("maps AuditJob userId unique violations to AuditAlreadyRunningError", () => {
    expect(mapRunningAuditConstraintError(runningAuditUniqueViolation())).toBeInstanceOf(
      AuditAlreadyRunningError,
    );
  });

  it("ignores unrelated unique constraint violations", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.19.3",
      meta: { modelName: "User", target: ["email"] },
    });

    expect(mapRunningAuditConstraintError(error)).toBeNull();
  });
});

describe("createRunningAuditJob", () => {
  it("creates an audit job when the database accepts the insert", async () => {
    const created = { id: "new-job" };
    const tx = {
      auditJob: {
        create: mockCreate.mockResolvedValue(created),
      },
    };

    mockTransaction.mockImplementation(async (callback) => callback(tx));

    const result = await createRunningAuditJob("user-1", async (innerTx) =>
      innerTx.auditJob.create({
        data: {
          userId: "user-1",
          platform: "instagram",
          provider: "apify",
          profileUrl: "https://www.instagram.com/example/",
          status: "RUNNING",
        },
      }),
    );

    expect(result).toEqual(created);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("returns AuditAlreadyRunningError when the partial unique index blocks a second RUNNING job", async () => {
    mockTransaction.mockRejectedValue(runningAuditUniqueViolation());

    await expect(
      createRunningAuditJob("user-1", async (innerTx) =>
        innerTx.auditJob.create({
          data: {
            userId: "user-1",
            platform: "instagram",
            provider: "apify",
            profileUrl: "https://www.instagram.com/example/",
            status: "RUNNING",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(AuditAlreadyRunningError);
  });
});
