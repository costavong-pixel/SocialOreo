import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  postStatusSchema,
  type PostRequestContract,
  type PostStatus,
} from "@/lib/socialolla/contracts";
import { contentFactoryConfig } from "./config";

export interface CreatePostRequestInput {
  workspaceExternalId: string;
  destinationRef: string;
  profileRef?: string;
  language: string;
  requestedCount: number;
  idempotencyKey: string;
}

export interface StagedCandidate {
  candidate_key: string;
  draft: string;
  status: string;
}

interface InternalApiRequestRow {
  external_id: string;
  workspace_external_id: string;
  destination_ref: string;
  profile_ref: string | null;
  language: string;
  requested_count: number;
  status: string;
  candidates_json: StagedCandidate[];
  review_json: unknown;
  evidence_json: unknown[];
  created_at: string;
  updated_at: string;
}

/**
 * Provider-disabled deterministic stub that mirrors the Content Factory
 * /internal/v1 contract. Returns the same idempotent staged results the real
 * service would, so the customer shell integration is testable end to end
 * without any live provider.
 */
class StubContentFactoryClient {
  private readonly store = new Map<string, InternalApiRequestRow>();

  async createRequest(input: CreatePostRequestInput): Promise<PostRequestContract> {
    const row = this.store.get(input.idempotencyKey);
    if (row) {
      return this.toContract(row);
    }
    const externalId = `req_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
    const candidates: StagedCandidate[] = Array.from({ length: Math.min(input.requestedCount, 10) }).map(
      (_, index) => ({
        candidate_key: `staged-${index}-${externalId.slice(0, 6)}`,
        draft: `Draft ${index + 1} for destination in ${input.language} (provider-disabled staging)`,
        status: "review",
      }),
    );
    const created = new Date().toISOString();
    const rowData: InternalApiRequestRow = {
      external_id: externalId,
      workspace_external_id: input.workspaceExternalId,
      destination_ref: input.destinationRef,
      profile_ref: input.profileRef ?? null,
      language: input.language,
      requested_count: input.requestedCount,
      status: "review",
      candidates_json: candidates,
      review_json: null,
      evidence_json: [],
      created_at: created,
      updated_at: created,
    };
    this.store.set(input.idempotencyKey, rowData);
    return this.toContract(rowData);
  }

  async getRequest(id: string, workspaceExternalId: string): Promise<PostRequestContract | null> {
    const row = [...this.store.values()].find(
      (r) => r.external_id === id && r.workspace_external_id === workspaceExternalId,
    );
    return row ? this.toContract(row) : null;
  }

  async health(): Promise<{ status: string; contract: string }> {
    return { status: "ok", contract: "v1" };
  }

  private toContract(row: InternalApiRequestRow): PostRequestContract {
    const status = postStatusSchema.parse(row.status);
    return {
      id: row.external_id,
      workspaceId: row.workspace_external_id,
      destinationRef: row.destination_ref,
      profileRef: row.profile_ref ?? undefined,
      locale: { locale: "en-US", interfaceLanguage: "en" },
      language: row.language,
      requestedCount: row.requested_count,
      status,
      evidence: row.evidence_json,
      createdAt: row.created_at,
    };
  }
}

export interface ContentFactoryClient {
  createRequest(input: CreatePostRequestInput): Promise<PostRequestContract>;
  getRequest(id: string, workspaceExternalId: string): Promise<PostRequestContract | null>;
  health(): Promise<{ status: string; contract: string }>;
}

function signRequest(
  method: string,
  path: string,
  body: string,
  idempotencyKey: string | null,
  timestamp: string,
  nonce: string,
  secret: string,
): string {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [method, path, timestamp, nonce, idempotencyKey ?? "", bodyHash].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export class HttpContentFactoryClient implements ContentFactoryClient {
  private readonly timeoutMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    timeoutMs = contentFactoryConfig().requestTimeoutMs,
  ) {
    this.timeoutMs = timeoutMs;
  }

  private headers(
    method: string,
    path: string,
    body: string,
    idempotencyKey: string | null,
  ): Headers {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID();
    const signature = signRequest(method, path, body, idempotencyKey, timestamp, nonce, this.secret);
    const headers = new Headers();
    headers.set("X-SocialOlla-Service", "socialoreo");
    headers.set("Authorization", `Bearer ${this.secret}`);
    headers.set("X-SocialOlla-Timestamp", timestamp);
    headers.set("X-SocialOlla-Nonce", nonce);
    headers.set("X-SocialOlla-Signature", signature);
    if (idempotencyKey) headers.set("X-Idempotency-Key", idempotencyKey);
    if (body) headers.set("Content-Type", "application/json");
    return headers;
  }

  private async send(
    method: string,
    path: string,
    body: string,
    idempotencyKey: string | null,
    retries = 2,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const attempt = async (): Promise<Response> => {
      const response = await fetch(url, {
        method,
        headers: this.headers(method, path, body, idempotencyKey),
        body: body || undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response;
    };
    let lastError: unknown;
    for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex += 1) {
      try {
        const response = await attempt();
        // Retry transient 5xx (and never replay a 4xx, which is not transient).
        if (response.status >= 500 && response.status < 600 && attemptIndex < retries) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attemptIndex + 1)));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attemptIndex < retries) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attemptIndex + 1)));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Content Factory request failed");
  }

  async createRequest(input: CreatePostRequestInput): Promise<PostRequestContract> {
    const path = "/internal/v1/requests";
    const body = JSON.stringify({
      workspace_external_id: input.workspaceExternalId,
      destination_ref: input.destinationRef,
      profile_ref: input.profileRef ?? null,
      language: input.language,
      requested_count: input.requestedCount,
      idempotency_key: input.idempotencyKey,
    });
    const response = await this.send("POST", path, body, input.idempotencyKey);
    return this.parseContract(await this.readJson(response));
  }

  async getRequest(id: string, workspaceExternalId: string): Promise<PostRequestContract | null> {
    const path = `/internal/v1/requests/${id}`;
    const response = await this.send(
      "GET",
      `${path}?workspace_external_id=${encodeURIComponent(workspaceExternalId)}`,
      "",
      null,
      1,
    );
    if (response.status === 404) return null;
    return this.parseContract(await this.readJson(response));
  }

  async health(): Promise<{ status: string; contract: string }> {
    const response = await this.send("GET", "/internal/v1/health", "", null, 1);
    return this.readJson(response);
  }

  private async readJson(response: Response): Promise<never | any> {
    if (!response.ok) {
      throw new Error(`Content Factory request failed with status ${response.status}`);
    }
    return response.json();
  }

  private parseContract(row: InternalApiRequestRow): PostRequestContract {
    const status = postStatusSchema.parse(row.status);
    return {
      id: row.external_id,
      workspaceId: row.workspace_external_id,
      destinationRef: row.destination_ref,
      profileRef: row.profile_ref ?? undefined,
      locale: { locale: "en-US", interfaceLanguage: "en" },
      language: row.language,
      requestedCount: row.requested_count,
      status,
      evidence: row.evidence_json,
      createdAt: row.created_at,
    };
  }
}

export function createContentFactoryClient(): ContentFactoryClient {
  const config = contentFactoryConfig();
  if (config.enabled) {
    if (!config.baseUrl || !config.apiSecret) {
      throw new Error("Content Factory integration enabled without URL or secret.");
    }
    return new HttpContentFactoryClient(config.baseUrl, config.apiSecret);
  }
  return new StubContentFactoryClient();
}

export type { PostStatus };
