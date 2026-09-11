import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { runPostWorker } from "./run-post-worker";
import { runWatchWorker } from "./run-watch-worker";

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

function captureOutput(exec: () => Promise<unknown> | unknown) {
  const chunks: string[] = [];
  const errors: string[] = [];
  const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errors.push(String(chunk));
    return true;
  });
  return Promise.resolve(exec()).then(
    (value) => {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
      return { value, stdout: chunks.join(""), stderr: errors.join("") };
    },
    (error) => {
      stdoutWrite.mockRestore();
      stderrWrite.mockRestore();
      throw error;
    },
  );
}

function mockPublishWorker() {
  const processDuePublishJobs = vi.fn(async ({ maxJobs }: { maxJobs: number }) => [
    { status: "PUBLISHED", jobId: "job-1", replayed: false },
    { status: "FAILED", jobId: "job-2", retryScheduled: false, error: "mocked" },
    { maxJobs },
  ]);
  const assertPostWorkerStagingRuntime = vi.fn();

  return {
    processDuePublishJobs,
    assertPostWorkerStagingRuntime,
    moduleFactory: () => ({
      assertPostWorkerStagingRuntime,
      processDuePublishJobs,
    }),
  };
}

function mockWatchWorker() {
  const processDueWatchCaptures = vi.fn(async (_now: Date, limit: number) => ({
    inspected: 2,
    completed: 1,
    retried: 0,
    failed: 0,
    skipped: 1,
    limit,
  }));
  const assertWatchWorkerProviderDisabledRuntime = vi.fn();

  return {
    processDueWatchCaptures,
    assertWatchWorkerProviderDisabledRuntime,
    moduleFactory: () => ({
      assertWatchWorkerProviderDisabledRuntime,
      processDueWatchCaptures,
    }),
  };
}

vi.mock("@/lib/socialolla/publishing/publish-worker", async () => mockPublishWorker().moduleFactory());
vi.mock("@/lib/socialolla/watch/scheduled-watch", async () => mockWatchWorker().moduleFactory());

describe("worker entrypoint preflight", () => {
  it("keeps worker-runtime-preflight.ts side-effect-free", () => {
    const preflightSource = readFileSync(path.join(repoRoot, "scripts", "worker-runtime-preflight.ts"), "utf8");
    expect(preflightSource).not.toContain("assertPostWorkerStagingRuntime");
    expect(preflightSource).not.toContain("assertWatchWorkerStagingRuntime");
    expect(preflightSource).not.toContain("assertWatchWorkerProviderDisabledRuntime");
    expect(preflightSource).not.toContain("@/lib/socialolla/publishing/publish-worker");
    expect(preflightSource).not.toContain("@/lib/socialolla/watch/scheduled-watch");
    expect(preflightSource).not.toContain("@/lib/db/prisma");
    expect(preflightSource).not.toContain("@/lib/providers/social/provider-router");
    expect(preflightSource).not.toContain("@/lib/providers/social/provider-guard");
    expect(preflightSource).not.toContain("createPublishingProvider");
    expect(preflightSource).not.toContain("fetchSocialAudit");
    expect(preflightSource).not.toContain("/prisma");
    expect(preflightSource).not.toContain("provider-guard");
  });

  it("keeps real Post execution bound to the existing worker engine", () => {
    const postSource = readFileSync(path.join(repoRoot, "scripts", "run-post-worker.ts"), "utf8");
    expect(postSource).toContain('await import("@/lib/socialolla/publishing/publish-worker")');
    expect(postSource).toContain("processDuePublishJobs");
  });

  it("keeps real Watch execution bound to the existing worker engine", () => {
    const watchSource = readFileSync(path.join(repoRoot, "scripts", "run-watch-worker.ts"), "utf8");
    expect(watchSource).toContain('await import("@/lib/socialolla/watch/scheduled-watch")');
    expect(watchSource).toContain("processDueWatchCaptures");
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

describe("worker entrypoint execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs real post mode through authoritative Post worker with exact maxJobs", async () => {
    const moduleMock = await import("@/lib/socialolla/publishing/publish-worker");
    const postMock = moduleMock as {
      processDuePublishJobs: ReturnType<typeof vi.fn>;
      assertPostWorkerStagingRuntime: ReturnType<typeof vi.fn>;
    };

    const maxJobs = "13";
    const captured = await captureOutput(() => runPostWorker(["node", "run-post-worker"], {
      ...baseEnv,
      POST_WORKER_MAX_JOBS: maxJobs,
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    }));

    expect(postMock.assertPostWorkerStagingRuntime).toHaveBeenCalledWith({
      NODE_ENV: "staging",
      SOCIALOLLA_ENV: "staging",
      POST_WORKER_MAX_JOBS: maxJobs,
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    });
    expect(postMock.processDuePublishJobs).toHaveBeenCalledWith({ maxJobs: Number(maxJobs) });
    const parsed = JSON.parse(captured.stdout.trim());
    expect(parsed).toEqual({
      worker: "post",
      outcomes: [
        { status: "PUBLISHED", jobId: "job-1", replayed: false },
        { status: "FAILED", jobId: "job-2", retryScheduled: false, error: "mocked" },
        { maxJobs: Number(maxJobs) },
      ],
    });
    expect(captured.stderr).toBe("");
  });

  it("runs real watch mode through authoritative Watch worker with exact max monitors", async () => {
    const moduleMock = await import("@/lib/socialolla/watch/scheduled-watch");
    const watchMock = moduleMock as unknown as {
      processDueWatchCaptures: ReturnType<typeof vi.fn>;
      assertWatchWorkerProviderDisabledRuntime: ReturnType<typeof vi.fn>;
    };

    const maxMonitors = "7";
    const captured = await captureOutput(() => runWatchWorker(["node", "run-watch-worker"], {
      ...baseEnv,
      WATCH_WORKER_MAX_MONITORS: maxMonitors,
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    }));

    expect(watchMock.assertWatchWorkerProviderDisabledRuntime).toHaveBeenCalledWith({
      NODE_ENV: "staging",
      SOCIALOLLA_ENV: "staging",
      WATCH_WORKER_MAX_MONITORS: maxMonitors,
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    });
    expect(watchMock.processDueWatchCaptures).toHaveBeenCalledWith(expect.any(Date), Number(maxMonitors));
    const parsed = JSON.parse(captured.stdout.trim());
    expect(parsed).toEqual({
      worker: "watch",
      summary: {
        inspected: 2,
        completed: 1,
        retried: 0,
        failed: 0,
        skipped: 1,
        limit: Number(maxMonitors),
      },
    });
    expect(captured.stderr).toBe("");
  });

  it("rejects real Post mode before loading the engine outside staging", async () => {
    const postMock = await import("@/lib/socialolla/publishing/publish-worker");

    await expect(runPostWorker(["node", "run-post-worker"], {
      ...baseEnv,
      NODE_ENV: "production",
    })).rejects.toThrow("staging-only");
    expect(postMock.assertPostWorkerStagingRuntime).not.toHaveBeenCalled();
    expect(postMock.processDuePublishJobs).not.toHaveBeenCalled();
  });

  it("rejects real Watch mode before loading the engine outside staging", async () => {
    const watchMock = await import("@/lib/socialolla/watch/scheduled-watch");

    await expect(runWatchWorker(["node", "run-watch-worker"], {
      ...baseEnv,
      SOCIALOLLA_ENV: "production",
    })).rejects.toThrow("staging-only");
    expect(watchMock.assertWatchWorkerProviderDisabledRuntime).not.toHaveBeenCalled();
    expect(watchMock.processDueWatchCaptures).not.toHaveBeenCalled();
  });

  it("rejects real Post mode before loading the engine when provider calls are enabled", async () => {
    const postMock = await import("@/lib/socialolla/publishing/publish-worker");

    await expect(runPostWorker(["node", "run-post-worker"], {
      ...baseEnv,
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    })).rejects.toThrow("provider-disabled");
    expect(postMock.assertPostWorkerStagingRuntime).not.toHaveBeenCalled();
    expect(postMock.processDuePublishJobs).not.toHaveBeenCalled();
  });

  it("rejects real Watch mode before loading the engine when provider calls are enabled", async () => {
    const watchMock = await import("@/lib/socialolla/watch/scheduled-watch");

    await expect(runWatchWorker(["node", "run-watch-worker"], {
      ...baseEnv,
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    })).rejects.toThrow("provider-disabled");
    expect(watchMock.assertWatchWorkerProviderDisabledRuntime).not.toHaveBeenCalled();
    expect(watchMock.processDueWatchCaptures).not.toHaveBeenCalled();
  });

  it("keeps dry-run output distinct from real output", async () => {
    const postMock = (await import("@/lib/socialolla/publishing/publish-worker")) as unknown as {
      processDuePublishJobs: ReturnType<typeof vi.fn>;
    };

    const dryRun = await captureOutput(() => runPostWorker(["node", "run-post-worker", "--dry-run"], baseEnv));
    const real = await captureOutput(() => runPostWorker(["node", "run-post-worker"], {
      ...baseEnv,
      POST_WORKER_MAX_JOBS: "1",
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    }));

    expect(JSON.parse(dryRun.stdout.trim())).toEqual({
      worker: "post",
      mode: "dry-run",
      staging: true,
      providerDisabled: true,
      ready: true,
    });
    expect(JSON.parse(real.stdout.trim()).worker).toBe("post");
    expect(postMock.processDuePublishJobs).toHaveBeenCalledWith({ maxJobs: 1 });
    expect(JSON.parse(dryRun.stdout.trim()).worker).toBe("post");
    expect(JSON.parse(real.stdout.trim())).toMatchObject({ outcomes: expect.any(Array) });
    expect(real.stdout).not.toBe(dryRun.stdout);
  });

  it("does not invoke mocked engines during dry-run post/readiness", async () => {
    const postMock = (await import("@/lib/socialolla/publishing/publish-worker")) as unknown as {
      processDuePublishJobs: ReturnType<typeof vi.fn>;
      assertPostWorkerStagingRuntime: ReturnType<typeof vi.fn>;
    };
    const watchMock = (await import("@/lib/socialolla/watch/scheduled-watch")) as unknown as {
      processDueWatchCaptures: ReturnType<typeof vi.fn>;
      assertWatchWorkerProviderDisabledRuntime: ReturnType<typeof vi.fn>;
    };

    await captureOutput(() => runPostWorker(["node", "run-post-worker", "--dry-run"], baseEnv));
    await captureOutput(() => runWatchWorker(["node", "run-watch-worker", "--dry-run"], baseEnv));

    expect(postMock.assertPostWorkerStagingRuntime).not.toHaveBeenCalled();
    expect(postMock.processDuePublishJobs).not.toHaveBeenCalled();
    expect(watchMock.assertWatchWorkerProviderDisabledRuntime).not.toHaveBeenCalled();
    expect(watchMock.processDueWatchCaptures).not.toHaveBeenCalled();
  });
});
