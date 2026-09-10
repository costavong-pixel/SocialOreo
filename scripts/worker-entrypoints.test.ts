import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const tsxBinary = process.platform === "win32"
  ? path.join(repoRoot, "node_modules", ".bin", "tsx.cmd")
  : path.join(repoRoot, "node_modules", ".bin", "tsx");

const baseEnv = {
  NODE_ENV: "staging",
  SOCIALOLLA_ENV: "staging",
  SOCIALOLLA_PROVIDER_DISABLED: "true",
};

type WorkerEntrypoint = "post" | "watch";
const entrypoints: Array<{ worker: WorkerEntrypoint; script: string }> = [
  { worker: "post", script: "./scripts/run-post-worker.ts" },
  { worker: "watch", script: "./scripts/run-watch-worker.ts" },
];

function runEntrypoint(script: string, args: string[] = [], env: Partial<Record<string, string | undefined>>) {
  const result = spawnSync(tsxBinary, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

describe("worker entrypoint preflight", () => {
  it("keeps worker-runtime-preflight.ts side-effect-free", () => {
    const preflightSource = readFileSync(path.join(repoRoot, "scripts", "worker-runtime-preflight.ts"), "utf8");
    expect(preflightSource).not.toContain("assertPostWorkerStagingRuntime");
    expect(preflightSource).not.toContain("assertWatchWorkerStagingRuntime");
    expect(preflightSource).not.toContain("assertWatchWorkerProviderDisabledRuntime");
    expect(preflightSource).not.toContain("@/lib/socialolla/publishing/publish-worker");
    expect(preflightSource).not.toContain("@/lib/socialolla/watch/scheduled-watch");
    expect(preflightSource).not.toContain("/prisma");
    expect(preflightSource).not.toContain("provider-guard");
  });

  it.each(entrypoints)("returns stable readiness for %s when safely invoked", ({ worker, script }) => {
    const result = runEntrypoint(script, ["--dry-run"], baseEnv);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim())).toEqual({
      worker,
      mode: "dry-run",
      staging: true,
      providerDisabled: true,
      ready: true,
    });
  });

  it.each(entrypoints)("rejects %s without --dry-run before engine execution", ({ worker, script }) => {
    const result = runEntrypoint(script, [], baseEnv);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`${worker[0].toUpperCase() + worker.slice(1)} worker requires --dry-run.`);
  });

  it.each(entrypoints)("rejects %s on non-staging runtime", ({ worker, script }) => {
    const result = runEntrypoint(script, ["--dry-run"], { ...baseEnv, NODE_ENV: "production" });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("staging-only");
  });

  it.each(entrypoints)("rejects %s when provider is not provider-disabled", ({ worker, script }) => {
    const result = runEntrypoint(script, ["--dry-run"], { ...baseEnv, SOCIALOLLA_PROVIDER_DISABLED: "false" });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("provider-disabled");
  });
});
