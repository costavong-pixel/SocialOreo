import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/providers/social/provider-guard", () => ({
  providerDisabledEnabled: () => true,
}));

import { loadProfileContext } from "./profile-context";

describe("profile context read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const currentPeriod = new Date().toISOString().slice(0, 7);
    mocks.findUnique.mockResolvedValue({
      id: "db-user-1",
      role: "ADMIN",
      accessPlan: "MONTHLY",
      instagramInsightsConnection: { status: "REAUTH_REQUIRED" },
      workspaces: [{
        label: "Personal workspace",
        defaultLocale: "en-US",
        destinations: [
          { platform: "instagram", status: "CONNECTED" },
          { platform: "tiktok", status: "REAUTH_REQUIRED" },
        ],
        entitlementSnapshots: [{ planVersion: { name: "SocialOlla Monthly" } }],
        creditBatches: [
          { kind: "MONTHLY", remaining: 5, periodKey: currentPeriod, expiresAt: null },
          { kind: "PURCHASED", remaining: 4, periodKey: null, expiresAt: null },
          { kind: "PURCHASED", remaining: 20, periodKey: null, expiresAt: new Date("2020-01-01T00:00:00Z") },
        ],
      }],
    });
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
  });

  it("uses DB role, workspace-owned canonical credits, and connection status", async () => {
    const context = await loadProfileContext({
      id: "auth-sub-1",
      email: "owner@example.com",
      emailVerified: true,
      displayName: "Owner",
    }, "db-user-1");

    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "db-user-1" } }));
    expect(context.role).toBe("ADMIN");
    expect(context.plan).toBe("SocialOlla Monthly");
    expect(context.creditBalance).toBe(9);
    expect(context.connections).toEqual([
      { platform: "Instagram", status: "Connected" },
      { platform: "TikTok", status: "Needs reconnect" },
    ]);
    expect(context.environment).toBe("Staging");
    expect(context.providerMode).toBe("Disabled");
  });

  it("reads an unverified session by its own subject without creating account state", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: "db-user-2",
      role: "USER",
      accessPlan: "NONE",
      instagramInsightsConnection: null,
      workspaces: [],
    });

    const context = await loadProfileContext({
      id: "auth-sub-2",
      email: "unverified@example.com",
      emailVerified: false,
    });

    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: "auth-sub-2" } }));
    expect(context.emailVerified).toBe(false);
    expect(context.role).toBe("USER");
    expect(context.workspaceLabel).toBeNull();
  });
});
