-- RenameColumn
ALTER TABLE "User" RENAME COLUMN "clerkUserId" TO "authUserId";

-- RenameIndex
ALTER INDEX "User_clerkUserId_key" RENAME TO "User_authUserId_key";

-- The beta starts fresh with Auth0. Keep legacy rows, but allow the same
-- e-mail address to create a new Auth0 account without inheriting prior access.
DROP INDEX "User_email_key";
