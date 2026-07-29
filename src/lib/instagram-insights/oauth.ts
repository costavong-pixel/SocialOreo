import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = { state: string; userId: string; expiresAt: number };

function sign(value: string) {
  const secret = process.env.AUTH0_SECRET;
  if (!secret) throw new Error("AUTH0_SECRET is required to secure the Instagram connection flow.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createInstagramOAuthState(userId: string) {
  const payload: StatePayload = { state: randomUUID(), userId, expiresAt: Date.now() + STATE_TTL_MS };
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: payload.state, cookieValue: `${value}.${sign(value)}` };
}

export function verifyInstagramOAuthState(cookieValue: string | undefined, state: string | null, userId: string) {
  if (!cookieValue || !state) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot < 1) return false;
  const value = cookieValue.slice(0, dot);
  const suppliedSignature = cookieValue.slice(dot + 1);
  const expectedSignature = sign(value);
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) return false;
  try {
    const payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as StatePayload;
    return payload.state === state && payload.userId === userId && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}
