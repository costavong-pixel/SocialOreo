-- Add durable Watch evidence and an idempotency key for scheduled captures.
ALTER TABLE "PublicProfileMonitor"
ADD COLUMN "providerCostEstimate" DECIMAL(10,4);

ALTER TABLE "PublicProfileSnapshot"
ADD COLUMN "captureKey" TEXT,
ADD COLUMN "providerCostEstimate" DECIMAL(10,4),
ADD COLUMN "sourceUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "PublicProfileMonitor"
SET "providerCostEstimate" = CASE
    WHEN LOWER("platform") = 'instagram' THEN 0.05
    WHEN LOWER("platform") = 'tiktok' THEN ROUND((0.001 + GREATEST(1, "reelLimit") * 0.0037)::numeric, 4)
    ELSE 0
  END
WHERE "providerCostEstimate" IS NULL;

CREATE UNIQUE INDEX "PublicProfileSnapshot_captureKey_key"
ON "PublicProfileSnapshot"("captureKey");
