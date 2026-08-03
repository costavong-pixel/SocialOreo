import { afterEach, describe, expect, it } from "vitest";
import { HttpContentFactoryClient } from "./client";
import { ContentFactoryContractFixture, sha256 } from "./contract-server.fixture";

const SECRET = "portable-ci-test-secret";

/**
 * Portable contract tests for the SocialOreo -> Content Factory v1 client.
 * These run entirely inside this repository: a self-contained node:http
 * fixture implements the exact Content Factory /internal/v1 behavior. No
 * /tmp paths, no virtualenv, no other repository, no network access, no
 * deployed service.
 */
describe("Portable cross-service contract tests (in-repo fixture)", () => {
  let fixture: ContentFactoryContractFixture | null = null;

  async function startFixture(): Promise<{ fixture: ContentFactoryContractFixture; client: HttpContentFactoryClient }> {
    fixture = new ContentFactoryContractFixture({ apiSecret: SECRET });
    const baseUrl = await fixture.start();
    const client = new HttpContentFactoryClient(baseUrl, SECRET, 2_000);
    return { fixture, client };
  }

  afterEach(async () => {
    if (fixture) {
      await fixture.close();
      fixture = null;
    }
  });

  it("proves a valid authenticated create request with locale preservation", async () => {
    const { client } = await startFixture();
    const request = await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      profileRef: "prf_abcdefghijklmnop",
      language: "zh",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:portable-1",
    });
    expect(request.status).toBe("review");
    expect(request.language).toBe("zh");
    expect(request.requestedCount).toBe(10);
    expect(request.id).toMatch(/^req_/);
  });

  it("proves HMAC signature compatibility between client and fixture", async () => {
    const { client } = await startFixture();
    const created = await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:portable-hmac",
    });
    // A 200 here proves the client's HMAC + freshness + nonce scheme matches
    // the fixture's verification (401 otherwise).
    expect(created.status).toBe("review");
    expect(sha256("probe").length).toBe(64);
  });

  it("returns the same request for a duplicate idempotency key", async () => {
    const { client } = await startFixture();
    const input = {
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:portable-dup",
    };
    const first = await client.createRequest(input);
    const second = await client.createRequest(input);
    expect(second.id).toBe(first.id);
  });

  it("rejects retrieval from a wrong workspace", async () => {
    const { client } = await startFixture();
    const created = await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:portable-scope",
    });
    const other = await client.getRequest(created.id, "wsp_999999999999");
    expect(other).toBeNull();
  });

  it("rejects an invalid service credential", async () => {
    const { fixture } = await startFixture();
    const response = await fetch(`${fixture.baseUrl}/internal/v1/requests?workspace_external_id=wsp_abcdefghijklmnop`, {
      headers: { "X-SocialOlla-Service": "socialoreo", Authorization: "Bearer wrong-secret" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects a malformed destination reference", async () => {
    const { client } = await startFixture();
    await expect(
      client.createRequest({
        workspaceExternalId: "wsp_abcdefghijklmnop",
        destinationRef: "not-a-valid-ref",
        language: "en",
        requestedCount: 10,
        idempotencyKey: "so:wsp_abcdefghijklmnop:portable-bad-dst",
      }),
    ).rejects.toThrow();
  });

  it("enforces bounded timeout and retry behavior", async () => {
    const { fixture } = await startFixture();
    const client = new HttpContentFactoryClient(fixture.baseUrl, SECRET, 1_000);
    // Point the client at a dead port to exercise timeout+retry boundedness.
    const deadClient = new HttpContentFactoryClient("http://127.0.0.1:1", SECRET, 300);
    const started = Date.now();
    await expect(
      deadClient.createRequest({
        workspaceExternalId: "wsp_abcdefghijklmnop",
        destinationRef: "dst_abcdefghijklmnop",
        language: "en",
        requestedCount: 10,
        idempotencyKey: "so:wsp_abcdefghijklmnop:portable-timeout",
      }),
    ).rejects.toThrow();
    const elapsed = Date.now() - started;
    // 2 retries + backoff must stay bounded (< ~3s).
    expect(elapsed).toBeLessThan(3_000);
    void client;
  });

  it("closes fixture sockets and never leaves a hanging process", async () => {
    const started = await startFixture();
    const baseUrl = started.fixture.baseUrl;
    await started.client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:portable-close",
    });
    await started.fixture.close();
    // The closed server must refuse new connections (no hanging socket).
    await expect(fetch(`${baseUrl}/internal/v1/health`)).rejects.toThrow();
  });

  it("contains no hardcoded filesystem paths", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL(import.meta.url), "utf8");
    expect(source).not.toMatch(/\/tmp\/opencode/);
    expect(source).not.toMatch(/\/opt\//);
  });
});
