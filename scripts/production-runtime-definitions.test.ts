import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionDirectory = path.join(repositoryRoot, "deploy", "production");

const services = [
  { file: "socialolla-web.service", command: "ExecStart=/usr/bin/env NODE_ENV=production SOCIALOLLA_ENV=production /usr/bin/npm run start" },
  { file: "socialolla-post-worker.service", command: "ExecStart=/usr/bin/env NODE_ENV=production SOCIALOLLA_ENV=production /usr/bin/npm run post-worker:once" },
  { file: "socialolla-watch-worker.service", command: "ExecStart=/usr/bin/env NODE_ENV=production SOCIALOLLA_ENV=production /usr/bin/npm run watch-worker:once" },
];

describe("production runtime definitions", () => {
  it("ships the worker runner as a production dependency for the existing npm commands", async () => {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
    const packageLock = JSON.parse(await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"));

    expect(packageJson.dependencies.tsx).toBe("^4.23.0");
    expect(packageJson.devDependencies.tsx).toBeUndefined();
    expect(packageJson.scripts["post-worker:once"]).toBe("tsx scripts/run-post-worker.ts");
    expect(packageJson.scripts["watch-worker:once"]).toBe("tsx scripts/run-watch-worker.ts");
    expect(packageLock.packages[""].dependencies.tsx).toBe("^4.23.0");
    expect(packageLock.packages[""].devDependencies.tsx).toBeUndefined();
    expect(packageLock.packages["node_modules/tsx"].dev).toBeUndefined();
  });

  it.each(services)("keeps $file versioned-path and environment compatible", async ({ file, command }) => {
    const unit = await readFile(path.join(productionDirectory, file), "utf8");

    expect(unit).toContain("WorkingDirectory=/srv/socialolla/current");
    expect(unit).toContain("EnvironmentFile=/srv/socialolla/shared/production.env");
    expect(unit).toContain("Environment=NODE_ENV=production");
    expect(unit).toContain("Environment=SOCIALOLLA_ENV=production");
    expect(unit).toContain(command);
    expect(unit).not.toMatch(/^ExecStart(?:Pre|Post)?=.*(?:systemctl|prisma migrate|ln -s)/m);
    expect(unit).not.toMatch(/^Environment=.*(?:SECRET|TOKEN|PASSWORD|API_KEY)=\S+/im);
    expect(unit).not.toContain("SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED=true");
    expect(unit).not.toContain("SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED=true");
    expect(unit).not.toMatch(/(?:sk_live_|sq0[a-zA-Z0-9]{8,}|access_token\s*=)/i);
  });

  it("keeps worker timers inert until an operator installs and activates them", async () => {
    const postTimer = await readFile(path.join(productionDirectory, "socialolla-post-worker.timer"), "utf8");
    const watchTimer = await readFile(path.join(productionDirectory, "socialolla-watch-worker.timer"), "utf8");

    expect(postTimer).toContain("Unit=socialolla-post-worker.service");
    expect(watchTimer).toContain("Unit=socialolla-watch-worker.service");
    expect(postTimer).toContain("WantedBy=timers.target");
    expect(watchTimer).toContain("WantedBy=timers.target");
    expect(postTimer + watchTimer).not.toMatch(/^ExecStart=.*(?:systemctl|npm|prisma)/m);
  });

  it("documents the isolated preparation, qualification, cutover, and activation gates", async () => {
    const runbook = await readFile(path.join(repositoryRoot, "docs", "operations", "SOCIALOLLA_PRODUCTION_RUNTIME_BOOTSTRAP.md"), "utf8");

    for (const phase of ["PREPARE", "QUALIFY", "OWNER-AUTHORIZED CUTOVER", "ACTIVATE"]) {
      expect(runbook).toContain(`## ${phase}`);
    }
    expect(runbook).toContain("/srv/socialolla/shared/production.env");
    expect(runbook).toContain("rollbackAvailable=false");
    expect(runbook).toMatch(/TikTok\s+production execution is disabled\./);
    expect(runbook).toContain("Production worker gates are intentionally absent");
    expect(runbook).not.toMatch(/^\s*(?:systemctl\s+(?:start|stop|restart|enable)|npm run db:migrate|ln -s)\b/im);
  });
});
