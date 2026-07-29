ALTER TABLE "SquareCheckout" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "SquareSubscription" ADD COLUMN "canceledDate" TEXT;

CREATE TABLE "SquarePaymentAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "squareCheckoutId" TEXT,
    "squareSubscriptionId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subscriptionStatus" TEXT,
    "effectiveDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquarePaymentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SquareCheckout_idempotencyKey_key" ON "SquareCheckout"("idempotencyKey");
CREATE INDEX "SquarePaymentAuditLog_userId_createdAt_idx" ON "SquarePaymentAuditLog"("userId", "createdAt");
CREATE INDEX "SquarePaymentAuditLog_squareSubscriptionId_createdAt_idx" ON "SquarePaymentAuditLog"("squareSubscriptionId", "createdAt");

ALTER TABLE "SquarePaymentAuditLog" ADD CONSTRAINT "SquarePaymentAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
