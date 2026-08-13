-- Outcome Loop v1 is additive and manual/provider-disabled. It records the
-- owner-approved content version plus owner-entered post metrics; it does not
-- add a publishing provider, worker, scheduler, or payment path.
CREATE TYPE "ContentMetricSource" AS ENUM ('MANUAL');
CREATE TYPE "ContentOutcomeStatus" AS ENUM ('INSUFFICIENT_EVIDENCE', 'READY');
CREATE TYPE "ContentOutcomeDecision" AS ENUM ('KEEP', 'CHANGE', 'PAUSE');
CREATE TYPE "OutcomePlanRecommendationStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postRequestId" TEXT NOT NULL,
    "sourceVariantId" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL,
    "cta" TEXT,
    "versionHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentVersion_externalId_key" ON "ContentVersion"("externalId");
CREATE UNIQUE INDEX "ContentVersion_postRequestId_key" ON "ContentVersion"("postRequestId");
CREATE INDEX "ContentVersion_workspaceId_destinationRef_platform_idx" ON "ContentVersion"("workspaceId", "destinationRef", "platform");
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_postRequestId_fkey" FOREIGN KEY ("postRequestId") REFERENCES "PostRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_sourceVariantId_fkey" FOREIGN KEY ("sourceVariantId") REFERENCES "PostVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContentPublication" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "platformPostUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "ContentMetricSource" NOT NULL DEFAULT 'MANUAL',
    CONSTRAINT "ContentPublication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentPublication_externalId_key" ON "ContentPublication"("externalId");
CREATE UNIQUE INDEX "ContentPublication_contentVersionId_key" ON "ContentPublication"("contentVersionId");
CREATE UNIQUE INDEX "ContentPublication_platformPostUrl_key" ON "ContentPublication"("platformPostUrl");
CREATE INDEX "ContentPublication_publishedAt_idx" ON "ContentPublication"("publishedAt");
ALTER TABLE "ContentPublication" ADD CONSTRAINT "ContentPublication_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContentMetricSnapshot" (
    "id" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" "ContentMetricSource" NOT NULL DEFAULT 'MANUAL',
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "reach" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentMetricSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentMetricSnapshot_has_metric_check" CHECK (
      "views" IS NOT NULL OR "likes" IS NOT NULL OR "comments" IS NOT NULL OR
      "shares" IS NOT NULL OR "saves" IS NOT NULL OR "reach" IS NOT NULL
    ),
    CONSTRAINT "ContentMetricSnapshot_nonnegative_check" CHECK (
      ("views" IS NULL OR "views" >= 0) AND
      ("likes" IS NULL OR "likes" >= 0) AND
      ("comments" IS NULL OR "comments" >= 0) AND
      ("shares" IS NULL OR "shares" >= 0) AND
      ("saves" IS NULL OR "saves" >= 0) AND
      ("reach" IS NULL OR "reach" >= 0)
    )
);
CREATE UNIQUE INDEX "ContentMetricSnapshot_contentVersionId_capturedAt_key" ON "ContentMetricSnapshot"("contentVersionId", "capturedAt");
CREATE INDEX "ContentMetricSnapshot_contentVersionId_capturedAt_idx" ON "ContentMetricSnapshot"("contentVersionId", "capturedAt");
ALTER TABLE "ContentMetricSnapshot" ADD CONSTRAINT "ContentMetricSnapshot_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContentOutcomeEvaluation" (
    "id" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "metricSnapshotId" TEXT NOT NULL,
    "status" "ContentOutcomeStatus" NOT NULL,
    "decision" "ContentOutcomeDecision",
    "confidence" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentOutcomeEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentOutcomeEvaluation_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 100)
);
CREATE INDEX "ContentOutcomeEvaluation_contentVersionId_evaluatedAt_idx" ON "ContentOutcomeEvaluation"("contentVersionId", "evaluatedAt");
CREATE INDEX "ContentOutcomeEvaluation_metricSnapshotId_idx" ON "ContentOutcomeEvaluation"("metricSnapshotId");
ALTER TABLE "ContentOutcomeEvaluation" ADD CONSTRAINT "ContentOutcomeEvaluation_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentOutcomeEvaluation" ADD CONSTRAINT "ContentOutcomeEvaluation_metricSnapshotId_fkey" FOREIGN KEY ("metricSnapshotId") REFERENCES "ContentMetricSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OutcomePlanRecommendation" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "status" "OutcomePlanRecommendationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "recommendationJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "OutcomePlanRecommendation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutcomePlanRecommendation_externalId_key" ON "OutcomePlanRecommendation"("externalId");
CREATE UNIQUE INDEX "OutcomePlanRecommendation_evaluationId_key" ON "OutcomePlanRecommendation"("evaluationId");
CREATE INDEX "OutcomePlanRecommendation_workspaceId_status_createdAt_idx" ON "OutcomePlanRecommendation"("workspaceId", "status", "createdAt");
CREATE INDEX "OutcomePlanRecommendation_contentVersionId_createdAt_idx" ON "OutcomePlanRecommendation"("contentVersionId", "createdAt");
ALTER TABLE "OutcomePlanRecommendation" ADD CONSTRAINT "OutcomePlanRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutcomePlanRecommendation" ADD CONSTRAINT "OutcomePlanRecommendation_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutcomePlanRecommendation" ADD CONSTRAINT "OutcomePlanRecommendation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ContentOutcomeEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
