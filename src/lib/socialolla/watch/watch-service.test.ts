import { beforeEach, describe, expect, it, vi } from "vitest";
import { providerDisabledEnabled, providerDisabledFixture, assertProviderDisabledMode } from "@/lib/providers/social/provider-guard";

const mocks = vi.hoisted(() => {
  const prisma = {
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    creditTransaction: { findUnique: vi.fn(), create: vi.fn() },
    auditEvent: { create: vi.fn() },
    watchReport: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/social/provider-router", () => ({
  fetchSocialAudit: vi.fn(async () => providerDisabledFixture("instagram", { url: "https://www.instagram.com/test/", limit: 30 })),
}));

const now = new Date();
const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const BATCH = {
  id: "cb-watch",
  externalId: "cbt_watch000000000000",
  workspaceId: "ws-1",
  kind: "MONTHLY",
  amount: 20,
  remaining: 20,
  expiresAt: null,
  periodKey,
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

describe("Slice D — credit-gated provider-disabled Watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
    mocks.prisma.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      externalId: "wsp_watch00000000000",
      ownerUserId: "user-1",
      label: "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
      createdAt: new Date("2026-08-04T00:00:00Z"),
    });
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ watchCreditsPerRequest: 1 });
    mocks.prisma.creditBatch.findMany.mockResolvedValue([BATCH]);
    const createdKeys = new Set<string>();
    mocks.prisma.creditTransaction.create.mockImplementation((args: { data: { idempotencyKey: string; amount: number } }) => {
      createdKeys.add(args.data.idempotencyKey);
      return { id: "tx-1", batchId: "cb-watch", amount: args.data.amount };
    });
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (createdKeys.has(args.where.idempotencyKey)) return { id: "tx-1", batchId: "cb-watch", amount: 1 };
      return null;
    });
    mocks.prisma.creditBatch.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "evt-1" });
    mocks.prisma.watchReport.create.mockResolvedValue({ id: "wr-1", externalId: "wpr_report000000000" });
    mocks.prisma.watchReport.update.mockResolvedValue({ id: "wr-1" });
    mocks.prisma.watchReport.findMany.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return [mocks.prisma.creditBatch.updateMany(), { id: "tx-hold" }];
      throw new Error("unexpected");
    });
  });

  it("requires exact confirmation before running Watch", async () => {
    const { createWatchService } = await import("./watch-service");
    await expect(
      createWatchService().run({ authUserId: "user-1", profileUrl: "https://www.instagram.com/x/", platform: "instagram", confirmed: false }),
    ).rejects.toThrow("confirmation");
  });

  it("refuses to run when provider-disabled mode is off (live provider guard)", async () => {
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    const { createWatchService } = await import("./watch-service");
    await expect(
      createWatchService().run({ authUserId: "user-1", profileUrl: "https://www.instagram.com/x/", platform: "instagram", confirmed: true }),
    ).rejects.toThrow("Live provider calls are disabled");
  });

  it("holds, runs the provider-disabled fixture, and finalizes on success", async () => {
    const { createWatchService } = await import("./watch-service");
    const result = await createWatchService().run({ authUserId: "user-1", profileUrl: "https://www.instagram.com/test/", platform: "instagram", confirmed: true });
    expect(result.status).toBe("COMPLETED");
    expect(result.analysis?.profile?.provider).toBe("provider-disabled");
    const kinds = mocks.prisma.creditTransaction.create.mock.calls.map((call) => call[0].data.kind);
    expect(kinds).toContain("HOLD");
    expect(kinds).toContain("FINALIZE");
    expect(mocks.prisma.watchReport.create).toHaveBeenCalled();
    expect(mocks.prisma.watchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });

  it("refunds on failure and marks the report failed", async () => {
    const { fetchSocialAudit } = await import("@/lib/providers/social/provider-router");
    (fetchSocialAudit as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fixture down"));
    mocks.prisma.creditTransaction.findUnique.mockImplementation((args: { where: { idempotencyKey: string } }) => {
      if (args.where.idempotencyKey.endsWith(":hold")) return { id: "hold-1", batchId: "cb-watch", amount: 1 };
      return null;
    });
    mocks.prisma.creditBatch.findUnique.mockResolvedValue(BATCH);
    const { createWatchService } = await import("./watch-service");
    await expect(
      createWatchService().run({ authUserId: "user-1", profileUrl: "https://www.instagram.com/fail/", platform: "instagram", confirmed: true }),
    ).rejects.toThrow("fixture down");
    expect(mocks.prisma.watchReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    const kinds = mocks.prisma.creditTransaction.create.mock.calls.map((call) => call[0].data.kind);
    expect(kinds).toContain("REFUND");
  });

  it("provider guard returns a deterministic fixture and respects the flag", () => {
    expect(providerDisabledEnabled()).toBe(true);
    const a = providerDisabledFixture("instagram", { url: "https://www.instagram.com/x/", limit: 30 });
    const b = providerDisabledFixture("instagram", { url: "https://www.instagram.com/x/", limit: 30 });
    expect(a.profile.provider).toBe("provider-disabled");
    expect(a.profile.followerCount).toBe(b.profile.followerCount);
    expect(() => assertProviderDisabledMode()).not.toThrow();
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    expect(() => assertProviderDisabledMode()).toThrow();
  });
});
