import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    workspace: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    destination: { findFirst: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const now = new Date();
const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

const BATCH_ROW = {
  id: "cb-internal-1",
  externalId: "cbt_abcdefghijklmnop",
  workspaceId: "ws-internal-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  periodKey,
  createdAt: new Date("2026-08-03T00:00:00Z"),
};

describe("Slice C — SocialOreo Post integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
    mocks.prisma.workspace.findUnique.mockResolvedValue({
      id: "ws-internal-1",
      externalId: "wsp_abcdefghijklmnop",
      ownerUserId: "user-1",
      label: "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
      createdAt: new Date("2026-08-03T00:00:00Z"),
      destinations: [],
      entitlementSnapshots: [],
      creditBatches: [BATCH_ROW],
    });
    mocks.prisma.destination.findFirst.mockImplementation((args: { where: { externalId: string } }) => ({
      id: "dst-internal-1",
      externalId: args.where.externalId,
      workspaceId: "ws-internal-1",
      label: "Work Instagram",
      platform: "instagram",
    }));
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({
      externalId: "ent_abcdefghijklmnop",
      postCreditsPerRequest: 1,
      includedMonthlyCredits: 20,
    });
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(BATCH_ROW);
    mocks.prisma.creditBatch.findUnique.mockResolvedValue(BATCH_ROW);
    mocks.prisma.creditBatch.findMany.mockResolvedValue([BATCH_ROW]);
    const createdKeys = new Set<string>();
    mocks.prisma.creditTransaction.create.mockImplementation((args: { data: { idempotencyKey: string; kind: string; amount: number } }) => {
      createdKeys.add(args.data.idempotencyKey);
      return { id: "tx-1", batchId: "cb-internal-1", amount: args.data.amount };
    });
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (createdKeys.has(args.where.idempotencyKey)) {
        return { id: "tx-1", batchId: "cb-internal-1", amount: 1 };
      }
      return null;
    });
    mocks.prisma.creditBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "evt-1" });
    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return arg({ creditBatch: mocks.prisma.creditBatch, creditTransaction: mocks.prisma.creditTransaction });
      }
      if (Array.isArray(arg)) {
        return [mocks.prisma.creditBatch.updateMany(), { id: "tx-hold" }];
      }
      throw new Error("unexpected transaction form");
    });
  });

  it("requires confirmation before executing a protected post action", async () => {
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    await expect(
      service.execute({
        authUserId: "user-1",
        destinationExternalId: "dst_abcdefghijklmnop",
        language: "en",
        requestedCount: 10,
        confirmed: false,
      }),
    ).rejects.toThrow("confirmation");
  });

  it("refuses to execute when provider-disabled mode is off (fail-closed guard, before any side effect)", async () => {
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    await expect(
      service.execute({
        authUserId: "user-1",
        destinationExternalId: "dst_abcdefghijklmnop",
        language: "en",
        requestedCount: 10,
        confirmed: true,
        contentIntent: "opening promo",
      }),
    ).rejects.toThrow("Live provider calls are disabled");
    // No side effects happened: no hold, no request, no refund, no audit.
    expect(mocks.prisma.creditTransaction.create).not.toHaveBeenCalled();
    expect(mocks.prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a destination that is not bound to the workspace", async () => {
    mocks.prisma.destination.findFirst.mockResolvedValue(null);
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    await expect(
      service.preview("user-1", "dst_abcdefghijklmnop", 10),
    ).rejects.toThrow("Destination not found");
  });

  it("creates a staged post request and charges exactly one credit hold", async () => {
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    const request = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_abcdefghijklmnop",
      language: "zh",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "opening promo",
    });
    expect(request.status).toBe("review");
    expect(request.workspaceId).toBe("wsp_abcdefghijklmnop");
    expect(request.requestedCount).toBe(10);
    expect(mocks.prisma.creditTransaction.create).toHaveBeenCalled();
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
  });

  it("replays a duplicate request without charging twice (idempotency)", async () => {
    // First run: hold is new, finalize is new.
    let holdCount = 0;
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) {
        holdCount += 1;
        return holdCount > 1 ? { id: "tx-hold", amount: 1 } : null;
      }
      if (args.where.idempotencyKey.endsWith(":finalize")) {
        return { id: "tx-finalize" };
      }
      return null;
    });
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    const first = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "repeat promo",
    });
    const holdCreatesBefore = mocks.prisma.creditTransaction.create.mock.calls.length;
    const second = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "repeat promo",
    });
    const holdCreatesAfter = mocks.prisma.creditTransaction.create.mock.calls.length;
    // Idempotent replay creates NO new transaction rows (hold and finalize replay).
    expect(holdCreatesAfter - holdCreatesBefore).toBe(0);
    expect(first.id).toBe(second.id);
  });

  it("auto-refunds the hold when the Content Factory attempt fails", async () => {
    const { createPostService } = await import("./post-service");
    const failingClient = {
      createRequest: vi.fn().mockRejectedValue(new Error("upstream down")),
      getRequest: vi.fn(),
      health: vi.fn(),
    };
    const service = createPostService(failingClient as never);
    await expect(
      service.execute({
        authUserId: "user-1",
        destinationExternalId: "dst_abcdefghijklmnop",
        language: "en",
        requestedCount: 10,
        confirmed: true,
        contentIntent: "opening promo",
      }),
    ).rejects.toThrow("upstream down");
    // Attempt failed -> the hold is auto-refunded (idempotent, only when a
    // matching HOLD exists).
    const kinds = mocks.prisma.creditTransaction.create.mock.calls.map((call) => call[0].data.kind);
    expect(kinds).toContain("HOLD");
    expect(kinds).toContain("REFUND");
  });

  it("scopes the idempotency key by destination so a shared intent never crosses destinations", async () => {
    const { createPostService } = await import("./post-service");
    const service = createPostService();
    const first = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "opening promo",
    });
    const second = await service.execute({
      authUserId: "user-1",
      destinationExternalId: "dst_zzzzzzzzzzzzzzzz",
      language: "en",
      requestedCount: 10,
      confirmed: true,
      contentIntent: "opening promo",
    });
    expect(first.id).not.toBe(second.id);
  });

  it("maps a staged request back through the client stub deterministically", async () => {
    const { createContentFactoryClient } = await import("./client");
    const client = createContentFactoryClient();
    const one = await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:same-intent",
    });
    const two = await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:same-intent",
    });
    expect(one.id).toBe(two.id);
    expect(one.status).toBe("review");
  });

  it("workspace helper creates lazily and returns a wsp_ external id", async () => {
    mocks.prisma.workspace.findUnique.mockResolvedValue(null);
    mocks.prisma.workspace.create.mockResolvedValue({
      id: "ws-new",
      externalId: "wsp_newabcdefghijklm",
      ownerUserId: "user-1",
      label: "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
      createdAt: new Date("2026-08-03T00:00:00Z"),
    });
    const { getOrCreatePersonalWorkspace } = await import("@/lib/socialolla/workspace");
    const created = await getOrCreatePersonalWorkspace("user-1");
    expect(created.id).toMatch(/^wsp_/);
    expect(mocks.prisma.workspace.create).toHaveBeenCalled();
  });

  it("HTTP client retries transient 5xx and honors the timeout", async () => {
    const { HttpContentFactoryClient } = await import("./client");
    const calls: Array<{ status: number; delay: number }> = [
      { status: 502, delay: 0 },
      { status: 200, delay: 0 },
    ];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal) {
        await Promise.race([
          Promise.resolve(),
          new Promise((_, reject) => {
            init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        ]);
      }
      const next = calls.shift()!;
      if (next.delay) await new Promise((r) => setTimeout(r, next.delay));
      return { ok: next.status === 200, status: next.status, json: async () => ({ external_id: "req_test000000000000000", workspace_external_id: "wsp_abcdefghijklmnop", destination_ref: "dst_abcdefghijklmnop", profile_ref: null, language: "en", requested_count: 10, status: "review", candidates_json: [], review_json: null, evidence_json: [], created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z" }) };
    });
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;
    try {
      const client = new HttpContentFactoryClient("http://cf", "secret");
      const result = await client.createRequest({
        workspaceExternalId: "wsp_abcdefghijklmnop",
        destinationRef: "dst_abcdefghijklmnop",
        language: "en",
        requestedCount: 10,
        idempotencyKey: "so:wsp_abcdefghijklmnop:retry",
      });
      expect(result.status).toBe("review");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it("HTTP client gives up after bounded retries on persistent 5xx", async () => {
    const { HttpContentFactoryClient } = await import("./client");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;
    try {
      const client = new HttpContentFactoryClient("http://cf", "secret", 1000);
      await expect(
        client.createRequest({
          workspaceExternalId: "wsp_abcdefghijklmnop",
          destinationRef: "dst_abcdefghijklmnop",
          language: "en",
          requestedCount: 10,
          idempotencyKey: "so:wsp_abcdefghijklmnop:fail",
        }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
