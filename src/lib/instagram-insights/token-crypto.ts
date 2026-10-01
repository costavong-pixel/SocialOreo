import { decryptConnectionSecret, encryptConnectionSecret } from "@/lib/socialolla/connections/token-crypto";

export function encryptInstagramToken(token: string, encodedKey: string) {
  try {
    return encryptConnectionSecret(token, encodedKey);
  } catch (error) {
    if (error instanceof Error && error.message.includes("32-byte")) throw new Error("META_INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    throw error;
  }
}

export function decryptInstagramToken(payload: string, encodedKey: string) {
  try {
    return decryptConnectionSecret(payload, encodedKey);
  } catch (error) {
    if (error instanceof Error && error.message.includes("32-byte")) throw new Error("META_INSTAGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    throw error;
  }
}
