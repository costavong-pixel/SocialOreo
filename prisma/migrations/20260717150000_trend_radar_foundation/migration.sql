CREATE TYPE "TrendPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE');
CREATE TYPE "TrendSourceType" AS ENUM ('KEYWORD', 'HASHTAG', 'CREATOR');
CREATE TYPE "TrendScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "TrendWatchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "TrendPlatform" NOT NULL,
    "sourceType" "TrendSourceType" NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrendWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendScan" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "platform" "TrendPlatform" NOT NULL,
    "sourceType" "TrendSourceType" NOT NULL,
    "query" TEXT NOT NULL,
    "provider" TEXT,
    "status" "TrendScanStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedCost" DECIMAL(10,4),
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TrendScan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrendVideo" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "providerVideoId" TEXT,
    "creatorHandle" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "postedAt" TIMESTAMP(3),
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "saveCount" INTEGER,
    "visibleInteractionRate" DOUBLE PRECISION,
    "thumbnailUrl" TEXT,
    "transcriptIfAvailable" TEXT,
    "rawProviderPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrendWatchlist_userId_platform_sourceType_query_key" ON "TrendWatchlist"("userId", "platform", "sourceType", "query");
CREATE INDEX "TrendWatchlist_userId_updatedAt_idx" ON "TrendWatchlist"("userId", "updatedAt");
CREATE INDEX "TrendScan_watchlistId_requestedAt_idx" ON "TrendScan"("watchlistId", "requestedAt");
CREATE INDEX "TrendScan_status_requestedAt_idx" ON "TrendScan"("status", "requestedAt");
CREATE UNIQUE INDEX "TrendVideo_scanId_sourceUrl_key" ON "TrendVideo"("scanId", "sourceUrl");
CREATE INDEX "TrendVideo_scanId_viewCount_idx" ON "TrendVideo"("scanId", "viewCount");
CREATE INDEX "TrendVideo_scanId_postedAt_idx" ON "TrendVideo"("scanId", "postedAt");

ALTER TABLE "TrendWatchlist" ADD CONSTRAINT "TrendWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrendScan" ADD CONSTRAINT "TrendScan_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "TrendWatchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrendVideo" ADD CONSTRAINT "TrendVideo_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "TrendScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
