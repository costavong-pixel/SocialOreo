-- Durable Watch capture execution: leases, retries, credit settlement evidence,
-- and a direct link from each capture report to its monitored profile.
ALTER TABLE "PublicProfileMonitor"
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WatchReport"
  ADD COLUMN "monitorId" TEXT,
  ADD COLUMN "captureKey" TEXT,
  ADD COLUMN "deltaJson" JSONB,
  ADD COLUMN "evidenceJson" JSONB,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "WatchReport_captureKey_key" ON "WatchReport"("captureKey");
CREATE INDEX "WatchReport_monitorId_status_nextAttemptAt_idx" ON "WatchReport"("monitorId", "status", "nextAttemptAt");

ALTER TABLE "WatchReport"
  ADD CONSTRAINT "WatchReport_monitorId_fkey"
  FOREIGN KEY ("monitorId") REFERENCES "PublicProfileMonitor"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
