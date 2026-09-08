import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    planVersion: { upsert: vi.fn() },
    entitlementSnapshot: { create: vi.fn() },
    creditBatch: { findFirst: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

type BatchRow = {
  id: string;
  externalId: string;
  workspaceId: string;
  kind: string;
  amount: number;
  remaining: number;
  expiresAt: Date | null;
  periodKey: string | null;
  createdAt: Date;
};

const WORKSPACE_ROW = {
  id: "ws-internal-1",
  externalId: "wsp_entitlement000000",
  ownerUserId: "user-1",
  label: "Personal workspace",
  defaultLocale: "en-US",
  provider: "PERSONAL",
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

function buildTx() {
  let batchStore: BatchRow | null = null;
  let entitlementSeq = 0;
  const tx = {
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    planVersion: { upsert: vi.fn() },
    entitlementSnapshot: { create: vi.fn() },
    creditBatch: { findFirst: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  tx.workspace.findUnique.mockResolvedValue(WORKSPACE_ROW);
  tx.planVersion.upsert.mockResolvedValue({ id: "pv-1", externalId: "plv_lifetime_v1", version: 1, name: "SocialOlla Lifetime", status: "ACTIVE" });
  tx.entitlementSnapshot.create.mockImplementation(async () => {
    entitlementSeq += 1;
    return { id: `ent-${entitlementSeq}`, externalId: `ent_external${entitlementSeq}` };
  });
  tx.creditBatch.findFirst.mockImplementation(async ({ where }: { where: { workspaceId: string; periodKey: string } }) =>
    batchStore && batchStore.workspaceId === where.workspaceId && batchStore.periodKey === where.periodKey ? batchStore : null,
  );
  tx.creditBatch.create.mockImplementation(async ({ data }: { data: { externalId: string; workspaceId: string; kind: string; amount: number; remaining: number; periodKey: string } }) => {
    batchStore = {
      id: "cb-internal-1",
      externalId: data.externalId,
      workspaceId: data.workspaceId,
      kind: data.kind,
      amount: data.amount,
      remaining: data.remaining,
      expiresAt: null,
      periodKey: data.periodKey,
      createdAt: new Date("2026-08-04T00:00:00Z"),
    };
    return batchStore;
  });
  tx.auditEvent.create.mockResolvedValue({ id: "evt-1" });
  return { tx, batchStore: () => batchStore };
}

describe("Slice E — grantLifetimeEntitlement period batch reuse (BACKEND-01)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reuses the period MONTHLY batch for two same-period lifetime grants (one batch, two entitlements, no double credit)", async () => {
    const { grantLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTx();

    const first = await grantLifetimeEntitlement({ ownerUserId: "user-1", squarePaymentId: "payment-1", priceCents: 7900 }, tx as never);
    const second = await grantLifetimeEntitlement({ ownerUserId: "user-1", squarePaymentId: "payment-2", priceCents: 7900 }, tx as never);

    // One MONTHLY batch was minted, shared across both payments.
    expect(tx.creditBatch.create).toHaveBeenCalledTimes(1);
    expect(first.externalIds.batch).toBe(second.externalIds.batch);

    // One entitlement per squarePaymentId (each payment grants exactly once).
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledTimes(2);
    expect(first.externalIds.entitlement).not.toBe(second.externalIds.entitlement);

    // No duplicate credits: first minted 20, second reused the batch and minted 0.
    expect(first.creditsGranted).toBe(20);
    expect(second.creditsGranted).toBe(0);

    // Audit events reference the shared batch and flag the reuse.
    const events = tx.auditEvent.create.mock.calls.map((call) => call[0].data);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.payload.squarePaymentId)).toEqual(["payment-1", "payment-2"]);
    expect(events.every((e) => e.payload.batch === first.externalIds.batch)).toBe(true);
    expect(events[0].payload.batchReused).toBe(false);
    expect(events[1].payload.batchReused).toBe(true);
  });

  it("reuses a MONTHLY batch already provisioned for the period (lifetime re-purchase after m2EnsureMonthlyBatch)", async () => {
    const { grantLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTx();
    // Pre-provisioned period batch (e.g. manual admin/dev ensure call). The
    // default create stores the row into the mock batch store.
    await tx.creditBatch.create({ data: { externalId: "cbt_pre000000000000000", workspaceId: "ws-internal-1", kind: "MONTHLY", amount: 20, remaining: 20, periodKey: "2026-08" } });
    tx.creditBatch.create.mockClear();

    const granted = await grantLifetimeEntitlement({ ownerUserId: "user-1", squarePaymentId: "payment-1", priceCents: 7900 }, tx as never);

    expect(tx.creditBatch.create).not.toHaveBeenCalled();
    expect(granted.creditsGranted).toBe(0);
    expect(granted.externalIds.batch).toBe("cbt_pre000000000000000");
  });

  it("reuses the existing batch instead of aborting on the unique constraint (P2002 race)", async () => {
    const { grantLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTx();
    // Simulate a concurrent settlement winning the batch create: the first
    // create attempt hits the @@unique conflict, the re-read finds the winner.
    let conflictRaised = false;
    tx.creditBatch.create.mockImplementation(async () => {
      if (!conflictRaised) {
        conflictRaised = true;
        const conflict = new Error("Unique constraint failed on the fields: (`workspaceId`,`kind`,`periodKey`)");
        (conflict as { code?: string }).code = "P2002";
        throw conflict;
      }
      return { id: "cb-2", externalId: "cbt_shouldnotbeused", workspaceId: "ws-internal-1", kind: "MONTHLY", amount: 20, remaining: 20, expiresAt: null, periodKey: "2026-08", createdAt: new Date() };
    });
    // Winner already exists (written by the concurrent transaction).
    tx.creditBatch.findFirst.mockImplementation(async () => ({
      id: "cb-winner",
      externalId: "cbt_winner00000000000",
      workspaceId: "ws-internal-1",
      kind: "MONTHLY",
      amount: 20,
      remaining: 20,
      expiresAt: null,
      periodKey: "2026-08",
      createdAt: new Date("2026-08-04T00:00:00Z"),
    }));

    const granted = await grantLifetimeEntitlement({ ownerUserId: "user-1", squarePaymentId: "payment-1", priceCents: 7900 }, tx as never);

    expect(granted.externalIds.batch).toBe("cbt_winner00000000000");
    expect(granted.creditsGranted).toBe(0);
    // The entitlement itself is still granted exactly once for this payment.
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create.mock.calls[0][0].data.payload.batchReused).toBe(true);
  });
});
