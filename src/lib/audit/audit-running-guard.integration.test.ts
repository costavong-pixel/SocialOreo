import { AuditStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuditAlreadyRunningError, createRunningAuditJob } from "./audit-running-guard";
import { prisma } from "@/lib/db/prisma";

const shouldRunDatabaseTests =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.CI === "true" || process.env.RUN_DB_TESTS === "1");

describe.skipIf(!shouldRunDatabaseTests)("createRunningAuditJob database concurrency", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        authUserId: `auth0-concurrency-test-${Date.now()}`,
        email: `concurrency-${Date.now()}@example.com`,
        creditAccount: {
          create: {
            balance: 0,
          },
        },
      },
    });

    userId = user.id;
  });

  afterEach(async () => {
    await prisma.auditJob.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.creditLedger.deleteMany({ where: { userId } });
    await prisma.creditAccount.deleteMany({ where: { userId } });
    await prisma.auditJob.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("allows only one simultaneous RUNNING insert per user", async () => {
    const jobData = {
      userId,
      platform: "instagram",
      provider: "apify",
      profileUrl: "https://www.instagram.com/example/",
      status: AuditStatus.RUNNING,
      reelLimit: 7,
    };

    const results = await Promise.allSettled([
      createRunningAuditJob(userId, (tx) => tx.auditJob.create({ data: jobData })),
      createRunningAuditJob(userId, (tx) => tx.auditJob.create({ data: jobData })),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AuditAlreadyRunningError);

    const runningCount = await prisma.auditJob.count({
      where: {
        userId,
        status: AuditStatus.RUNNING,
      },
    });

    expect(runningCount).toBe(1);
  });
});
