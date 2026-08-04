/**
 * SocialOlla cross-repository staging acceptance (EXTERNAL).
 *
 * Runs the REAL SocialOreo TypeScript client against the REAL Content Factory
 * FastAPI internal API using the exact remote milestone heads.
 *
 * This is NOT part of protected CI. It requires a Content Factory checkout and
 * a Python interpreter with the project dependencies installed. Configure via:
 *
 *   SOCIALOLLA_CF_REPO   path to a Content Factory checkout at the milestone head
 *   SOCIALOLLA_CF_PYTHON python interpreter with Content Factory deps (uvicorn)
 *   SOCIALOLLA_CF_HEAD   the exact Content Factory milestone head SHA to verify
 *
 * It fails fast with a clear preflight error when any required value is
 * missing, and never hangs longer than the bounded timeout.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const required = ["SOCIALOLLA_CF_REPO", "SOCIALOLLA_CF_PYTHON", "SOCIALOLLA_CF_HEAD"] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`PREFLIGHT FAILURE: missing required environment variables: ${missing.join(", ")}`);
  console.error("This external acceptance test is not part of protected CI.");
  console.error("Set SOCIALOLLA_CF_REPO, SOCIALOLLA_CF_PYTHON, SOCIALOLLA_CF_HEAD and re-run.");
  process.exit(2);
}

const CF_REPO = process.env.SOCIALOLLA_CF_REPO!;
const CF_PYTHON = process.env.SOCIALOLLA_CF_PYTHON!;
const CF_HEAD = process.env.SOCIALOLLA_CF_HEAD!;
const CF_SECRET = process.env.SOCIALOLLA_CF_SECRET ?? "external-acceptance-secret";
const START_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 90_000;

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/internal/v1/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`Content Factory did not become healthy within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(CF_REPO, "feed", "internal_api.py"))) {
    console.error(`PREFLIGHT FAILURE: ${CF_REPO} is not a Content Factory checkout (feed/internal_api.py missing).`);
    process.exit(2);
  }

  const actualHead = spawn("git", ["-C", CF_REPO, "rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] });
  const headOut = await new Promise<string>((resolve, reject) => {
    let out = "";
    actualHead.stdout.on("data", (d) => (out += String(d)));
    actualHead.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error("could not read CF HEAD"))));
  });
  if (headOut !== CF_HEAD) {
    console.error(`PREFLIGHT FAILURE: CF checkout HEAD ${headOut} does not match expected ${CF_HEAD}.`);
    process.exit(2);
  }

  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "so-cf-accept-"));
  const dbPath = path.join(tmpdir, "posts.db");
  const seedScript = path.join(tmpdir, "seed.py");
  fs.writeFileSync(
    seedScript,
    `import sqlite3; c=sqlite3.connect(${JSON.stringify(dbPath)}); c.execute("CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, name TEXT)"); c.execute("INSERT OR IGNORE INTO brands (id,name) VALUES ('b1','test-brand')"); c.commit(); c.close();`,
  );
  await new Promise<void>((resolve, reject) => {
    const seed = spawn(CF_PYTHON, [seedScript], { stdio: "ignore" });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed failed ${code}`))));
  });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(CF_PYTHON, ["-m", "uvicorn", "feed.rss_server:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: CF_REPO,
    env: { ...process.env, INTERNAL_API_SECRET: CF_SECRET, POSTS_DB: dbPath, PYTHONPATH: CF_REPO },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  proc.stdout?.on("data", (d) => (logs += String(d)));
  proc.stderr?.on("data", (d) => (logs += String(d)));

  const timer = setTimeout(() => {
    proc.kill("SIGKILL");
    fs.rmSync(tmpdir, { recursive: true, force: true });
    console.error("EXTERNAL ACCEPTANCE TIMEOUT");
    process.exit(3);
  }, RUN_TIMEOUT_MS);

  try {
    await waitForHealth(baseUrl, START_TIMEOUT_MS);
  } catch (error) {
    clearTimeout(timer);
    proc.kill("SIGKILL");
    console.error(`STARTUP FAILURE:\n${logs}`);
    process.exit(3);
  }

  // Run the client assertions through tsx (the SocialOreo repo tooling).
  const assertions = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "socialolla-acceptance-run.mts");
  const runner = spawn("npx", ["tsx", assertions], {
    env: { ...process.env, SOCIALOLLA_CF_BASE_URL: baseUrl, SOCIALOLLA_CF_SECRET: CF_SECRET },
    stdio: ["inherit", "pipe", "pipe"],
  });
  let runnerLog = "";
  runner.stdout?.on("data", (d) => (runnerLog += String(d)));
  runner.stderr?.on("data", (d) => (runnerLog += String(d)));
  const code = await new Promise<number>((resolve) => runner.on("exit", (c) => resolve(c ?? 1)));
  clearTimeout(timer);
  proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  proc.kill("SIGKILL");
  fs.rmSync(tmpdir, { recursive: true, force: true });

  if (code !== 0) {
    console.error(`ACCEPTANCE RUNNER FAILED (exit ${code}):\n${runnerLog}`);
    process.exit(code);
  }
  console.log("EXTERNAL CROSS-REPOSITORY STAGING ACCEPTANCE PASSED");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
