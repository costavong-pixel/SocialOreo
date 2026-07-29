-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AngleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "reelLimit" INTEGER NOT NULL DEFAULT 30,
    "campaignBriefJson" JSONB,
    "providerCostEstimate" DECIMAL(10,4),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialProfile" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "profileUrl" TEXT NOT NULL,
    "bio" TEXT,
    "followerCount" INTEGER,
    "followingCount" INTEGER,
    "postCount" INTEGER,
    "profileImageUrl" TEXT,
    "rawProviderPayload" JSONB,

    CONSTRAINT "SocialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialVideo" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerVideoId" TEXT,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[],
    "mentions" TEXT[],
    "audioName" TEXT,
    "durationSeconds" INTEGER,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "saveCount" INTEGER,
    "postedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT,
    "videoUrlIfAvailable" TEXT,
    "transcriptIfAvailable" TEXT,
    "rawProviderPayload" JSONB,

    CONSTRAINT "SocialVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "subScoresJson" JSONB NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "actionPlanJson" JSONB NOT NULL,
    "contentPackJson" JSONB NOT NULL,
    "r2ReportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AngleLibrary" (
    "id" TEXT NOT NULL,
    "angleName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "platformFit" TEXT[],
    "nicheFit" TEXT[],
    "occasionFit" TEXT[],
    "goalFit" TEXT[],
    "tone" TEXT[],
    "hookFormula" TEXT NOT NULL,
    "ctaFormula" TEXT,
    "scriptStructure" TEXT,
    "shotListPattern" TEXT,
    "captionPattern" TEXT,
    "riskLevel" TEXT,
    "example" TEXT,
    "whenToUse" TEXT,
    "whenNotToUse" TEXT,
    "status" "AngleStatus" NOT NULL DEFAULT 'DRAFT',
    "internalOnly" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AngleLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCallLog" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT,
    "provider" TEXT NOT NULL,
    "endpointOrActor" TEXT NOT NULL,
    "estimatedCost" DECIMAL(10,4),
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_userId_key" ON "CreditAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditReport_auditJobId_key" ON "AuditReport"("auditJobId");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialProfile" ADD CONSTRAINT "SocialProfile_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialVideo" ADD CONSTRAINT "SocialVideo_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCallLog" ADD CONSTRAINT "ProviderCallLog_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

