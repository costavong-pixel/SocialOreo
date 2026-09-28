import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { INCLUDED_MONTHLY_CREDITS } from "@/lib/socialolla/plans/plan-config";

const mocks = vi.hoisted(() => {
  const prisma = { $transaction: vi.fn() };
  const getOrCreatePersonalWorkspace = vi.fn();
  return { prisma, getOrCreatePersonalWorkspace };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: mocks.getOrCreatePersonalWorkspace }));

const WORKSPACE = {
  id: "wsp_lifetime_1",
  dbId: "ws-lifetime-1",
  ownerAuthUserId: "user-lifetime-1",
  label: "Personal workspace",
  defaultLocale: "en-US",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function buildTransaction(options?: {
  accessPlan?: "LIFETIME" | "MONTHLY" | "NONE";
  entitlement?: { id: string; externalId: string; includedMonthlyCredits: number } | null;
  batches?: Array<{ id: string; externalId: string; kind: "MONTHLY" | "PURCHASED"; amount: number; remaining: number; periodKey: string | null }>;
}) {
  let entitlement = options?.entitlement ?? null;
  const batches = new Map((options?.batches ?? []).map((batch) => [batch.periodKey ?? batch.externalId, { ...batch, expiresAt: null, createdAt: new Date("2026-08-01T00:00:00.000Z") }]));
  const auditEvents: unknown[] = [];
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ accessPlan: options?.accessPlan ?? "LIFETIME" }),
      updateMany: vi.fn().mockResolvedValue({ count: options?.accessPlan === "NONE" ? 0 : 1 }),
    },
    planVersion: {
      upsert: vi.fn().mockResolvedValue({ id: "pv-lifetime-1", externalId: "plv_lifetime_v1", version: 1, name: "SocialOlla Lifetime", status: "ACTIVE" }),
    },
    entitlementSnapshot: {
      findFirst: vi.fn().mockImplementation(async () => entitlement),
      create: vi.fn().mockImplementation(async ({ data }: { data: { externalId: string; includedMonthlyCredits: number } }) => {
        entitlement = { id: "ent-lifetime-1", externalId: data.externalId, includedMonthlyCredits: data.includedMonthlyCredits };
        return entitlement;
      }),
    },
    workspace: {
      findUnique: vi.fn().mockResolvedValue({ ownerUserId: "user-lifetime-1", ownerUser: { accessPlan: options?.accessPlan ?? "LIFETIME" } }),
      create: vi.fn(),
    },
    creditBatch: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { periodKey: string } }) => batches.get(where.periodKey) ?? null),
      create: vi.fn().mockImplementation(async ({ data }: { data: { externalId: string; amount: number; remaining: number; periodKey: string } }) => {
        const row = { id: `cb-${data.periodKey}`, ...data, kind: "MONTHLY" as const, expiresAt: null, createdAt: new Date("2026-08-01T00:00:00.000Z") };
        batches.set(data.periodKey, row);
        return row;
      }),
    },
    auditEvent: { create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => { auditEvents.push(data); return { id: `event-${auditEvents.length}` }; }) },
    creditAccount: { update: vi.fn() },
    creditLedger: { create: vi.fn() },
  };
  mocks.getOrCreatePersonalWorkspace.mockResolvedValue(WORKSPACE);
  mocks.prisma.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, batches, auditEvents, getEntitlement: () => entitlement };
}

describe("legacy Lifetime entitlement reconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00.000Z"));
    vi.clearAllMocks();
  });

  it("creates a missing entitlement snapshot and current monthly batch with 1,200 credits", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTransaction();

    const result = await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(result).toMatchObject({
      entitlementCreated: true,
      batchCreated: true,
      creditsGranted: INCLUDED_MONTHLY_CREDITS,
      includedMonthlyCredits: INCLUDED_MONTHLY_CREDITS,
      periodKey: "2026-08",
    });
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ includedMonthlyCredits: INCLUDED_MONTHLY_CREDITS }),
    }));
    expect(tx.creditBatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: INCLUDED_MONTHLY_CREDITS, remaining: INCLUDED_MONTHLY_CREDITS, kind: "MONTHLY", periodKey: "2026-08" }),
    }));
  });

  it("is idempotent across two runs and does not duplicate credits or audit events", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx, auditEvents } = buildTransaction();

    const first = await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });
    const second = await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(first.creditsGranted).toBe(INCLUDED_MONTHLY_CREDITS);
    expect(second).toMatchObject({ entitlementCreated: false, batchCreated: false, creditsGranted: 0 });
    expect(tx.entitlementSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.creditBatch.create).toHaveBeenCalledTimes(1);
    expect(auditEvents).toHaveLength(1);
    expect(tx.creditAccount.update).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });

  it("leaves a valid entitlement and current batch unchanged", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const existing = { id: "ent-existing", externalId: "ent_existing", includedMonthlyCredits: INCLUDED_MONTHLY_CREDITS };
    const { tx } = buildTransaction({
      entitlement: existing,
      batches: [{ id: "cb-existing", externalId: "cbt_existing", kind: "MONTHLY", amount: INCLUDED_MONTHLY_CREDITS, remaining: 777, periodKey: "2026-08" }],
    });

    const result = await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(result).toMatchObject({ entitlementCreated: false, batchCreated: false, creditsGranted: 0 });
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();
    expect(tx.creditBatch.create).not.toHaveBeenCalled();
  });

  it("does not touch purchased credits while provisioning the included batch", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const purchased = { id: "cb-purchased", externalId: "cbt_purchased", kind: "PURCHASED" as const, amount: 50, remaining: 37, periodKey: null };
    const { tx, batches } = buildTransaction({ batches: [purchased] });

    await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(batches.get("cbt_purchased")).toMatchObject({ amount: 50, remaining: 37, kind: "PURCHASED" });
    expect(tx.creditBatch.create).toHaveBeenCalledTimes(1);
    expect(tx.creditBatch.create.mock.calls[0][0].data.kind).toBe("MONTHLY");
  });

  it("preserves legacy credit history because reconciliation never edits legacy rows", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTransaction();

    await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(tx.creditAccount.update).not.toHaveBeenCalled();
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });

  it("refuses a non-Lifetime account before creating workspace or entitlement state", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTransaction({ accessPlan: "NONE" });

    await expect(reconcileLifetimeEntitlement({ ownerUserId: "user-not-lifetime" })).rejects.toThrow("existing LIFETIME account");
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(mocks.getOrCreatePersonalWorkspace).not.toHaveBeenCalled();
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();
    expect(tx.creditBatch.create).not.toHaveBeenCalled();
  });

  it("refuses a Monthly account because this reconciliation is Lifetime-only", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTransaction({ accessPlan: "MONTHLY" });

    await expect(reconcileLifetimeEntitlement({ ownerUserId: "user-monthly-1" })).rejects.toThrow("existing LIFETIME account");
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.entitlementSnapshot.create).not.toHaveBeenCalled();
    expect(tx.creditBatch.create).not.toHaveBeenCalled();
  });

  it("uses the serializable transaction and owner eligibility lock", async () => {
    const { reconcileLifetimeEntitlement } = await import("./entitlement-service");
    const { tx } = buildTransaction();

    await reconcileLifetimeEntitlement({ ownerUserId: "user-lifetime-1" });

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-lifetime-1", accessPlan: "LIFETIME" },
      data: { freeAuditAllowanceRemaining: { increment: 0 } },
    });
  });
});
