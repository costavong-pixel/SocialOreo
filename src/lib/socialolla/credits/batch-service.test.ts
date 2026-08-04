import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    creditBatch: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const MONTHLY_ROW = {
  id: "cb-monthly",
  externalId: "cbt_monthly0000000000",
  workspaceId: "ws-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  periodKey: "2026-08",
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

const PURCHASED_ROW = {
  id: "cb-purchased",
  externalId: "cbt_purchased0000000",
  workspaceId: "ws-1",
  kind: "PURCHASED",
  amount: 100,
  remaining: 100,
  expiresAt: new Date("2027-08-04T00:00:00Z"),
  periodKey: null,
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

describe("Slice E — canonical credit engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.creditBatch.findMany.mockResolvedValue([MONTHLY_ROW, PURCHASED_ROW]);
    mocks.prisma.creditBatch.findUnique.mockResolvedValue(MONTHLY_ROW);
    mocks.prisma.creditBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.creditBatch.update.mockResolvedValue({ ...MONTHLY_ROW, remaining: 21 });
    mocks.prisma.creditTransaction.findUnique.mockResolvedValue(null);
    mocks.prisma.creditTransaction.create.mockResolvedValue({ id: "tx-1" });
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "evt-1" });
    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") return arg({ creditBatch: mocks.prisma.creditBatch, creditTransaction: mocks.prisma.creditTransaction });
      if (Array.isArray(arg)) return [mocks.prisma.creditBatch.updateMany(), { id: "tx-hold" }];
      throw new Error("unexpected transaction form");
    });
  });

  it("derives a deterministic, workspace+destination-scoped intent key", async () => {
    const { intentKey } = await import("./batch-service");
    const a = intentKey("wsp_abc", "dst_abc", "opening promo");
    const b = intentKey("wsp_abc", "dst_abc", "opening promo");
    const c = intentKey("wsp_abc", "dst_xyz", "opening promo");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("so:wsp_abc:dst_abc:")).toBe(true);
  });

  it("refuses a refund with no matching hold (no credit inflation)", async () => {
    const { refundCredits } = await import("./batch-service");
    mocks.prisma.creditTransaction.findUnique.mockResolvedValue(null);
    await expect(
      refundCredits({ amount: 1, reference: "req:x", intent: "so:wsp_abc:dst_abc:none:deadbeef0000" }),
    ).rejects.toThrow("No matching hold");
  });

  it("holds against the selected spendable batch (monthly first)", async () => {
    const { holdCredits } = await import("./batch-service");
    const result = await holdCredits({ internalWorkspaceId: "ws-1", amount: 3, reference: "req:x", idempotencyKey: "so:wsp_abc:dst_abc:opening-promo:aaaa" });
    expect(result.held).toBe(true);
    // Selector queried; hold row created on the monthly batch.
    expect(mocks.prisma.creditBatch.findMany).toHaveBeenCalled();
    const createData = mocks.prisma.creditTransaction.create.mock.calls[0][0].data;
    expect(createData.kind).toBe("HOLD");
    expect(createData.batchId).toBe("cb-monthly");
    expect(mocks.prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "credit.hold" }) }),
    );
  });

  it("finalizes only when a matching hold exists with matching amount", async () => {
    const { finalizeCredits } = await import("./batch-service");
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) return { id: "hold-1", batchId: "cb-monthly", amount: 1 };
      return null;
    });
    const ok = await finalizeCredits({ amount: 1, reference: "req:x", intent: "so:wsp_abc:dst_abc:opening-promo:aaaa" });
    expect(ok.finalized).toBe(true);
    const createData = mocks.prisma.creditTransaction.create.mock.calls[0][0].data;
    expect(createData.kind).toBe("FINALIZE");
    // Amount mismatch rejected.
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) return { id: "hold-1", batchId: "cb-monthly", amount: 5 };
      return null;
    });
    await expect(finalizeCredits({ amount: 1, reference: "req:x", intent: "so:wsp_abc:dst_abc:opening-promo:bbbb" })).rejects.toThrow("does not match");
  });

  it("refunds only when a matching hold exists and is idempotent", async () => {
    const { refundCredits } = await import("./batch-service");
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) return { id: "hold-1", batchId: "cb-monthly", amount: 1 };
      return null;
    });
    const first = await refundCredits({ amount: 1, reference: "req:x", intent: "so:wsp_abc:dst_abc:opening-promo:cccc" });
    expect(first.refunded).toBe(true);
    expect(mocks.prisma.creditBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ remaining: { increment: 1 } }) }),
    );
    // Second refund is a replayed no-op (no double refund).
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) return { id: "hold-1", batchId: "cb-monthly", amount: 1 };
      if (args.where.idempotencyKey.endsWith(":refund")) return { id: "refund-1" };
      return null;
    });
    const second = await refundCredits({ amount: 1, reference: "req:x", intent: "so:wsp_abc:dst_abc:opening-promo:cccc" });
    expect(second.replayed).toBe(true);
    expect(mocks.prisma.creditTransaction.create).not.toHaveBeenCalledTimes(2);
  });

  it("selects purchased batches after monthly and skips expired batches", async () => {
    const { selectSpendableBatch } = await import("./batch-service");
    const expired = { ...PURCHASED_ROW, id: "cb-expired", externalId: "cbt_expired00000000", expiresAt: new Date("2026-01-01T00:00:00Z") };
    const spentMonthly = { ...MONTHLY_ROW, remaining: 0 };
    mocks.prisma.creditBatch.findMany.mockResolvedValue([expired, spentMonthly, PURCHASED_ROW]);
    const selected = await selectSpendableBatch("ws-1", 1);
    expect(selected?.id).toBe("cb-purchased");
  });

  it("ensures a monthly batch per period without double-grant", async () => {
    const { ensureMonthlyBatch } = await import("./batch-service");
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(MONTHLY_ROW);
    const existing = await ensureMonthlyBatch({ internalWorkspaceId: "ws-1", externalWorkspaceId: "wsp_abc", includedCredits: 20, periodKey: "2026-08" });
    expect(existing?.id).toBe("cbt_monthly0000000000");
    expect(mocks.prisma.creditBatch.create).not.toHaveBeenCalled();
    // A different period creates a new batch.
    mocks.prisma.creditBatch.findFirst.mockResolvedValue(null);
    mocks.prisma.creditBatch.create.mockResolvedValue({ ...MONTHLY_ROW, id: "cb-monthly-2", externalId: "cbt_monthly2", periodKey: "2026-09" });
    const next = await ensureMonthlyBatch({ internalWorkspaceId: "ws-1", externalWorkspaceId: "wsp_abc", includedCredits: 20, periodKey: "2026-09" });
    expect(mocks.prisma.creditBatch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ periodKey: "2026-09" }) }));
    void next;
  });

  it("records an admin adjustment with reason + audit", async () => {
    const { adjustCredits } = await import("./batch-service");
    mocks.prisma.creditBatch.findMany.mockResolvedValue([MONTHLY_ROW]);
    const result = await adjustCredits({ internalWorkspaceId: "ws-1", amount: 5, reference: "admin-gift", reason: "promo grant", actorAuthUserId: "admin-1", idempotencyKey: "so:wsp_abc:dst_abc:admin-gift" });
    expect(result.adjusted).toBe(true);
    const tx = mocks.prisma.creditTransaction.create.mock.calls[0][0].data;
    expect(tx.kind).toBe("ADJUSTMENT");
    const event = mocks.prisma.auditEvent.create.mock.calls.find((call) => call[0].data.eventType === "credit.adjustment");
    expect(event).toBeDefined();
    expect(event?.[0].data.payload.reason).toBe("promo grant");
    expect(event?.[0].data.actorAuthUserId).toBe("admin-1");
  });

  it("refuses to hold expired-only credits", async () => {
    const { holdCredits } = await import("./batch-service");
    const expired = { ...PURCHASED_ROW, expiresAt: new Date("2026-01-01T00:00:00Z"), remaining: 10 };
    const spent = { ...MONTHLY_ROW, remaining: 0 };
    mocks.prisma.creditBatch.findMany.mockResolvedValue([spent, expired]);
    await expect(holdCredits({ internalWorkspaceId: "ws-1", amount: 1, reference: "req:x", idempotencyKey: "so:wsp_abc:dst_abc:hold-expired" })).rejects.toThrow("Insufficient credits");
  });
});
