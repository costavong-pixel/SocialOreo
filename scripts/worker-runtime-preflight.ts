type Worker = "post" | "watch";

type RuntimePreflightInput = {
  worker: Worker;
  env?: Record<string, string | undefined>;
  argv?: readonly string[];
};

export type WorkerReadinessResult = {
  worker: Worker;
  mode: "dry-run";
  staging: boolean;
  providerDisabled: boolean;
  ready: true;
};

const DRY_RUN_FLAG = "--dry-run";
const DRY_RUN_REQUIREMENT: Record<Worker, string> = {
  post: "The Post worker requires --dry-run.",
  watch: "The Watch worker requires --dry-run.",
};

const PRODUCTION_ENABLE_FLAG: Record<Worker, string> = {
  post: "SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED",
  watch: "SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED",
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isStagingRuntime(env: Record<string, string | undefined>): boolean {
  return normalize(env.NODE_ENV) === "staging" && normalize(env.SOCIALOLLA_ENV) === "staging";
}

function isExactProductionRuntime(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production" && env.SOCIALOLLA_ENV === "production";
}

function providerDisabledEnabled(env: Record<string, string | undefined>): boolean {
  return normalize(env.SOCIALOLLA_PROVIDER_DISABLED) !== "false";
}

function assertProviderDisabled(worker: Worker, env: Record<string, string | undefined>): void {
  if (!providerDisabledEnabled(env)) {
    throw new Error(`The ${worker === "post" ? "Post" : "Watch"} worker requires provider-disabled mode.`);
  }
}

function assertWorkerRuntime(worker: Worker, env: Record<string, string | undefined>): "staging" | "production" {
  const label = worker === "post" ? "Post" : "Watch";
  if (isExactProductionRuntime(env)) {
    const enableFlag = PRODUCTION_ENABLE_FLAG[worker];
    if (env[enableFlag] !== "true") {
      throw new Error(`${enableFlag}=true is required to run the production ${label} worker.`);
    }
    return "production";
  }

  if (isStagingRuntime(env)) {
    assertProviderDisabled(worker, env);
    return "staging";
  }

  throw new Error(`The ${label} worker is staging-only unless the exact production runtime and explicit production worker gate are configured.`);
}

export function assertWorkerRuntimeReadiness({
  worker,
  env = process.env,
  argv = process.argv,
}: RuntimePreflightInput): WorkerReadinessResult {
  const runtime = assertWorkerRuntime(worker, env);
  if (!Array.isArray(argv) || !argv.includes(DRY_RUN_FLAG)) {
    throw new Error(DRY_RUN_REQUIREMENT[worker]);
  }
  return { worker, mode: "dry-run", staging: runtime === "staging", providerDisabled: providerDisabledEnabled(env), ready: true };
}

export function assertWorkerRuntimeEnvironment({ worker, env = process.env }: RuntimePreflightInput): void {
  assertWorkerRuntime(worker, env);
}
