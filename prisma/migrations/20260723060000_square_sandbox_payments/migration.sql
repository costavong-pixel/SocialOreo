ALTER TABLE "CreditLedger" RENAME COLUMN "paddleTransactionId" TO "squarePaymentId";
ALTER TABLE "CreditLedger" RENAME COLUMN "paddleCustomerId" TO "squareCustomerId";
ALTER INDEX "CreditLedger_paddleTransactionId_key" RENAME TO "CreditLedger_squarePaymentId_key";

CREATE TYPE "SquareProduct" AS ENUM ('LIFETIME', 'MONTHLY', 'SINGLE_AUDIT', 'CREATOR_PACK');

CREATE TABLE "SquareCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "product" "SquareProduct" NOT NULL,
    "squareOrderId" TEXT,
    "squarePaymentId" TEXT,
    "squareCustomerId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SquareCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SquareSubscription" (
    "squareSubscriptionId" TEXT NOT NULL,
    "userId" TEXT,
    "squareCustomerId" TEXT NOT NULL,
    "planVariationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SquareSubscription_pkey" PRIMARY KEY ("squareSubscriptionId")
);

CREATE UNIQUE INDEX "SquareCheckout_squareOrderId_key" ON "SquareCheckout"("squareOrderId");
CREATE UNIQUE INDEX "SquareCheckout_squarePaymentId_key" ON "SquareCheckout"("squarePaymentId");
CREATE INDEX "SquareCheckout_userId_product_idx" ON "SquareCheckout"("userId", "product");
CREATE INDEX "SquareCheckout_squareCustomerId_product_idx" ON "SquareCheckout"("squareCustomerId", "product");
CREATE INDEX "SquareSubscription_userId_status_idx" ON "SquareSubscription"("userId", "status");
CREATE INDEX "SquareSubscription_squareCustomerId_planVariationId_idx" ON "SquareSubscription"("squareCustomerId", "planVariationId");

ALTER TABLE "SquareCheckout" ADD CONSTRAINT "SquareCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SquareSubscription" ADD CONSTRAINT "SquareSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
