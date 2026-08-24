import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MediaDescriptor, PrivateMediaStorage } from "./media";

function signingSecret(): string {
  const value = process.env.MEDIA_GRANT_SECRET ?? process.env.AUTH0_SECRET;
  if (!value) throw new Error("Media grant signing is not configured");
  return value;
}

function storageRoot(): string {
  return path.resolve(process.env.MEDIA_STORAGE_ROOT ?? path.join(process.cwd(), ".socialolla-media"));
}

function filePath(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey.replace(/\//g, path.sep));
  const prefix = `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error("Media path escaped storage root");
  return resolved;
}

function grantSignature(assetId: string, expiresAt: number): string {
  return createHmac("sha256", signingSecret()).update(`${assetId}:${expiresAt}`).digest("base64url");
}

export function verifyMediaGrant(assetId: string, expiresAt: number, supplied: string): boolean {
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(grantSignature(assetId, expiresAt));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createLocalPrivateMediaStorage(): PrivateMediaStorage {
  return {
    async put(input) {
      const destination = filePath(input.descriptor.storageKey);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, input.body, { flag: "wx", mode: 0o600 });
      return input.descriptor;
    },
    async read(descriptor) {
      return readFile(filePath(descriptor.storageKey));
    },
    async createControlledReadGrant(input) {
      if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 300) throw new Error("Media read grant lifetime is invalid");
      const base = (process.env.APP_URL ?? process.env.APP_BASE_URL)?.replace(/\/$/, "");
      if (!base) throw new Error("Media grant URL base is not configured");
      const expires = Math.floor((Date.now() + input.expiresInSeconds * 1000) / 1000);
      const signature = grantSignature(input.descriptor.assetId, expires);
      return { grant: `${base}/api/media/${encodeURIComponent(input.descriptor.assetId)}?expires=${expires}&signature=${encodeURIComponent(signature)}`, expiresAt: new Date(expires * 1000) };
    },
  };
}
