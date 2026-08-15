ALTER TABLE "SquareCheckout"
ADD COLUMN "amountCents" INTEGER,
ADD COLUMN "currency" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "SquareRefund" (
    "squareRefundId" TEXT NOT NULL,
    "squarePaymentId" TEXT NOT NULL,
    "squareRefundOrderId" TEXT,
    "squareCheckoutId" TEXT,
    "userId" TEXT,
    "product" "SquareProduct",
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquareRefund_pkey" PRIMARY KEY ("squareRefundId")
);

CREATE INDEX "SquareRefund_squarePaymentId_status_idx" ON "SquareRefund"("squarePaymentId", "status");
CREATE INDEX "SquareRefund_squareCheckoutId_refundedAt_idx" ON "SquareRefund"("squareCheckoutId", "refundedAt");
CREATE UNIQUE INDEX "SquareRefund_squarePaymentId_key" ON "SquareRefund"("squarePaymentId");

ALTER TABLE "SquareRefund" ADD CONSTRAINT "SquareRefund_squareCheckoutId_fkey"
    FOREIGN KEY ("squareCheckoutId") REFERENCES "SquareCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SquareRefund" ADD CONSTRAINT "SquareRefund_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditBatch" ADD COLUMN "squarePaymentId" TEXT;
CREATE UNIQUE INDEX "CreditBatch_squarePaymentId_key" ON "CreditBatch"("squarePaymentId");
