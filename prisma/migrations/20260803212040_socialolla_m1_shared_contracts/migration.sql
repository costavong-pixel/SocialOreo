-- CreateEnum
CREATE TYPE "WorkspaceProvider" AS ENUM ('PERSONAL');

-- CreateEnum
CREATE TYPE "DestinationStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "CreditBatchKind" AS ENUM ('MONTHLY', 'PURCHASED');

-- CreateEnum
CREATE TYPE "CreditTransactionKind" AS ENUM ('HOLD', 'FINALIZE', 'REFUND');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en-US',
    "provider" "WorkspaceProvider" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT,
    "accountLabel" TEXT,
    "status" "DestinationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "providerDisabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT,
    "platform" TEXT NOT NULL,
    "locale" TEXT,
    "defaultLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementSnapshot" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planVersionId" TEXT NOT NULL,
    "maxWatchCompetitors" INTEGER NOT NULL DEFAULT 3,
    "maxDestinations" INTEGER NOT NULL DEFAULT 1,
    "includedMonthlyCredits" INTEGER NOT NULL DEFAULT 0,
    "postCreditsPerRequest" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditBatch" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "CreditBatchKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "CreditTransactionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorAuthUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_externalId_key" ON "Workspace"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_ownerUserId_key" ON "Workspace"("ownerUserId");

-- CreateIndex
CREATE INDEX "Workspace_ownerUserId_idx" ON "Workspace"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_externalId_key" ON "Destination"("externalId");

-- CreateIndex
CREATE INDEX "Destination_workspaceId_platform_idx" ON "Destination"("workspaceId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_externalId_key" ON "Profile"("externalId");

-- CreateIndex
CREATE INDEX "Profile_workspaceId_idx" ON "Profile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVersion_externalId_key" ON "PlanVersion"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementSnapshot_externalId_key" ON "EntitlementSnapshot"("externalId");

-- CreateIndex
CREATE INDEX "EntitlementSnapshot_workspaceId_idx" ON "EntitlementSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditBatch_externalId_key" ON "CreditBatch"("externalId");

-- CreateIndex
CREATE INDEX "CreditBatch_workspaceId_kind_idx" ON "CreditBatch"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditTransaction_batchId_idx" ON "CreditTransaction"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_externalId_key" ON "AuditEvent"("externalId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_occurredAt_idx" ON "AuditEvent"("workspaceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementSnapshot" ADD CONSTRAINT "EntitlementSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementSnapshot" ADD CONSTRAINT "EntitlementSnapshot_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditBatch" ADD CONSTRAINT "CreditBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CreditBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
