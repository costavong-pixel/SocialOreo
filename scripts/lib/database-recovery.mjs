import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

export const BACKUP_MAGIC = Buffer.from("SOCIALOLLA_BACKUP_V1\n", "utf8");
export const BACKUP_IV_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;
export const RESTORE_CONFIRMATION = "RESTORE_TO_DISPOSABLE_DATABASE";

function postgresUrl(rawUrl, label) {
  if (!rawUrl?.trim()) throw new Error(`${label} is required.`);
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${label} must use postgresql:// or postgres://.`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) throw new Error(`${label} must identify a host and database.`);
  return { parsed, database };
}

export function databaseIdentity(rawUrl) {
  const { parsed, database } = postgresUrl(rawUrl, "Database URL");
  return `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${database}`;
}

export function assertRestoreTargetIsSafe({ sourceUrl, targetUrl, confirmation }) {
  if (confirmation !== RESTORE_CONFIRMATION) {
    throw new Error(`Restore confirmation must equal ${RESTORE_CONFIRMATION}.`);
  }
  if (databaseIdentity(sourceUrl) === databaseIdentity(targetUrl)) {
    throw new Error("Restore target resolves to the source database.");
  }
}

export function postgresConnectionEnvironment(rawUrl, baseEnvironment = process.env) {
  const { parsed, database } = postgresUrl(rawUrl, "Database URL");
  const {
    DATABASE_URL: _sourceDatabaseUrl,
    SOCIALOLLA_RESTORE_DATABASE_URL: _restoreDatabaseUrl,
    ...safeBaseEnvironment
  } = baseEnvironment;
  const sslMode = parsed.searchParams.get("sslmode");
  return {
    ...safeBaseEnvironment,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    ...(sslMode ? { PGSSLMODE: sslMode } : {}),
  };
}

export function parseEncryptionKey(encoded) {
  const value = encoded.trim();
  let key;
  if (/^[A-Fa-f0-9]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    const base64 = value.startsWith("base64:") ? value.slice(7) : value;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error("Backup encryption key must be 32-byte hexadecimal or base64 data.");
    }
    key = Buffer.from(base64, "base64");
  }
  if (key.byteLength !== 32) throw new Error("Backup encryption key must decode to exactly 32 bytes.");
  return key;
}

export async function readBackupKeyFile(keyPath) {
  const metadata = await stat(keyPath);
  if (!metadata.isFile()) throw new Error("Backup encryption key path is not a regular file.");
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("Backup encryption key file must not be accessible by group or other users.");
  }
  return parseEncryptionKey(await readFile(keyPath, "utf8"));
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export function buildIntegrityManifest({ filename, bytes, sha256, createdAt }) {
  return {
    version: 1,
    format: "postgresql-custom-aes-256-gcm",
    filename,
    bytes,
    sha256,
    createdAt,
  };
}

export async function verifyIntegrityManifest(artifactPath, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !manifest ||
    manifest.version !== 1 ||
    manifest.format !== "postgresql-custom-aes-256-gcm" ||
    manifest.filename !== basename(artifactPath) ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.createdAt !== "string"
  ) {
    throw new Error("Backup integrity manifest is invalid.");
  }
  const metadata = await stat(artifactPath);
  if (metadata.size !== manifest.bytes) throw new Error("Backup artifact size does not match its manifest.");
  if (await sha256File(artifactPath) !== manifest.sha256) {
    throw new Error("Backup artifact checksum does not match its manifest.");
  }
  return manifest;
}
