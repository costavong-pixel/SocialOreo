import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error The operational recovery module is native ESM JavaScript executed directly by Node.
import { assertRestoreTargetIsSafe, buildIntegrityManifest, parseEncryptionKey, sha256File, verifyIntegrityManifest } from "./database-recovery.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("database recovery safeguards", () => {
  it("accepts only an exact 256-bit backup encryption key", () => {
    const key = Buffer.alloc(32, 7);
    expect(parseEncryptionKey(key.toString("base64"))).toEqual(key);
    expect(parseEncryptionKey(key.toString("hex"))).toEqual(key);
    expect(() => parseEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("requires explicit disposable-restore confirmation", () => {
    expect(() => assertRestoreTargetIsSafe({
      sourceUrl: "postgresql://source:secret@db.example/socialolla?schema=public",
      targetUrl: "postgresql://restore:secret@restore.example/socialolla_restore",
      confirmation: "",
    })).toThrow(/confirmation/);
  });

  it("refuses the source database even when credentials and query parameters differ", () => {
    expect(() => assertRestoreTargetIsSafe({
      sourceUrl: "postgresql://source:one@db.example:5432/socialolla?schema=public",
      targetUrl: "postgresql://other:two@DB.EXAMPLE/socialolla?sslmode=require",
      confirmation: "RESTORE_TO_DISPOSABLE_DATABASE",
    })).toThrow(/source database/);
  });

  it("verifies artifact size and checksum before a restore", async () => {
    const directory = await mkdtemp(join(tmpdir(), "socialolla-recovery-test-"));
    temporaryDirectories.push(directory);
    const artifact = join(directory, "socialolla.dump.enc");
    const manifestPath = `${artifact}.manifest.json`;
    await writeFile(artifact, Buffer.from("encrypted-test-artifact"));
    const sha256 = await sha256File(artifact);
    const manifest = buildIntegrityManifest({
      filename: "socialolla.dump.enc",
      bytes: 23,
      sha256,
      createdAt: "2026-09-07T10:00:00.000Z",
    });
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(verifyIntegrityManifest(artifact, manifestPath)).resolves.toEqual(manifest);

    await writeFile(artifact, Buffer.from("tampered"));
    await expect(verifyIntegrityManifest(artifact, manifestPath)).rejects.toThrow(/size|checksum/);
  });

  it("publishes encrypted output and restores verified bytes through the drill gate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "socialolla-recovery-script-test-"));
    temporaryDirectories.push(directory);
    const binaryDirectory = join(directory, "bin");
    const backupDirectory = join(directory, "backups");
    const restoreTempDirectory = join(directory, "restore-temp");
    const capturePath = join(directory, "restored.dump");
    const keyPath = join(directory, "backup.key");
    await Promise.all([binaryDirectory, backupDirectory, restoreTempDirectory].map((directory) => mkdir(directory, { recursive: true })));
    const syntheticDump = "synthetic-postgres-custom-dump";
    const dumpCommand = "pg_dump.js";
    const restoreCommand = "pg_restore.js";
    const pgDumpPath = join(binaryDirectory, dumpCommand);
    const pgRestorePath = join(binaryDirectory, restoreCommand);
    const syntheticDumpBody = `#!/usr/bin/env node\nprocess.stdout.write('${syntheticDump}');\n`;
    const restoreBody = `#!/usr/bin/env node\nconst { copyFileSync } = require("node:fs");\nconst capturePath = process.env.RESTORE_CAPTURE_PATH;\nconst targetPath = process.argv[process.argv.length - 1];\nif (!capturePath || !targetPath) process.exit(1);\ncopyFileSync(targetPath, capturePath);\n`;
    await writeFile(pgDumpPath, syntheticDumpBody);
    await writeFile(pgRestorePath, restoreBody);
    await Promise.all([chmod(pgDumpPath, 0o700), chmod(pgRestorePath, 0o700)]);
    await writeFile(keyPath, Buffer.alloc(32, 9).toString("base64"), { mode: 0o600 });

  const baseEnvironment = {
      ...process.env,
      PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ""}`,
      Path: `${binaryDirectory}${delimiter}${process.env.Path ?? ""}`,
      SOCIALOLLA_PG_DUMP_COMMAND: process.execPath,
      SOCIALOLLA_PG_DUMP_ARGV: JSON.stringify([pgDumpPath]),
      SOCIALOLLA_PG_RESTORE_COMMAND: process.execPath,
      SOCIALOLLA_PG_RESTORE_ARGV: JSON.stringify([pgRestorePath]),
      DATABASE_URL: "postgresql://source:private-password@source.example/socialolla",
      SOCIALOLLA_BACKUP_DIR: backupDirectory,
      SOCIALOLLA_BACKUP_KEY_FILE: keyPath,
    };
    const backup = spawnSync(process.execPath, [join(process.cwd(), "scripts/database-backup.mjs")], {
      env: baseEnvironment,
      encoding: "utf8",
    });
    expect(backup.status, backup.stderr).toBe(0);
    expect(`${backup.stdout}${backup.stderr}`).not.toContain("private-password");

    const backupFiles = await readdir(backupDirectory);
    const artifactName = backupFiles.find((file) => file.endsWith(".dump.enc"));
    expect(artifactName).toBeTruthy();
    expect(backupFiles).toEqual(expect.arrayContaining([artifactName!, `${artifactName!}.manifest.json`]));
    expect(backupFiles.some((file) => file.includes(".partial-"))).toBe(false);
    const artifactPath = join(backupDirectory, artifactName!);
    expect((await readFile(artifactPath)).includes(Buffer.from(syntheticDump))).toBe(false);
    await expect(verifyIntegrityManifest(artifactPath, `${artifactPath}.manifest.json`)).resolves.toBeTruthy();

    const restore = spawnSync(process.execPath, [join(process.cwd(), "scripts/database-restore-drill.mjs"), artifactPath], {
      env: {
        ...baseEnvironment,
        SOCIALOLLA_RESTORE_DATABASE_URL: "postgresql://restore:other-password@restore.example/socialolla_restore",
        SOCIALOLLA_RESTORE_CONFIRM: "RESTORE_TO_DISPOSABLE_DATABASE",
        SOCIALOLLA_RESTORE_TEMP_DIR: restoreTempDirectory,
        RESTORE_CAPTURE_PATH: capturePath,
      },
      encoding: "utf8",
    });
    expect(restore.status, restore.stderr).toBe(0);
    expect(`${restore.stdout}${restore.stderr}`).not.toContain("other-password");
    expect(await readFile(capturePath, "utf8")).toBe(syntheticDump);
    expect(await readdir(restoreTempDirectory)).toEqual([]);
  });
});
