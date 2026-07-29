-- CreateTable
CREATE TABLE "CompetitorBoardEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorBoardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorBoardEntry_userId_auditJobId_key" ON "CompetitorBoardEntry"("userId", "auditJobId");

-- CreateIndex
CREATE INDEX "CompetitorBoardEntry_userId_createdAt_idx" ON "CompetitorBoardEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompetitorBoardEntry" ADD CONSTRAINT "CompetitorBoardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorBoardEntry" ADD CONSTRAINT "CompetitorBoardEntry_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
