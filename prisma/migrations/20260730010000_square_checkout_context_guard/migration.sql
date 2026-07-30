ALTER TABLE "SquareCheckout"
  ADD COLUMN "squareApplicationId" TEXT,
  ADD COLUMN "squareEnvironment" TEXT,
  ADD COLUMN "squareLocationId" TEXT,
  ADD COLUMN "squarePlanVariationId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "SquareCheckout_pending_expiry_idx"
  ON "SquareCheckout"("userId", "product", "expiresAt");
