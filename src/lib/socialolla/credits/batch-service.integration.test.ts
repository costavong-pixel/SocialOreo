import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { adjustCredits } from "./batch-service";

const shouldRunDatabaseTests =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.CI === "true" || process.env.RUN_DB_TESTS === "1");

describe.skipIf(!shouldRunDatabaseTests)("adjustCredits database concurrency", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        authUserId: `auth0-admin-adjustment-concurrency-${suffix}`,
        email: `admin-adjustment-concurrency-${suffix}@example.com`,
        accessPlan: "LIFETIME",
      },
    });
    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: {
        externalId: `wsp_admin_adjustment_concurrency_${suffix}`,
        ownerUserId: user.id,
        label: "Admin adjustment concurrency test",
      },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("serializes identical negative replays and never underflows the batch", async () => {
    const batch = await prisma.creditBatch.create({
      data: {
        externalId: `cbt_admin_adjustment_concurrency_${Date.now()}`,
        workspaceId,
        kind: "PURCHASED",
        amount: 10,
        remaining: 10,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const idempotencyKey = `so:integration:admin-adjustment:${Date.now()}`;
    const input = {
      internalWorkspaceId: workspaceId,
      amount: -10,
      reference: "integration-admin-refund",
      reason: "concurrent exact replay",
      actorAuthUserId: "integration-admin",
      idempotencyKey,
    };

    const results = await Promise.allSettled([adjustCredits(input), adjustCredits(input)]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ adjusted: boolean; replayed: boolean }> => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.map((result) => result.value.replayed).sort()).toEqual([false, true]);

    const persistedBatch = await prisma.creditBatch.findUnique({ where: { id: batch.id } });
    expect(persistedBatch?.remaining).toBe(0);
    expect(persistedBatch?.remaining).toBeGreaterThanOrEqual(0);

    const transactions = await prisma.creditTransaction.findMany({ where: { batchId: batch.id } });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount).toBe(-10);
    expect(transactions[0]?.idempotencyKey).toBe(idempotencyKey);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { workspaceId, eventType: "credit.adjustment" },
    });
    expect(auditEvents).toHaveLength(1);

    await expect(adjustCredits(input)).resolves.toEqual({ adjusted: true, replayed: true });
    const replayedBatch = await prisma.creditBatch.findUnique({ where: { id: batch.id } });
    expect(replayedBatch?.remaining).toBe(0);
  });
});
