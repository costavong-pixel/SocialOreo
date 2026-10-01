import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("OAuth token encryption key must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptConnectionSecret(secret: string, encodedKey: string): string {
  if (!secret) throw new Error("Cannot encrypt an empty OAuth secret.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptConnectionSecret(payload: string, encodedKey: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Stored OAuth secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function redactConnectionSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return `[redacted:${createHash("sha256").update(value).digest("hex").slice(0, 12)}]`;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
