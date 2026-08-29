-- Focused Post publishing foundation. This migration is additive and does not
-- alter Watch tables or any production data.
CREATE TYPE "PostDestinationStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELED', 'RECONCILIATION_REQUIRED');
CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELED', 'RECONCILIATION_REQUIRED');
CREATE TYPE "PublishJobMode" AS ENUM ('NOW', 'SCHEDULED');
CREATE TYPE "PublishAttemptStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "Destination"
  ADD COLUMN "accessTokenCiphertext" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "publishingEligibilityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PostRequest"
  ADD COLUMN "requestedCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PostVariant"
  ADD COLUMN "mediaAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "detectedMimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostDestination" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "postRequestId" TEXT NOT NULL,
  "destinationId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" "PostDestinationStatus" NOT NULL DEFAULT 'PENDING',
  "publishAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostDestination_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishJob" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "postDestinationId" TEXT NOT NULL,
  "mode" "PublishJobMode" NOT NULL DEFAULT 'NOW',
  "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "providerCallStartedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishAttempt" (
  "id" TEXT NOT NULL,
  "publishJobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" "PublishAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderReceipt" (
  "id" TEXT NOT NULL,
  "publishJobId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerObjectId" TEXT,
  "url" TEXT,
  "publishedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_externalId_key" ON "MediaAsset"("externalId");
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_workspaceId_status_idx" ON "MediaAsset"("workspaceId", "status");
CREATE UNIQUE INDEX "PostDestination_externalId_key" ON "PostDestination"("externalId");
CREATE UNIQUE INDEX "PostDestination_postRequestId_destinationId_key" ON "PostDestination"("postRequestId", "destinationId");
CREATE INDEX "PostDestination_postRequestId_status_idx" ON "PostDestination"("postRequestId", "status");
CREATE INDEX "PostDestination_destinationId_status_idx" ON "PostDestination"("destinationId", "status");
CREATE UNIQUE INDEX "PublishJob_externalId_key" ON "PublishJob"("externalId");
CREATE UNIQUE INDEX "PublishJob_idempotencyKey_key" ON "PublishJob"("idempotencyKey");
CREATE INDEX "PublishJob_status_nextAttemptAt_idx" ON "PublishJob"("status", "nextAttemptAt");
CREATE INDEX "PublishJob_postDestinationId_status_idx" ON "PublishJob"("postDestinationId", "status");
CREATE UNIQUE INDEX "PublishAttempt_publishJobId_attemptNumber_key" ON "PublishAttempt"("publishJobId", "attemptNumber");
CREATE INDEX "PublishAttempt_publishJobId_status_idx" ON "PublishAttempt"("publishJobId", "status");
CREATE UNIQUE INDEX "ProviderReceipt_publishJobId_key" ON "ProviderReceipt"("publishJobId");

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostDestination"
  ADD CONSTRAINT "PostDestination_postRequestId_fkey" FOREIGN KEY ("postRequestId") REFERENCES "PostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PostDestination_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PostDestination_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "PostVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishJob"
  ADD CONSTRAINT "PublishJob_postDestinationId_fkey" FOREIGN KEY ("postDestinationId") REFERENCES "PostDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishAttempt"
  ADD CONSTRAINT "PublishAttempt_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderReceipt"
  ADD CONSTRAINT "ProviderReceipt_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "PublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
