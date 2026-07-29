CREATE TYPE "InstagramInsightsConnectionStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');

CREATE TABLE "InstagramInsightsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instagramUserId" TEXT NOT NULL,
    "username" TEXT,
    "accountType" TEXT,
    "tokenCiphertext" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "InstagramInsightsConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstagramInsightsConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstagramInsightsSnapshot" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "accountReach" INTEGER,
    "accountViews" INTEGER,
    "profileViews" INTEGER,
    "totalInteractions" INTEGER,
    "followerCount" INTEGER,
    "audienceDemographicsJson" JSONB,
    "reelInsightsJson" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstagramInsightsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramInsightsConnection_userId_key" ON "InstagramInsightsConnection"("userId");
CREATE UNIQUE INDEX "InstagramInsightsConnection_instagramUserId_key" ON "InstagramInsightsConnection"("instagramUserId");
CREATE INDEX "InstagramInsightsConnection_status_updatedAt_idx" ON "InstagramInsightsConnection"("status", "updatedAt");
CREATE UNIQUE INDEX "InstagramInsightsSnapshot_connectionId_periodStart_periodEnd_key" ON "InstagramInsightsSnapshot"("connectionId", "periodStart", "periodEnd");
CREATE INDEX "InstagramInsightsSnapshot_connectionId_fetchedAt_idx" ON "InstagramInsightsSnapshot"("connectionId", "fetchedAt");

ALTER TABLE "InstagramInsightsConnection" ADD CONSTRAINT "InstagramInsightsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramInsightsSnapshot" ADD CONSTRAINT "InstagramInsightsSnapshot_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramInsightsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
