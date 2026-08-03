import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Portable Content Factory v1 contract fixture (Milestone 1).
 *
 * A self-contained node:http server that implements the exact /internal/v1
 * request/response/authentication behavior of the real Content Factory
 * internal API, so the SocialOreo TypeScript client can be contract-tested in
 * protected CI with zero external dependencies (no other repo, no venv, no
 * /tmp paths, no network to a deployed service).
 *
 * Behavior mirrored from feed/internal_api.py:
 * - credential: constant-time Bearer compare against INTERNAL_API_SECRET;
 * - caller service must be "socialoreo";
 * - state-changing endpoints require an HMAC-SHA256 signature over
 *   `method\npath\ntimestamp\nnonce\nidempotencyKey\nsha256(body)` with a
 *   300s freshness window and durable nonce replay protection;
 * - idempotency: (workspace, key) returns the prior request;
 * - workspace scoping on GET/review/cancel;
 * - opaque ref validation (wsp_/dst_/prf_/req_ prefixes);
 * - provider-disabled deterministic staged candidates.
 */

export const FRESHNESS_SECONDS = 300;
export const MAX_RETRIES_FOR_CI = 2;

interface StagedRequest {
  external_id: string;
  workspace_external_id: string;
  destination_ref: string;
  profile_ref: string | null;
  language: string;
  requested_count: number;
  status: string;
  candidates_json: unknown[];
  review_json: unknown;
  evidence_json: unknown[];
  created_at: string;
  updated_at: string;
}

const EXTERNAL_ID_RE = /^(wsp|dst|prf|req)_[A-Za-z0-9_-]{6,128}$/;
const IDEMPOTENCY_RE = /^so:[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)*$/;

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stagedCandidates(externalId: string, count: number, language: string): unknown[] {
  const seed = sha256(externalId);
  return Array.from({ length: Math.min(count, 10) }).map((_, index) => ({
    candidate_key: `staged-${index}-${seed.slice((index * 2) % 16, (index * 2) % 16 + 6)}`,
    draft: `Draft ${index + 1} for destination in ${language} (provider-disabled staging)`,
    status: "review",
  }));
}

export interface ContractFixtureOptions {
  apiSecret: string;
  dataReachable?: boolean;
}

export class ContentFactoryContractFixture {
  readonly server: Server;
  baseUrl = "";
  private readonly requests = new Map<string, StagedRequest>();
  private readonly idempotency = new Map<string, string>();
  private readonly nonces = new Set<string>();
  private readonly sockets = new Set<import("node:net").Socket>();
  private readonly apiSecret: string;

  constructor(options: ContractFixtureOptions, port = 0) {
    this.apiSecret = options.apiSecret;
    this.server = createServer((req, res) => this.handle(req, res));
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
    });
    this.server.listen(port, "127.0.0.1");
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.once("listening", () => resolve()));
    const info = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${info.port}`;
    return this.baseUrl;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      // If the server is already closed, the callback above never fires.
      if (!this.server.listening) resolve();
    });
  }

  private async readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  }

  private verifyCredential(req: IncomingMessage): boolean {
    const authorization = req.headers["authorization"] as string | undefined;
    const service = req.headers["x-socialolla-service"] as string | undefined;
    if (service !== "socialoreo") return false;
    if (!authorization || !authorization.startsWith("Bearer ")) return false;
    return constantTimeEqual(authorization.slice("Bearer ".length), this.apiSecret);
  }

  private verifySignature(req: IncomingMessage, body: Buffer, idempotencyKey: string | null): boolean {
    const timestamp = req.headers["x-socialolla-timestamp"] as string | undefined;
    const nonce = req.headers["x-socialolla-nonce"] as string | undefined;
    const signature = req.headers["x-socialolla-signature"] as string | undefined;
    if (!timestamp || !nonce || !signature) return false;
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() / 1000 - ts) > FRESHNESS_SECONDS) return false;
    if (this.nonces.has(nonce)) return false; // replay rejection
    const canonical = [req.method, req.url?.split("?")[0], timestamp, nonce, idempotencyKey ?? "", sha256(body.toString("utf8"))].join("\n");
    const expected = createHmac("sha256", this.apiSecret).update(canonical).digest("hex");
    if (!constantTimeEqual(signature, expected)) return false;
    this.nonces.add(nonce);
    return true;
  }

  private parseQuery(url: string): URLSearchParams {
    return new URL(url, "http://fixture").searchParams;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url?.split("?")[0] ?? "/";
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/internal/v1/health") {
      if (!this.verifyCredential(req)) return this.send(res, 401, { status: "invalid credential" });
      return this.send(res, 200, { status: "ok", contract: "v1", data_reachable: true });
    }

    if (method === "GET" && path === "/internal/v1/requests") {
      if (!this.verifyCredential(req)) return this.send(res, 401, { detail: "Invalid service credential." });
      const workspace = this.parseQuery(req.url!).get("workspace_external_id") ?? "";
      if (!EXTERNAL_ID_RE.test(workspace)) return this.send(res, 400, { detail: "Invalid workspace_external_id." });
      const rows = [...this.requests.values()].filter((r) => r.workspace_external_id === workspace);
      return this.send(res, 200, { requests: rows, limit: 50 });
    }

    const getById = path.match(/^\/internal\/v1\/requests\/([^/]+)$/);
    if (method === "GET" && getById) {
      if (!this.verifyCredential(req)) return this.send(res, 401, { detail: "Invalid service credential." });
      const workspace = this.parseQuery(req.url!).get("workspace_external_id") ?? "";
      const row = this.requests.get(getById[1]);
      if (!row || row.workspace_external_id !== workspace) return this.send(res, 404, { detail: "Request not found." });
      return this.send(res, 200, row);
    }

    if (method === "POST" && path === "/internal/v1/requests") {
      if (!this.verifyCredential(req)) return this.send(res, 401, { detail: "Invalid service credential." });
      const body = await this.readBody(req);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        return this.send(res, 400, { detail: "Invalid JSON body." });
      }
      const idempotencyKey = String(payload.idempotency_key ?? "");
      const workspace = String(payload.workspace_external_id ?? "");
      const destinationRef = String(payload.destination_ref ?? "");
      const profileRef = payload.profile_ref == null ? null : String(payload.profile_ref);
      if (!IDEMPOTENCY_RE.test(idempotencyKey)) return this.send(res, 400, { detail: "Invalid idempotency key." });
      if (!EXTERNAL_ID_RE.test(workspace)) return this.send(res, 400, { detail: "Invalid workspace_external_id." });
      if (!EXTERNAL_ID_RE.test(destinationRef)) return this.send(res, 400, { detail: "Invalid destination_ref." });
      if (profileRef !== null && !EXTERNAL_ID_RE.test(profileRef)) return this.send(res, 400, { detail: "Invalid profile_ref." });
      if (!this.verifySignature(req, body, idempotencyKey)) return this.send(res, 401, { detail: "Invalid request signature." });

      const key = `${workspace}:${idempotencyKey}`;
      const existingId = this.idempotency.get(key);
      if (existingId) {
        return this.send(res, 200, this.requests.get(existingId));
      }
      const externalId = `req_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
      const created = new Date().toISOString();
      const requestedCount = Math.max(1, Math.min(Number(payload.requested_count ?? 10), 100));
      const row: StagedRequest = {
        external_id: externalId,
        workspace_external_id: workspace,
        destination_ref: destinationRef,
        profile_ref: profileRef,
        language: String(payload.language ?? "en"),
        requested_count: requestedCount,
        status: "review",
        candidates_json: stagedCandidates(externalId, requestedCount, String(payload.language ?? "en")),
        review_json: null,
        evidence_json: [],
        created_at: created,
        updated_at: created,
      };
      this.requests.set(externalId, row);
      this.idempotency.set(key, externalId);
      return this.send(res, 200, row);
    }

    const reviewPath = path.match(/^\/internal\/v1\/requests\/([^/]+)\/review$/);
    if (method === "POST" && reviewPath) {
      if (!this.verifyCredential(req)) return this.send(res, 401, { detail: "Invalid service credential." });
      const workspace = this.parseQuery(req.url!).get("workspace_external_id") ?? "";
      const body = await this.readBody(req);
      if (!this.verifySignature(req, body, null)) return this.send(res, 401, { detail: "Invalid request signature." });
      const row = this.requests.get(reviewPath[1]);
      if (!row || row.workspace_external_id !== workspace) return this.send(res, 404, { detail: "Request not found." });
      row.status = "approved";
      row.updated_at = new Date().toISOString();
      return this.send(res, 200, { external_id: row.external_id, status: "approved" });
    }

    const cancelPath = path.match(/^\/internal\/v1\/requests\/([^/]+)\/cancel$/);
    if (method === "POST" && cancelPath) {
      if (!this.verifyCredential(req)) return this.send(res, 401, { detail: "Invalid service credential." });
      const workspace = this.parseQuery(req.url!).get("workspace_external_id") ?? "";
      const body = await this.readBody(req);
      if (!this.verifySignature(req, body, null)) return this.send(res, 401, { detail: "Invalid request signature." });
      const row = this.requests.get(cancelPath[1]);
      if (!row || row.workspace_external_id !== workspace) return this.send(res, 404, { detail: "Request not found." });
      row.status = "cancelled";
      row.updated_at = new Date().toISOString();
      return this.send(res, 200, { external_id: row.external_id, status: "cancelled" });
    }

    return this.send(res, 404, { detail: "Not found." });
  }
}

export { constantTimeEqual, sha256 };
