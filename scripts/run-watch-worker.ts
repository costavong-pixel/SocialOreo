import { fileURLToPath } from "node:url";
import { assertWorkerRuntimeReadiness, assertWorkerRuntimeEnvironment } from "./worker-runtime-preflight";

export async function runWatchWorker(argv: string[] = process.argv, env: Record<string, string | undefined> = process.env): Promise<void> {
  const isDryRun = Array.isArray(argv) && argv.includes("--dry-run");
  if (isDryRun) {
    const result = assertWorkerRuntimeReadiness({ worker: "watch", env, argv });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  assertWorkerRuntimeEnvironment({ worker: "watch", env });
  const { assertWatchWorkerProviderDisabledRuntime, processDueWatchCaptures } = await import("@/lib/socialolla/watch/scheduled-watch");
  assertWatchWorkerProviderDisabledRuntime(env);
  const summary = await processDueWatchCaptures(new Date(), Number(env.WATCH_WORKER_MAX_MONITORS ?? "10"));
  process.stdout.write(`${JSON.stringify({ worker: "watch", summary })}\n`);
}

async function main(): Promise<void> {
  await runWatchWorker();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Watch worker failed"}\n`);
    process.exitCode = 1;
  });
}
