import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const targets = {
  guard: "src/lib/providers/social/provider-guard.ts",
  router: "src/lib/providers/social/provider-router.ts",
  publishing: "src/lib/socialolla/publishing/provider.ts",
};

const mutations = [
  {
    id: "allow-production-live-provider",
    file: targets.guard,
    mutate: (value) => value.replace('nodeEnvironment === "staging"', 'nodeEnvironment !== "staging"'),
  },
  {
    id: "allow-missing-provider-disabled-flag",
    file: targets.guard,
    mutate: (value) => value.replace('return value !== "false";', 'return value === "false";'),
  },
  {
    id: "allow-non-staging-live-provider",
    file: targets.guard,
    mutate: (value) => value.replace('socialollaEnvironment === "staging"', 'socialollaEnvironment !== "staging"'),
  },
  {
    id: "invert-provider-disabled-default",
    file: targets.router,
    mutate: (value) => value.replace("if (providerDisabledEnabled()) {", "if (!providerDisabledEnabled()) {"),
  },
  {
    id: "remove-router-runtime-boundary",
    file: targets.router,
    mutate: (value) => value.replace('if (!liveSocialAuditRuntimeAllowed()) {', 'if (false) {'),
  },
  {
    id: "allow-publishing-outside-exact-staging",
    file: targets.publishing,
    mutate: (value) => value.replace('env.NODE_ENV?.trim().toLowerCase() === "staging"', 'env.NODE_ENV?.trim().toLowerCase() !== "staging"'),
  },
  {
    id: "allow-publishing-with-disabled-default",
    file: targets.publishing,
    mutate: (value) => value.replace("!providerDisabledEnabled(env)", "providerDisabledEnabled(env)"),
  },
];

const testArgs = [
  "node_modules/vitest/vitest.mjs",
  "run",
  "src/lib/providers/social/provider-router.test.ts",
  "src/lib/socialolla/watch/watch-service.test.ts",
  "src/lib/socialolla/publishing/provider.test.ts",
  "--pool=threads",
  "--maxWorkers=1",
  "--no-file-parallelism",
  "--reporter=dot",
];

const results = [];
for (const mutation of mutations) {
  const targetPath = path.join(root, mutation.file);
  const original = fs.readFileSync(targetPath, "utf8");
  const mutated = mutation.mutate(original);
  if (mutated === original) throw new Error(`Mutation did not apply: ${mutation.id}`);
  try {
    fs.writeFileSync(targetPath, mutated, "utf8");
    const result = spawnSync(process.execPath, testArgs, { cwd: root, encoding: "utf8", timeout: 120000 });
    results.push({ id: mutation.id, result: result.status === 0 ? "SURVIVED" : "KILLED", exitCode: result.status });
  } finally {
    fs.writeFileSync(targetPath, original, "utf8");
  }
}

const killed = results.filter((result) => result.result === "KILLED").length;
const survived = results.filter((result) => result.result === "SURVIVED").length;
console.log(JSON.stringify({ attempted: results.length, killed, survived, results }, null, 2));
if (survived > 0) process.exitCode = 1;
