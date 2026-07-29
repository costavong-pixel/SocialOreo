-- CreateEnum
CREATE TYPE "AuditFeedbackRating" AS ENUM ('HELPFUL', 'NOT_YET');

-- CreateTable
CREATE TABLE "AuditFeedback" (
    "id" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "rating" "AuditFeedbackRating" NOT NULL,
    "usefulSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditFeedback_auditJobId_key" ON "AuditFeedback"("auditJobId");

-- AddForeignKey
ALTER TABLE "AuditFeedback" ADD CONSTRAINT "AuditFeedback_auditJobId_fkey" FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
