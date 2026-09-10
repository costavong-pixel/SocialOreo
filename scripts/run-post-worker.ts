import { fileURLToPath } from "node:url";
import { assertWorkerRuntimeReadiness, assertWorkerRuntimeEnvironment } from "./worker-runtime-preflight";

export async function runPostWorker(argv: string[] = process.argv, env: Record<string, string | undefined> = process.env): Promise<void> {
  const isDryRun = Array.isArray(argv) && argv.includes("--dry-run");
  if (isDryRun) {
    const result = assertWorkerRuntimeReadiness({ worker: "post", env, argv });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  assertWorkerRuntimeEnvironment({ worker: "post", env });
  const { assertPostWorkerStagingRuntime, processDuePublishJobs } = await import("@/lib/socialolla/publishing/publish-worker");
  assertPostWorkerStagingRuntime(env);
  const outcomes = await processDuePublishJobs({ maxJobs: Number(env.POST_WORKER_MAX_JOBS ?? "10") });
  process.stdout.write(`${JSON.stringify({ worker: "post", outcomes })}\n`);
}

async function main(): Promise<void> {
  await runPostWorker();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Post worker failed"}\n`);
    process.exitCode = 1;
  });
}
