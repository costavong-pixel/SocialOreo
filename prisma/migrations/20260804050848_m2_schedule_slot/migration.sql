CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postRequestId" TEXT NOT NULL,
    "destinationRef" TEXT NOT NULL,
    "scheduleAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduleSlot_workspaceId_scheduleAt_idx" ON "ScheduleSlot"("workspaceId", "scheduleAt");
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
