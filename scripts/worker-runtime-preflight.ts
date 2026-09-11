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
const DRY_RUN_REQUIREMENT: Record<Worker, string> = {
  post: "The Post worker requires --dry-run.",
  watch: "The Watch worker requires --dry-run.",
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function assertStaging(worker: Worker, env: Record<string, string | undefined>): void {
  if (normalize(env.NODE_ENV) !== "staging" || normalize(env.SOCIALOLLA_ENV) !== "staging") {
    throw new Error(`The ${worker === "post" ? "Post" : "Watch"} worker is staging-only.`);
  }
}

function providerDisabledEnabled(env: Record<string, string | undefined>): boolean {
  return normalize(env.SOCIALOLLA_PROVIDER_DISABLED) !== "false";
}

function assertProviderDisabled(worker: Worker, env: Record<string, string | undefined>): void {
  if (!providerDisabledEnabled(env)) {
    throw new Error(`The ${worker === "post" ? "Post" : "Watch"} worker requires provider-disabled mode.`);
  }
}

const PRECHECKS: Record<Worker, (env: Record<string, string | undefined>) => void> = {
  post: (env) => {
    assertStaging("post", env);
    assertProviderDisabled("post", env);
  },
  watch: (env) => {
    assertStaging("watch", env);
    assertProviderDisabled("watch", env);
  },
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

export function assertWorkerRuntimeEnvironment({ worker, env = process.env }: RuntimePreflightInput): void {
  PRECHECKS[worker](env);
}
