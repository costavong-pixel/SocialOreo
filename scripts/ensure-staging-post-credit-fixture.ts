import { prisma } from "@/lib/db/prisma";
import { adjustCredits } from "@/lib/socialolla/credits/batch-service";
import { assertStagingFixtureEnvironment } from "@/lib/socialolla/staging/provider-disabled-destination-fixture";
import {
  STAGING_POST_CREDIT_AMOUNT,
  STAGING_POST_CREDIT_REASON,
  STAGING_POST_CREDIT_REFERENCE,
  stagingPostCreditIdempotencyKey,
} from "@/lib/socialolla/staging/post-credit-fixture";

async function main(): Promise<void> {
  const config = assertStagingFixtureEnvironment(process.env);
  const user = await prisma.user.findUnique({
    where: { authUserId: config.authUserId },
    select: { id: true, email: true },
  });
  if (!user) throw new Error("The supplied staging Auth0 subject is not present in the staging database.");
  if (config.expectedEmail && user.email.trim().toLowerCase() !== config.expectedEmail) {
    throw new Error("The supplied staging Auth0 subject does not match STAGING_EXPECTED_EMAIL.");
  }

  const workspace = await prisma.workspace.findUnique({
    where: { externalId: config.workspaceExternalId },
    select: { id: true, externalId: true, ownerUserId: true },
  });
  if (!workspace) throw new Error("The supplied staging workspace is not present in the staging database.");
  if (workspace.ownerUserId !== user.id) throw new Error("The supplied staging workspace is not owned by the supplied staging identity.");

  const idempotencyKey = stagingPostCreditIdempotencyKey(workspace.externalId);
  const result = await adjustCredits({
    internalWorkspaceId: workspace.id,
    amount: STAGING_POST_CREDIT_AMOUNT,
    reference: STAGING_POST_CREDIT_REFERENCE,
    reason: STAGING_POST_CREDIT_REASON,
    actorAuthUserId: config.authUserId,
    idempotencyKey,
  });
  const transaction = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey },
    select: {
      kind: true,
      amount: true,
      batch: { select: { externalId: true, workspaceId: true, remaining: true, squarePaymentId: true } },
    },
  });
  if (!transaction || transaction.kind !== "ADJUSTMENT" || transaction.amount !== STAGING_POST_CREDIT_AMOUNT) {
    throw new Error("The staging Post credit fixture adjustment was not persisted as expected.");
  }
  if (transaction.batch.workspaceId !== workspace.id || transaction.batch.squarePaymentId) {
    throw new Error("The staging Post credit fixture is not isolated from payment state.");
  }

  process.stdout.write(`${JSON.stringify({
    environment: "staging",
    workspaceExternalId: workspace.externalId,
    creditBatchExternalId: transaction.batch.externalId,
    amount: transaction.amount,
    remaining: transaction.batch.remaining,
    adjustment: result.replayed ? "replayed" : "created",
    payment: "none",
  })}\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Staging Post credit fixture failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
