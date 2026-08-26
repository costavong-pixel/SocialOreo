import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const targets = {
  scheduled: "src/lib/socialolla/watch/scheduled-watch.ts",
  service: "src/lib/socialolla/watch/watch-service.ts",
};

const mutations = [
  {
    id: "remove-staging-worker-guard",
    file: targets.scheduled,
    mutate: (value) => value.replace('if (nodeEnvironment !== "staging" || appEnvironment !== "staging")', "if (false)"),
  },
  {
    id: "remove-scheduled-confirmation",
    file: targets.scheduled,
    mutate: (value) => value.replace('if (!input.confirmed) throw new Error("Protected action requires exact confirmation");', "if (false) throw new Error(\"Protected action requires exact confirmation\");"),
  },
  {
    id: "remove-claim-renewal",
    file: targets.scheduled,
    mutate: (value) => value.replaceAll('if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");', "if (false) return skipped(report, \"Watch capture lease was lost.\");"),
  },
  {
    id: "remove-scheduled-payload-sanitizer",
    file: targets.scheduled,
    mutate: (value) => value.replace(
      "auditData = sanitizeSocialAuditResult(await fetchSocialAudit(platform(report.platform) as SocialPlatform, { url: report.profileUrl, limit: monitor.reelLimit }));",
      "auditData = await fetchSocialAudit(platform(report.platform) as SocialPlatform, { url: report.profileUrl, limit: monitor.reelLimit });",
    ),
  },
  {
    id: "remove-one-off-payload-sanitizer",
    file: targets.service,
    mutate: (value) => value.replace(
      "const analysis = sanitizeSocialAuditResult(await fetchSocialAudit(input.platform, { url: profileUrl, limit: 30 }));",
      "const analysis = await fetchSocialAudit(input.platform, { url: profileUrl, limit: 30 });",
    ),
  },
  {
    id: "use-owner-wide-entitlement",
    file: targets.service,
    mutate: (value) => value.replaceAll("where: { workspaceId: workspace.dbId }", "where: { workspace: { ownerUserId: input.authUserId } }"),
  },
  {
    id: "skip-credit-finalization",
    file: targets.service,
    mutate: (value) => value.replace(
      "await finalizeCredits({ amount: cost, reference, intent, actorAuthUserId: input.authUserId });",
      "await Promise.resolve();",
    ),
  },
  {
    id: "remove-safe-report-projection",
    file: targets.service,
    mutate: (value) => value.replace(
      `select: {
        id: true,
        externalId: true,
        profileUrl: true,
        platform: true,
        status: true,
        provider: true,
        creditCost: true,
        createdAt: true,
        completedAt: true,
      },`,
      "select: { reportJson: true },",
    ),
  },
];

const testArgs = [
  "node_modules/vitest/vitest.mjs",
  "run",
  "src/lib/socialolla/watch/scheduled-watch.test.ts",
  "src/lib/socialolla/watch/watch-service.test.ts",
  "--pool=threads",
  "--maxWorkers=1",
  "--no-file-parallelism",
  "--reporter=dot",
];

const results = [];
const originals = new Map();
for (const file of new Set(Object.values(targets))) {
  originals.set(file, fs.readFileSync(path.join(root, file), "utf8"));
}

try {
  for (const mutation of mutations) {
    const targetPath = path.join(root, mutation.file);
    const original = originals.get(mutation.file);
    if (original === undefined) throw new Error(`Missing source: ${mutation.file}`);
    const mutated = mutation.mutate(original);
    if (mutated === original) throw new Error(`Mutation did not apply: ${mutation.id}`);
    try {
      fs.writeFileSync(targetPath, mutated, "utf8");
      const result = spawnSync(process.execPath, testArgs, { cwd: root, encoding: "utf8", timeout: 180000 });
      results.push({ id: mutation.id, result: result.status === 0 ? "SURVIVED" : "KILLED", exitCode: result.status });
    } finally {
      fs.writeFileSync(targetPath, original, "utf8");
    }
  }
} finally {
  for (const [file, original] of originals) {
    fs.writeFileSync(path.join(root, file), original, "utf8");
  }
}

const killed = results.filter((result) => result.result === "KILLED").length;
const survived = results.filter((result) => result.result === "SURVIVED").length;
console.log(JSON.stringify({ attempted: results.length, killed, survived, results }, null, 2));
if (survived > 0) process.exitCode = 1;
