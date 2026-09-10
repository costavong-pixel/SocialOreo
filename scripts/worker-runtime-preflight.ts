import { assertPostWorkerStagingRuntime } from "@/lib/socialolla/publishing/publish-worker";
import { assertWatchWorkerProviderDisabledRuntime } from "@/lib/socialolla/watch/scheduled-watch";

type Worker = "post" | "watch";

type RuntimePreflightInput = {
  worker: Worker;
  env?: Record<string, string | undefined>;
  argv?: readonly string[];
};

export type WorkerReadinessResult = {
  worker: Worker;
  mode: "dry-run";
  staging: true;
  providerDisabled: true;
  ready: true;
};

const DRY_RUN_FLAG = "--dry-run";
const PRECHECKS: Record<Worker, (env: Record<string, string | undefined>) => void> = {
  post: assertPostWorkerStagingRuntime,
  watch: assertWatchWorkerProviderDisabledRuntime,
};
const DRY_RUN_REQUIREMENT: Record<Worker, string> = {
  post: "The Post worker requires --dry-run.",
  watch: "The Watch worker requires --dry-run.",
};

export function assertWorkerRuntimeReadiness({
  worker,
  env = process.env,
  argv = process.argv,
}: RuntimePreflightInput): WorkerReadinessResult {
  PRECHECKS[worker](env);
  if (!Array.isArray(argv) || !argv.includes(DRY_RUN_FLAG)) {
    throw new Error(DRY_RUN_REQUIREMENT[worker]);
  }
  return { worker, mode: "dry-run", staging: true, providerDisabled: true, ready: true };
}
