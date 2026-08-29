import { assertWatchWorkerProviderDisabledRuntime, processDueWatchCaptures } from "@/lib/socialolla/watch/scheduled-watch";

async function main(): Promise<void> {
  assertWatchWorkerProviderDisabledRuntime();
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify({ worker: "watch", mode: "dry-run", providerDisabled: true })}\n`);
    return;
  }
  const summary = await processDueWatchCaptures(new Date(), Number(process.env.WATCH_WORKER_MAX_MONITORS ?? "10"));
  process.stdout.write(`${JSON.stringify({ worker: "watch", summary })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Watch worker failed"}\n`);
  process.exitCode = 1;
});
