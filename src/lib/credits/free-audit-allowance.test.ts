import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimFreeAuditAllowance,
  FreeAuditAllowanceExhaustedError,
  restoreFreeAuditAllowance,
} from "./free-audit-allowance";

const mockUserUpdateMany = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      updateMany: (...args: unknown[]) => mockUserUpdateMany(...args),
    },
  },
}));

describe("free audit allowance", () => {
  beforeEach(() => {
    mockUserUpdateMany.mockReset();
  });

  it("claims the free allowance atomically", async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    await claimFreeAuditAllowance("user-1");

    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", freeAuditAllowanceRemaining: { gt: 0 } },
      data: { freeAuditAllowanceRemaining: { decrement: 1 } },
    });
  });

  it("prevents concurrent free requests from claiming two allowances", async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 0 });

    await expect(claimFreeAuditAllowance("user-1")).rejects.toBeInstanceOf(
      FreeAuditAllowanceExhaustedError,
    );
  });

  it("restores the free allowance after a failed audit", async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 1 });

    await restoreFreeAuditAllowance("user-1");

    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: "user-1", freeAuditAllowanceRemaining: { lt: 1 } },
      data: { freeAuditAllowanceRemaining: 1 },
    });
  });
});
