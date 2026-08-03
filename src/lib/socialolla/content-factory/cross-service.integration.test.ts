import { describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const CF_REPO = "/tmp/opencode/cf-m1";
const CF_VENV_PY = "/tmp/opencode/cf-venv/bin/python";
const CF_SECRET = "cross-service-test-secret";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address() as net.AddressInfo;
      const port = address.port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(`${url}/internal/v1/health`);
        if (response.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("Content Factory did not become healthy"));
      setTimeout(tick, 300);
    };
    void tick();
  });
}

async function startContentFactory(): Promise<{ proc: ChildProcess; baseUrl: string; tmpdir: string }> {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "so-cf-itest-"));
  const dbPath = path.join(tmpdir, "posts.db");
  fs.writeFileSync(
    path.join(tmpdir, "seed.py"),
    `import sqlite3; c=sqlite3.connect("${dbPath}"); c.execute("CREATE TABLE IF NOT EXISTS brands (id TEXT PRIMARY KEY, name TEXT)"); c.execute("INSERT OR IGNORE INTO brands (id,name) VALUES ('b1','test-brand')"); c.commit(); c.close();`,
  );
  await new Promise<void>((resolve, reject) => {
    const seed = spawn(CF_VENV_PY, [path.join(tmpdir, "seed.py")], { stdio: "ignore" });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed failed ${code}`))));
  });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(
    CF_VENV_PY,
    ["-m", "uvicorn", "feed.rss_server:app", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: CF_REPO,
      env: {
        ...process.env,
        INTERNAL_API_SECRET: CF_SECRET,
        POSTS_DB: dbPath,
        PYTHONPATH: CF_REPO,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  proc.stdout?.on("data", (d) => (logs += String(d)));
  proc.stderr?.on("data", (d) => (logs += String(d)));
  try {
    await waitForHealth(baseUrl, 30_000);
  } catch (error) {
    proc.kill("SIGKILL");
    throw new Error(`Content Factory failed to start:\n${logs}`);
  }
  return { proc, baseUrl, tmpdir };
}

async function withContentFactory(fn: (ctx: { baseUrl: string }) => Promise<void>): Promise<void> {
  const ctx = await startContentFactory();
  try {
    await fn(ctx);
  } finally {
    ctx.proc.kill("SIGTERM");
    fs.rmSync(ctx.tmpdir, { recursive: true, force: true });
  }
}

describe("Cross-service integration — SocialOreo client -> Content Factory /internal/v1", () => {
  it(
    "routes a valid authenticated request, preserves locale, and stays idempotent",
    async () => {
      await withContentFactory(async ({ baseUrl }) => {
        const { HttpContentFactoryClient } = await import("./client");
        const client = new HttpContentFactoryClient(baseUrl, CF_SECRET);

        const created = await client.createRequest({
          workspaceExternalId: "wsp_abcdefghijklmnop",
          destinationRef: "dst_abcdefghijklmnop",
          profileRef: "prf_abcdefghijklmnop",
          language: "zh",
          requestedCount: 10,
          idempotencyKey: "so:wsp_abcdefghijklmnop:itest-first",
        });
        expect(created.status).toBe("review");
        expect(created.language).toBe("zh");
        expect(created.requestedCount).toBe(10);

        // Duplicate request returns the same id (no double job).
        const duplicate = await client.createRequest({
          workspaceExternalId: "wsp_abcdefghijklmnop",
          destinationRef: "dst_abcdefghijklmnop",
          profileRef: "prf_abcdefghijklmnop",
          language: "zh",
          requestedCount: 10,
          idempotencyKey: "so:wsp_abcdefghijklmnop:itest-first",
        });
        expect(duplicate.id).toBe(created.id);

        // Wrong workspace cannot read the request (isolation).
        const otherWorkspace = await client.getRequest(created.id, "wsp_999999999999");
        expect(otherWorkspace).toBeNull();
      });
    },
    90_000,
  );

  it(
    "rejects an invalid service identity",
    async () => {
      await withContentFactory(async ({ baseUrl }) => {
        const response = await fetch(`${baseUrl}/internal/v1/requests?workspace_external_id=wsp_abcdefghijklmnop`, {
          headers: { "X-SocialOlla-Service": "socialoreo", Authorization: `Bearer wrong-secret` },
        });
        expect(response.status).toBe(401);
      });
    },
    90_000,
  );

  it(
    "rejects a request with a wrong destination ref",
    async () => {
      await withContentFactory(async ({ baseUrl }) => {
        const { HttpContentFactoryClient } = await import("./client");
        const client = new HttpContentFactoryClient(baseUrl, CF_SECRET);
        await expect(
          client.createRequest({
            workspaceExternalId: "wsp_abcdefghijklmnop",
            destinationRef: "not-a-valid-ref",
            language: "en",
            requestedCount: 10,
            idempotencyKey: "so:wsp_abcdefghijklmnop:itest-bad-dst",
          }),
        ).rejects.toThrow();
      });
    },
    90_000,
  );
});
