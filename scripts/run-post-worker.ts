import { assertPostWorkerStagingRuntime, processDuePublishJobs } from "@/lib/socialolla/publishing/publish-worker";

async function main(): Promise<void> {
  assertPostWorkerStagingRuntime();
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(`${JSON.stringify({ worker: "post", mode: "dry-run", providerDisabled: true })}\n`);
    return;
  }
  const outcomes = await processDuePublishJobs({ maxJobs: Number(process.env.POST_WORKER_MAX_JOBS ?? "10") });
  process.stdout.write(`${JSON.stringify({ worker: "post", outcomes })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Post worker failed"}\n`);
  process.exitCode = 1;
});
