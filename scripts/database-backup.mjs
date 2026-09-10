#!/usr/bin/env node

import { createCipheriv, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, parse, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import {
  BACKUP_IV_BYTES,
  BACKUP_MAGIC,
  buildIntegrityManifest,
  postgresConnectionEnvironment,
  readBackupKeyFile,
  sha256File,
} from "./lib/database-recovery.mjs";

function parseCommandArgv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a JSON array of strings.`);
  }
  return parsed;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

async function main() {
  const sourceUrl = requiredEnvironment("DATABASE_URL");
  const configuredDirectory = requiredEnvironment("SOCIALOLLA_BACKUP_DIR");
  const keyPath = requiredEnvironment("SOCIALOLLA_BACKUP_KEY_FILE");
  if (!isAbsolute(configuredDirectory) || !isAbsolute(keyPath)) {
    throw new Error("Backup directory and key file paths must be absolute.");
  }

  const backupDirectory = resolve(configuredDirectory);
  if (backupDirectory === parse(backupDirectory).root) throw new Error("Filesystem root cannot be the backup directory.");
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const key = await readBackupKeyFile(keyPath);
  const iv = randomBytes(BACKUP_IV_BYTES);
  const unique = randomBytes(4).toString("hex");
  const filename = `socialolla-postgres-${timestamp()}-${unique}.dump.enc`;
  const finalPath = join(backupDirectory, filename);
  const manifestPath = `${finalPath}.manifest.json`;
  const partialPath = join(backupDirectory, `.${filename}.partial-${process.pid}`);
  const partialManifestPath = `${partialPath}.manifest.json`;
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const pgEnvironment = postgresConnectionEnvironment(sourceUrl);
  let child;
  let published = false;
  const pgDumpCommand = process.env.SOCIALOLLA_PG_DUMP_COMMAND ?? "pg_dump";
  const pgDumpArgv = parseCommandArgv("SOCIALOLLA_PG_DUMP_ARGV");

  try {
    await writeFile(partialPath, Buffer.concat([BACKUP_MAGIC, iv]), { flag: "wx", mode: 0o600 });
    child = spawn(pgDumpCommand, [...pgDumpArgv, "--format=custom", "--no-owner", "--no-privileges"], {
      env: pgEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.resume();
    await Promise.all([
      pipeline(child.stdout, cipher, createWriteStream(partialPath, { flags: "a", mode: 0o600 })),
      processSucceeded(child, "pg_dump"),
    ]);
    await appendFile(partialPath, cipher.getAuthTag());

    const metadata = await stat(partialPath);
    const manifest = buildIntegrityManifest({
      filename,
      bytes: metadata.size,
      sha256: await sha256File(partialPath),
      createdAt: new Date().toISOString(),
    });
    await writeFile(partialManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(partialPath, finalPath);
    await rename(partialManifestPath, manifestPath);
    published = true;

    console.log(`BACKUP_CREATED=${finalPath}`);
    console.log(`BACKUP_MANIFEST=${manifestPath}`);
    console.log(`BACKUP_BYTES=${metadata.size}`);
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
    await rm(partialPath, { force: true });
    await rm(partialManifestPath, { force: true });
    if (!published) {
      await rm(finalPath, { force: true });
      await rm(manifestPath, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(`BACKUP_FAILED=${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
