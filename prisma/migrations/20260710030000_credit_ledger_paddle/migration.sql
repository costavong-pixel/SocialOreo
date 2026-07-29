-- Rename Stripe ledger reference to Paddle fields
ALTER TABLE "CreditLedger" RENAME COLUMN "stripePaymentId" TO "paddleTransactionId";
ALTER TABLE "CreditLedger" ADD COLUMN "paddleCustomerId" TEXT;
