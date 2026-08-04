-- Additive M2: Watch report + Post request/variant/occurrence models.
CREATE TYPE "WatchReportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "PostRequestStatus" AS ENUM ('PENDING', 'REVIEW', 'APPROVED', 'SCHEDULED', 'CANCELLED', 'FAILED');
CREATE TYPE "PostOccurrenceKind" AS ENUM ('FIRST', 'SCHEDULED_REPOST');
CREATE TYPE "PostOccurrenceStatus" AS ENUM ('IDEA', 'LIGHT_DRAFT', 'APPROVED', 'SCHEDULED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "WatchReport" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "WatchReportStatus" NOT NULL DEFAULT 'RUNNING',
    "reportJson" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'provider-disabled',
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "WatchReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WatchReport_externalId_key" ON "WatchReport"("externalId");
CREATE INDEX "WatchReport_workspaceId_createdAt_idx" ON "WatchReport"("workspaceId", "createdAt");
ALTER TABLE "WatchReport" ADD CONSTRAINT "WatchReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PostRequest" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "profileRef" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "PostRequestStatus" NOT NULL DEFAULT 'REVIEW',
    "intentKey" TEXT NOT NULL,
    "cfRequestRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostRequest_externalId_key" ON "PostRequest"("externalId");
CREATE UNIQUE INDEX "PostRequest_intentKey_key" ON "PostRequest"("intentKey");
CREATE INDEX "PostRequest_workspaceId_status_idx" ON "PostRequest"("workspaceId", "status");
ALTER TABLE "PostRequest" ADD CONSTRAINT "PostRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PostVariant" (
    "id" TEXT NOT NULL,
    "postRequestId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[],
    "cta" TEXT,
    "characterLimit" INTEGER NOT NULL DEFAULT 2200,
    "variantLocale" TEXT NOT NULL DEFAULT 'en-US',
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PostVariant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostVariant_postRequestId_idx" ON "PostVariant"("postRequestId");
ALTER TABLE "PostVariant" ADD CONSTRAINT "PostVariant_postRequestId_fkey" FOREIGN KEY ("postRequestId") REFERENCES "PostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PostOccurrence" (
    "id" TEXT NOT NULL,
    "postRequestId" TEXT NOT NULL,
    "kind" "PostOccurrenceKind" NOT NULL DEFAULT 'FIRST',
    "status" "PostOccurrenceStatus" NOT NULL DEFAULT 'IDEA',
    "scheduleAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "destinationRef" TEXT NOT NULL,
    "evidenceJson" JSONB,
    CONSTRAINT "PostOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostOccurrence_postRequestId_status_idx" ON "PostOccurrence"("postRequestId", "status");
ALTER TABLE "PostOccurrence" ADD CONSTRAINT "PostOccurrence_postRequestId_fkey" FOREIGN KEY ("postRequestId") REFERENCES "PostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
