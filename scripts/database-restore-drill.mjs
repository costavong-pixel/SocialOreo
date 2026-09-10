#!/usr/bin/env node

import { createDecipheriv } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import {
  BACKUP_IV_BYTES,
  BACKUP_MAGIC,
  BACKUP_TAG_BYTES,
  assertRestoreTargetIsSafe,
  postgresConnectionEnvironment,
  readBackupKeyFile,
  verifyIntegrityManifest,
} from "./lib/database-recovery.mjs";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function processSucceeded(child, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("error", () => rejectPromise(new Error(`${label} could not start.`)));
    child.once("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function readEnvelope(artifactPath) {
  const metadata = await stat(artifactPath);
  const minimumSize = BACKUP_MAGIC.byteLength + BACKUP_IV_BYTES + BACKUP_TAG_BYTES + 1;
  if (metadata.size < minimumSize) throw new Error("Encrypted backup artifact is too small.");
  const handle = await open(artifactPath, "r");
  try {
    const header = Buffer.alloc(BACKUP_MAGIC.byteLength + BACKUP_IV_BYTES);
    await handle.read(header, 0, header.byteLength, 0);
    if (!header.subarray(0, BACKUP_MAGIC.byteLength).equals(BACKUP_MAGIC)) {
      throw new Error("Encrypted backup header is invalid.");
    }
    const authTag = Buffer.alloc(BACKUP_TAG_BYTES);
    await handle.read(authTag, 0, BACKUP_TAG_BYTES, metadata.size - BACKUP_TAG_BYTES);
    return {
      size: metadata.size,
      iv: header.subarray(BACKUP_MAGIC.byteLength),
      authTag,
    };
  } finally {
    await handle.close();
  }
}

async function main() {
  const artifactArgument = process.argv[2]?.trim();
  if (!artifactArgument || !isAbsolute(artifactArgument)) {
    throw new Error("Pass the absolute encrypted backup artifact path as the only argument.");
  }
  const artifactPath = resolve(artifactArgument);
  const sourceUrl = requiredEnvironment("DATABASE_URL");
  const targetUrl = requiredEnvironment("SOCIALOLLA_RESTORE_DATABASE_URL");
  const keyPath = requiredEnvironment("SOCIALOLLA_BACKUP_KEY_FILE");
  if (!isAbsolute(keyPath)) throw new Error("Backup key file path must be absolute.");
  assertRestoreTargetIsSafe({
    sourceUrl,
    targetUrl,
    confirmation: process.env.SOCIALOLLA_RESTORE_CONFIRM,
  });
  await verifyIntegrityManifest(artifactPath, `${artifactPath}.manifest.json`);
  const envelope = await readEnvelope(artifactPath);
  const key = await readBackupKeyFile(keyPath);
  const temporaryRoot = resolve(process.env.SOCIALOLLA_RESTORE_TEMP_DIR?.trim() || tmpdir());
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  const restoreDirectory = await mkdtemp(join(temporaryRoot, "socialolla-restore-drill-"));
  const decryptedPath = join(restoreDirectory, "database.dump");

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
    decipher.setAuthTag(envelope.authTag);
    await pipeline(
      createReadStream(artifactPath, {
        start: BACKUP_MAGIC.byteLength + BACKUP_IV_BYTES,
        end: envelope.size - BACKUP_TAG_BYTES - 1,
      }),
      decipher,
      createWriteStream(decryptedPath, { flags: "wx", mode: 0o600 }),
    );

    const targetEnvironment = postgresConnectionEnvironment(targetUrl);
    const child = spawn("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      `--dbname=${targetEnvironment.PGDATABASE}`,
      decryptedPath,
    ], { env: targetEnvironment, stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.resume();
    await processSucceeded(child, "pg_restore");
    console.log("RESTORE_DRILL_COMPLETED=YES");
  } finally {
    await rm(restoreDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`RESTORE_DRILL_FAILED=${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
