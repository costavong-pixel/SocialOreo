-- CreateEnum
CREATE TYPE "TranscriptEnrichmentStatus" AS ENUM ('SUBMITTED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TranscriptEnrichment" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" "TranscriptEnrichmentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "expectedVideos" INTEGER NOT NULL,
    "completedVideos" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TranscriptEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptEnrichment_auditJobId_key" ON "TranscriptEnrichment"("auditJobId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptEnrichment_runId_key" ON "TranscriptEnrichment"("runId");

-- AddForeignKey
ALTER TABLE "TranscriptEnrichment" ADD CONSTRAINT "TranscriptEnrichment_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
