import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("META_INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptInstagramToken(token: string, encodedKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptInstagramToken(payload: string, encodedKey: string) {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Stored Instagram connection token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
