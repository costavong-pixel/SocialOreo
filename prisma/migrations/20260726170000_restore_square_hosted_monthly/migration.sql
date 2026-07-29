ALTER TABLE "SquareCheckout" ADD COLUMN "squarePaymentLinkId" TEXT;
ALTER TABLE "SquareCheckout" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "SquareSubscription" ADD COLUMN "lastEventAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "SquareCheckout_squarePaymentLinkId_key" ON "SquareCheckout"("squarePaymentLinkId");

CREATE TABLE "SquareWebhookEvent" (
    "squareEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processingToken" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SquareWebhookEvent_pkey" PRIMARY KEY ("squareEventId")
);

CREATE INDEX "SquareWebhookEvent_eventType_createdAt_idx" ON "SquareWebhookEvent"("eventType", "createdAt");
