-- Monthly access is valid only while Square has confirmed an active subscription.
-- Restrict this repair to Monthly rows so existing Lifetime records are untouched.
UPDATE "User" AS "user"
SET "accessPlan" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "SquareSubscription" AS "subscription"
    WHERE "subscription"."userId" = "user"."id"
      AND "subscription"."status" = 'ACTIVE'
  ) THEN 'MONTHLY'::"AccessPlan"
  WHEN EXISTS (
    SELECT 1
    FROM "SquareCheckout" AS "checkout"
    WHERE "checkout"."userId" = "user"."id"
      AND "checkout"."product" = 'LIFETIME'
      AND "checkout"."completedAt" IS NOT NULL
  ) THEN 'LIFETIME'::"AccessPlan"
  ELSE 'NONE'::"AccessPlan"
END
WHERE "user"."accessPlan" = 'MONTHLY';
