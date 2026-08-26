import { assertWatchWorkerStagingRuntime, processDueWatchCaptures } from "@/lib/socialolla/watch/scheduled-watch";

assertWatchWorkerStagingRuntime();
const summary = await processDueWatchCaptures(new Date(), Number(process.env.WATCH_WORKER_MAX_MONITORS ?? "10"));
process.stdout.write(`${JSON.stringify({ worker: "watch", summary })}\n`);
