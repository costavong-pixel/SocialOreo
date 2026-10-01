import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptConnectionSecret, encryptConnectionSecret } from "./token-crypto";
import { oauthStateEncryptionKey } from "./config";
import type { PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";

const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStateDb = Pick<typeof prisma, "oAuthState">;

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function createPendingOAuthState(input: {
  userId: string;
  provider: PublishingPlatform;
  redirectUri: string;
  supportsPkce: boolean;
  db?: OAuthStateDb;
  now?: Date;
}) {
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  const state = randomBytes(32).toString("base64url");
  const pkce = input.supportsPkce ? createPkcePair() : null;
  const key = oauthStateEncryptionKey();
  if (pkce && !key) throw new Error("OAuth state encryption is not configured.");
  await db.oAuthState.create({
    data: {
      stateHash: hashState(state),
      userId: input.userId,
      provider: input.provider,
      redirectUri: input.redirectUri,
      codeVerifierCiphertext: pkce && key ? encryptConnectionSecret(pkce.verifier, key) : null,
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    },
  });
  return { state, codeVerifier: pkce?.verifier ?? null, codeChallenge: pkce?.challenge ?? null, expiresAt: new Date(now.getTime() + STATE_TTL_MS) };
}

export async function consumePendingOAuthState(input: {
  state: string;
  userId: string;
  provider: PublishingPlatform;
  redirectUri: string;
  db?: OAuthStateDb;
  now?: Date;
}): Promise<{ codeVerifier: string | null } | null> {
  if (!input.state) return null;
  const db = input.db ?? prisma;
  const now = input.now ?? new Date();
  const row = await db.oAuthState.findUnique({ where: { stateHash: hashState(input.state) } });
  if (!row || row.userId !== input.userId || row.provider !== input.provider || row.redirectUri !== input.redirectUri || row.consumedAt || row.expiresAt <= now) return null;
  const consumed = await db.oAuthState.updateMany({
    where: { id: row.id, stateHash: row.stateHash, userId: input.userId, provider: input.provider, redirectUri: input.redirectUri, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return null;
  if (!row.codeVerifierCiphertext) return { codeVerifier: null };
  const key = oauthStateEncryptionKey();
  if (!key) return null;
  try {
    return { codeVerifier: decryptConnectionSecret(row.codeVerifierCiphertext, key) };
  } catch {
    return null;
  }
}
