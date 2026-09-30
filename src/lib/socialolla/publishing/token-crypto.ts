import { createDecipheriv } from "node:crypto";
import type { PublishingPlatform } from "./platform-adaptation";

function keyFromEnvironment(platform: PublishingPlatform): Buffer {
  const suffix = platform === "google_business" ? "GOOGLE_BUSINESS" : platform.toUpperCase();
  const encoded = process.env[`SOCIALOLLA_${suffix}_TOKEN_ENCRYPTION_KEY`]
    ?? process.env.SOCIALOLLA_DESTINATION_TOKEN_ENCRYPTION_KEY
    ?? (platform === "instagram" ? process.env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY : undefined);
  if (!encoded) throw new Error(`Encrypted ${platform} token configuration is unavailable`);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error(`Encrypted ${platform} token configuration is invalid`);
  return key;
}

/** Decrypts the repository's v1 AES-GCM destination-token envelope. */
export function decryptDestinationToken(platform: PublishingPlatform, payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error(`Stored ${platform} connection token is invalid`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFromEnvironment(platform), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(`Stored ${platform} connection token could not be decrypted`);
  }
}
