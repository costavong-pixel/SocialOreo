import { describe, expect, it } from "vitest";

import { assertWorkerRuntimeEnvironment, assertWorkerRuntimeReadiness } from "./worker-runtime-preflight";

type Worker = "post" | "watch";

const workers: Worker[] = ["post", "watch"];

function enableFlag(worker: Worker): string {
  return `SOCIALOLLA_PRODUCTION_${worker.toUpperCase()}_WORKER_ENABLED`;
}

function productionEnv(worker: Worker, overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    SOCIALOLLA_ENV: "production",
    SOCIALOLLA_PROVIDER_DISABLED: "true",
    [enableFlag(worker)]: "true",
    ...overrides,
  };
}

describe("worker runtime production gates", () => {
  it.each(workers)("rejects production %s when its explicit worker gate is missing", (worker) => {
    const env = productionEnv(worker);
    delete env[enableFlag(worker)];

    expect(() => assertWorkerRuntimeEnvironment({ worker, env })).toThrow(enableFlag(worker));
  });

  it.each(workers)("accepts production %s only with its exact worker gate", (worker) => {
    expect(() => assertWorkerRuntimeEnvironment({ worker, env: productionEnv(worker) })).not.toThrow();
  });

  it.each([undefined, "", "TRUE", "True", " true", "true ", "1", "yes", "false"])(
    "keeps malformed production Post worker flag %j disabled",
    (flag) => {
      expect(() => assertWorkerRuntimeEnvironment({
        worker: "post",
        env: productionEnv("post", { [enableFlag("post")]: flag }),
      })).toThrow(enableFlag("post"));
    },
  );

  it.each([undefined, "", "TRUE", "True", " true", "true ", "1", "yes", "false"])(
    "keeps malformed production Watch worker flag %j disabled",
    (flag) => {
      expect(() => assertWorkerRuntimeEnvironment({
        worker: "watch",
        env: productionEnv("watch", { [enableFlag("watch")]: flag }),
      })).toThrow(enableFlag("watch"));
    },
  );

  it.each([
    { NODE_ENV: undefined },
    { SOCIALOLLA_ENV: undefined },
    { NODE_ENV: "Production" },
    { NODE_ENV: "production " },
    { SOCIALOLLA_ENV: "Production" },
    { SOCIALOLLA_ENV: " production" },
    { NODE_ENV: "development" },
    { SOCIALOLLA_ENV: "staging" },
  ])("rejects production Post with a missing or non-exact environment: %j", (overrides) => {
    expect(() => assertWorkerRuntimeEnvironment({ worker: "post", env: productionEnv("post", overrides) }))
      .toThrow("staging-only");
  });

  it.each(workers)("does not let a provider gate replace the production %s worker gate", (worker) => {
    const overrides = worker === "post"
      ? { SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true", SOCIALOLLA_PROVIDER_DISABLED: "false" }
      : { SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED: "true", SOCIALOLLA_PROVIDER_DISABLED: "false" };
    const env = productionEnv(worker, overrides);
    delete env[enableFlag(worker)];

    expect(() => assertWorkerRuntimeEnvironment({ worker, env })).toThrow(enableFlag(worker));
  });

  it("preserves provider-disabled staging readiness without requiring production flags", () => {
    const env = { NODE_ENV: " STAGING ", SOCIALOLLA_ENV: "staging", SOCIALOLLA_PROVIDER_DISABLED: "true" };

    expect(() => assertWorkerRuntimeEnvironment({ worker: "post", env })).not.toThrow();
    expect(assertWorkerRuntimeReadiness({ worker: "watch", env, argv: ["node", "worker", "--dry-run"] })).toEqual({
      worker: "watch",
      mode: "dry-run",
      staging: true,
      providerDisabled: true,
      ready: true,
    });
  });

  it("continues to require provider-disabled staging mode", () => {
    expect(() => assertWorkerRuntimeEnvironment({ worker: "watch", env: {
      NODE_ENV: "staging",
      SOCIALOLLA_ENV: "staging",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    } })).toThrow("provider-disabled");
  });

  it("allows production dry-run readiness only after the worker gate and without starting an engine", () => {
    expect(assertWorkerRuntimeReadiness({
      worker: "post",
      env: productionEnv("post"),
      argv: ["node", "worker", "--dry-run"],
    })).toEqual({
      worker: "post",
      mode: "dry-run",
      staging: false,
      providerDisabled: true,
      ready: true,
    });
  });

  it("rejects an unknown runtime even when a worker gate is present", () => {
    expect(() => assertWorkerRuntimeEnvironment({
      worker: "watch",
      env: { NODE_ENV: "test", SOCIALOLLA_ENV: "test", [enableFlag("watch")]: "true" },
    })).toThrow("staging-only");
  });
});
