import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: { findUnique: vi.fn() },
    workspace: { findUnique: vi.fn(), create: vi.fn() },
    entitlementSnapshot: { findFirst: vi.fn() },
    creditBatch: { findMany: vi.fn() },
    auditEvent: { create: vi.fn(), findMany: vi.fn() },
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const WORKSPACE_ROW = {
  id: "ws-internal-1",
  externalId: "wsp_admin00000000000",
  ownerUserId: "user-1",
  label: "Personal workspace",
  defaultLocale: "en-US",
  provider: "PERSONAL",
  createdAt: new Date("2026-08-04T00:00:00Z"),
};

describe("Slice H — admin plane guards and audit (SECURITY-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-1", role: "ADMIN" });
    mocks.prisma.workspace.findUnique.mockResolvedValue(WORKSPACE_ROW);
    mocks.prisma.entitlementSnapshot.findFirst.mockResolvedValue({ externalId: "ent_x" });
    mocks.prisma.creditBatch.findMany.mockResolvedValue([]);
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "evt-1" });
    mocks.prisma.auditEvent.findMany.mockResolvedValue([]);
  });

  it("adminInspectEntitlement throws for a non-admin caller", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER" });
    const { adminInspectEntitlement } = await import("./admin-actions");
    await expect(adminInspectEntitlement("user-2")).rejects.toThrow("Admin role required");
    expect(mocks.prisma.workspace.findUnique).not.toHaveBeenCalled();
  });

  it("adminInspectEntitlement returns the caller workspace for an admin", async () => {
    const { adminInspectEntitlement } = await import("./admin-actions");
    const result = await adminInspectEntitlement("user-1");
    expect(result.workspaceId).toBe("wsp_admin00000000000");
  });

  it("adminAuditEvents throws for a non-admin caller", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER" });
    const { adminAuditEvents } = await import("./admin-actions");
    await expect(adminAuditEvents("user-2")).rejects.toThrow("Admin role required");
    expect(mocks.prisma.auditEvent.findMany).not.toHaveBeenCalled();
  });

  it("adminSetLifetimePriceCents requires admin and writes an audit event with old/new price", async () => {
    vi.stubEnv("SOCIALOLLA_LIFETIME_PRICE_CENTS", "7900");
    const { adminSetLifetimePriceCents } = await import("./admin-actions");
    const updated = await adminSetLifetimePriceCents("user-1", 9900);
    expect(updated.priceCents).toBe(9900);
    const event = mocks.prisma.auditEvent.create.mock.calls[0][0].data;
    expect(event.eventType).toBe("ADMIN_SET_LIFETIME_PRICE");
    expect(event.workspaceId).toBe("ws-internal-1");
    expect(event.actorAuthUserId).toBe("user-1");
    expect(event.payload).toEqual({ oldPriceCents: 7900, newPriceCents: 9900 });
  });

  it("adminSetLifetimePriceCents throws for a non-admin caller and writes no audit event", async () => {
    vi.stubEnv("SOCIALOLLA_LIFETIME_PRICE_CENTS", "7900");
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-2", role: "USER" });
    const { adminSetLifetimePriceCents } = await import("./admin-actions");
    await expect(adminSetLifetimePriceCents("user-2", 9900)).rejects.toThrow("Admin role required");
    expect(mocks.prisma.auditEvent.create).not.toHaveBeenCalled();
    expect(process.env.SOCIALOLLA_LIFETIME_PRICE_CENTS).toBe("7900");
  });
});
