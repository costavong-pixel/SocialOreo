ALTER TABLE "SquareCheckout" ADD COLUMN "pendingKey" TEXT;

CREATE UNIQUE INDEX "SquareCheckout_pendingKey_key"
  ON "SquareCheckout"("pendingKey");
