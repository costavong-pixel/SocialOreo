CREATE TABLE "SevenDayPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "planJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SevenDayPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SevenDayPlan_workspaceId_createdAt_idx" ON "SevenDayPlan"("workspaceId", "createdAt");
ALTER TABLE "SevenDayPlan" ADD CONSTRAINT "SevenDayPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
