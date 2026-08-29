-- Make an identical Watch request resolve to one durable report.
ALTER TABLE "WatchReport" ADD COLUMN "intentKey" TEXT;
CREATE UNIQUE INDEX "WatchReport_intentKey_key" ON "WatchReport"("intentKey");
