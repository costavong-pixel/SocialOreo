-- Additive M2: monthly period key + ADJUSTMENT transaction kind.
-- No existing data is modified.
ALTER TYPE "CreditTransactionKind" ADD VALUE 'ADJUSTMENT';

ALTER TABLE "CreditBatch" ADD COLUMN "periodKey" TEXT;

CREATE UNIQUE INDEX "CreditBatch_workspaceId_kind_periodKey_key"
  ON "CreditBatch"("workspaceId", "kind", "periodKey");
