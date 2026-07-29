import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeCreditForAudit,
  InsufficientCreditsError,
  refundAuditCredit,
} from "./consume-credit";

const mockTransaction = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => mockTransaction(callback),
  },
}));

describe("consumeCreditForAudit", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
  });

  it("consumes exactly one credit in a transaction", async () => {
    const tx = {
      creditAccount: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ balance: 2 }),
      },
      creditLedger: {
        create: vi.fn().mockResolvedValue({ id: "ledger-1" }),
      },
    };

    mockTransaction.mockImplementation(async (callback) => callback(tx));

    const result = await consumeCreditForAudit("user-1", 1, "audit-1");

    expect(result.ledgerEntryId).toBe("ledger-1");
    expect(result.newBalance).toBe(2);
    expect(tx.creditAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", balance: { gte: 1 } },
      data: { balance: { decrement: 1 } },
    });
    expect(tx.creditLedger.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        delta: -1,
        reason: "paid_audit:audit-1",
      },
    });
  });

  it("throws when concurrent requests overspend the same credit", async () => {
    const tx = {
      creditAccount: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      creditLedger: {
        create: vi.fn(),
      },
    };

    mockTransaction.mockImplementation(async (callback) => callback(tx));

    await expect(consumeCreditForAudit("user-1", 1, "audit-2")).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
    expect(tx.creditLedger.create).not.toHaveBeenCalled();
  });

  it("refunds a failed paid audit credit", async () => {
    const tx = {
      creditAccount: {
        update: vi.fn().mockResolvedValue({ balance: 1 }),
      },
      creditLedger: {
        create: vi.fn().mockResolvedValue({ id: "refund-1" }),
      },
    };

    mockTransaction.mockImplementation(async (callback) => callback(tx));

    await refundAuditCredit("user-1", 1, "audit-3", "ledger-1");

    expect(tx.creditAccount.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { balance: { increment: 1 } },
    });
    expect(tx.creditLedger.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        delta: 1,
        reason: "refund_failed_audit:audit-3:from:ledger-1",
      },
    });
  });
});
