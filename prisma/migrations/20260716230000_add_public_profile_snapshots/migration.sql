-- CreateTable
CREATE TABLE "PublicProfileMonitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reelLimit" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cadenceHours" INTEGER NOT NULL DEFAULT 168,
    "lastCapturedAt" TIMESTAMP(3),
    "nextCaptureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicProfileMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicProfileSnapshot" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "sourceAuditJobId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "followerCount" INTEGER,
    "followingCount" INTEGER,
    "postCount" INTEGER,
    "reelsCollected" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER,
    "medianViews" INTEGER,
    "visibleInteractions" INTEGER,
    "visibleInteractionRate" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicProfileSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicProfileMonitor_userId_profileUrl_key" ON "PublicProfileMonitor"("userId", "profileUrl");

-- CreateIndex
CREATE INDEX "PublicProfileMonitor_enabled_nextCaptureAt_idx" ON "PublicProfileMonitor"("enabled", "nextCaptureAt");

-- CreateIndex
CREATE INDEX "PublicProfileMonitor_userId_updatedAt_idx" ON "PublicProfileMonitor"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicProfileSnapshot_sourceAuditJobId_key" ON "PublicProfileSnapshot"("sourceAuditJobId");

-- CreateIndex
CREATE INDEX "PublicProfileSnapshot_monitorId_capturedAt_idx" ON "PublicProfileSnapshot"("monitorId", "capturedAt");

-- AddForeignKey
ALTER TABLE "PublicProfileMonitor" ADD CONSTRAINT "PublicProfileMonitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicProfileSnapshot" ADD CONSTRAINT "PublicProfileSnapshot_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "PublicProfileMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicProfileSnapshot" ADD CONSTRAINT "PublicProfileSnapshot_sourceAuditJobId_fkey" FOREIGN KEY ("sourceAuditJobId") REFERENCES "AuditJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
