-- Shared OAuth connection state and refresh-token support.
ALTER TABLE "Destination" ADD COLUMN "refreshTokenCiphertext" TEXT;

CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeVerifierCiphertext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthState_stateHash_key" ON "OAuthState"("stateHash");
CREATE INDEX "OAuthState_userId_provider_expiresAt_idx" ON "OAuthState"("userId", "provider", "expiresAt");
CREATE INDEX "OAuthState_expiresAt_consumedAt_idx" ON "OAuthState"("expiresAt", "consumedAt");

ALTER TABLE "OAuthState"
  ADD CONSTRAINT "OAuthState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
