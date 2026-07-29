-- Enforce at most one RUNNING audit per user at the database level.
CREATE UNIQUE INDEX "AuditJob_one_running_per_user"
ON "AuditJob" ("userId")
WHERE "status" = 'RUNNING'
  AND "userId" IS NOT NULL;
