import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const target = "src/lib/auth/staging-acceptance.ts";
const targetPath = path.join(root, target);
const original = fs.readFileSync(targetPath, "utf8");

const mutations = [
  {
    id: "node-production-boundary",
    mutate: (value) => value.replace('configuredValue(env, "NODE_ENV").toLowerCase() === "production"', 'configuredValue(env, "NODE_ENV").toLowerCase() !== "production"'),
  },
  {
    id: "staging-environment-boundary",
    mutate: (value) => value.replace("configuredEnvironment === STAGING_ENVIRONMENT", "configuredEnvironment === \"production\""),
  },
  {
    id: "staging-origin-boundary",
    mutate: (value) => value.replace("configuredOrigin === STAGING_ORIGIN", "true"),
  },
  {
    id: "exact-true-flag",
    mutate: (value) => value.replace('configuredValue(env, "SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS") !== "true"', 'configuredValue(env, "SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS") === "true"'),
  },
  {
    id: "explicit-email-allowlist",
    mutate: (value) => value.replace("return stagingAcceptanceAllowlist(env).has(normalizeStagingAcceptanceEmail(email));", "return true;"),
  },
  {
    id: "verified-session-exclusion",
    mutate: (value) => value.replace("if (session.emailVerified || !authUserId || !email || !isStagingAcceptanceConfigured", "if (!session.emailVerified && !authUserId || !email || !isStagingAcceptanceConfigured"),
  },
  {
    id: "admin-role-exclusion",
    mutate: (value) => value.replace("existingUser.role === UserRole.ADMIN", "existingUser.role === UserRole.USER"),
  },
  {
    id: "email-collision-exclusion",
    mutate: (value) => value.replace('if (emailOwner) return { status: "blocked", reason: "identity-conflict" } as const;\n\n        const created', 'if (false) return { status: "blocked", reason: "identity-conflict" } as const;\n\n        const created'),
  },
  {
    id: "user-role-isolation",
    mutate: (value) => value.replace("role: UserRole.USER", "role: UserRole.ADMIN"),
  },
  {
    id: "audit-subject-binding",
    mutate: (value) => value.replace("actorAuthUserId: authUserId", "actorAuthUserId: email"),
  },
];

const results = [];
try {
  for (const mutation of mutations) {
    const mutated = mutation.mutate(original);
    if (mutated === original) throw new Error(`Mutation did not apply: ${mutation.id}`);
    fs.writeFileSync(targetPath, mutated, "utf8");
    const result = spawnSync(process.execPath, [
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/lib/auth/staging-acceptance.test.ts",
      "--pool=threads",
      "--maxWorkers=1",
      "--no-file-parallelism",
      "--reporter=dot",
    ], { cwd: root, encoding: "utf8", timeout: 120000 });
    results.push({
      id: mutation.id,
      result: result.status === 0 ? "SURVIVED" : "KILLED",
      exitCode: result.status,
      stderr: (result.stderr || "").slice(-1000),
    });
    fs.writeFileSync(targetPath, original, "utf8");
  }
} finally {
  fs.writeFileSync(targetPath, original, "utf8");
}

const killed = results.filter((result) => result.result === "KILLED").length;
const survived = results.filter((result) => result.result === "SURVIVED").length;
console.log(JSON.stringify({ attempted: results.length, killed, survived, results }, null, 2));
if (survived > 0) process.exitCode = 1;
