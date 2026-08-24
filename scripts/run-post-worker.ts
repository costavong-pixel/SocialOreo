import { processDuePublishJobs } from "@/lib/socialolla/publishing/publish-worker";

const outcomes = await processDuePublishJobs({ maxJobs: Number(process.env.POST_WORKER_MAX_JOBS ?? "10") });
process.stdout.write(`${JSON.stringify({ worker: "post", outcomes })}\n`);
