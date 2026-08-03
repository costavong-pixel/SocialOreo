import { describe, expect, it } from "vitest";
import {
  creditBatchSchema,
  creditTransactionSchema,
  destinationSchema,
  idempotencyKeySchema,
  localeSchema,
  postRequestCreateSchema,
  postStatusSchema,
  profileSchema,
  serviceIdentitySchema,
  workspaceSchema,
} from "./schemas";

describe("SocialOlla shared canonical contracts", () => {
  it("accepts a valid user workspace contract", () => {
    const result = workspaceSchema.safeParse({
      id: "wsp_abc123def456",
      ownerAuthUserId: "auth0|user-1",
      label: "Costa's workspace",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a workspace id without the wsp_ prefix", () => {
    const result = workspaceSchema.safeParse({
      id: "abc123def456",
      ownerAuthUserId: "auth0|user-1",
      label: "no prefix",
    });
    expect(result.success).toBe(false);
  });

  it("validates destination identity with labels", () => {
    const result = destinationSchema.safeParse({
      id: "dst_abc123def456",
      workspaceId: "wsp_abc123def456",
      label: "Work Instagram",
      platform: "instagram",
      accountLabel: "@costa.studio",
    });
    expect(result.success).toBe(true);
  });

  it("validates profile identity with locale defaults", () => {
    const result = profileSchema.safeParse({
      id: "prf_abc123def456",
      workspaceId: "wsp_abc123def456",
      handle: "@costa.studio",
      platform: "instagram",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full locale with independent language fields", () => {
    const result = localeSchema.safeParse({
      locale: "zh-CN",
      interfaceLanguage: "zh",
      assistantLanguage: "zh",
      profileDefaultLanguage: "en",
      accountDefaultLanguage: "en",
      contentLanguage: "zh",
      notificationLanguage: "zh",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid BCP-47 locale", () => {
    const result = localeSchema.safeParse({ locale: "not-a-locale" });
    expect(result.success).toBe(false);
  });

  it("enforces namespaced idempotency keys", () => {
    expect(idempotencyKeySchema.safeParse("so:wsp_abc123def456:first-post").success).toBe(true);
    expect(idempotencyKeySchema.safeParse("bare-key").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("other:key").success).toBe(false);
  });

  it("validates credit batches by kind", () => {
    const monthly = creditBatchSchema.safeParse({
      id: "cbt_abc123def456",
      workspaceId: "wsp_abc123def456",
      kind: "MONTHLY",
      amount: 20,
      remaining: 20,
      expiresAt: null,
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    expect(monthly.success).toBe(true);
    const purchased = creditBatchSchema.safeParse({
      id: "cbt_abc123def456",
      workspaceId: "wsp_abc123def456",
      kind: "PURCHASED",
      amount: 100,
      remaining: 100,
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    expect(purchased.success).toBe(true);
    expect(purchased.data?.expiresAt).toBeNull();
  });

  it("validates hold/finalize/refund transactions with idempotency", () => {
    for (const kind of ["HOLD", "FINALIZE", "REFUND"] as const) {
      const result = creditTransactionSchema.safeParse({
        kind,
        batchId: "cbt_abc123def456",
        amount: 3,
        reference: "req_abc123def456",
        idempotencyKey: "so:wsp_abc123def456:hold-1",
      });
      expect(result.success).toBe(true);
    }
    const bad = creditTransactionSchema.safeParse({
      kind: "HOLD",
      batchId: "cbt_abc123def456",
      amount: 0,
      reference: "req_abc123def456",
      idempotencyKey: "so:wsp_abc123def456:hold-1",
    });
    expect(bad.success).toBe(false);
  });

  it("validates service-to-service request identity", () => {
    const result = serviceIdentitySchema.safeParse({
      service: "content-factory",
      workspaceExternalId: "wsp_abc123def456",
      requestId: "abc123def456",
      idempotencyKey: "so:wsp_abc123def456:first-post",
      issuedAt: "2026-08-03T00:00:00.000Z",
      expiresAt: "2026-08-03T00:05:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("validates a Post request create contract with external status enum", () => {
    expect(postStatusSchema.safeParse("review").success).toBe(true);
    expect(postStatusSchema.safeParse("weird").success).toBe(false);
    const result = postRequestCreateSchema.safeParse({
      workspaceId: "wsp_abc123def456",
      destinationRef: "dst_abc123def456",
      profileRef: "prf_abc123def456",
      locale: { locale: "en-US" },
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abc123def456:first-post",
    });
    expect(result.success).toBe(true);
  });
});
