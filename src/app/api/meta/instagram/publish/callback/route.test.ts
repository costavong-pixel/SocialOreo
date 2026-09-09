import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockGetAcceptedSessionUser,
  mockInstagramPublishingOAuthEnabled,
  mockSyncUserFromAuth0,
  mockGetOrCreatePersonalWorkspace,
  mockVerifyInstagramOAuthState,
  mockExchangeInstagramPublishingAuthorizationCode,
  mockGetInstagramPublishingProfile,
  mockEncryptInstagramToken,
  mockGetInstagramPublishingConfig,
  mockPrismaTransaction,
} = vi.hoisted(() => ({
  mockGetAcceptedSessionUser: vi.fn(),
  mockInstagramPublishingOAuthEnabled: vi.fn(),
  mockSyncUserFromAuth0: vi.fn(),
  mockGetOrCreatePersonalWorkspace: vi.fn(),
  mockVerifyInstagramOAuthState: vi.fn(),
  mockExchangeInstagramPublishingAuthorizationCode: vi.fn(),
  mockGetInstagramPublishingProfile: vi.fn(),
  mockEncryptInstagramToken: vi.fn(),
  mockGetInstagramPublishingConfig: vi.fn(),
  mockPrismaTransaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: (...args: unknown[]) => mockPrismaTransaction(...args) } }));
vi.mock("@/lib/auth/current-user", () => ({ getAcceptedSessionUser: (...args: unknown[]) => mockGetAcceptedSessionUser(...args) }));
vi.mock("@/lib/auth/sync-user", () => ({ isAuthIdentityCollisionError: vi.fn(), syncUserFromAuth0: (...args: unknown[]) => mockSyncUserFromAuth0(...args) }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: (...args: unknown[]) => mockGetOrCreatePersonalWorkspace(...args) }));
vi.mock("@/lib/instagram-insights/oauth", () => ({ verifyInstagramOAuthState: (...args: unknown[]) => mockVerifyInstagramOAuthState(...args) }));
vi.mock("@/lib/instagram-insights/token-crypto", () => ({ encryptInstagramToken: (...args: unknown[]) => mockEncryptInstagramToken(...args) }));
vi.mock("@/lib/instagram-publishing/client", () => ({ assertProfessionalAccount: vi.fn(), exchangeInstagramPublishingAuthorizationCode: (...args: unknown[]) => mockExchangeInstagramPublishingAuthorizationCode(...args), getInstagramPublishingProfile: (...args: unknown[]) => mockGetInstagramPublishingProfile(...args), verifyInstagramPublishingEligibility: vi.fn() }));
vi.mock("@/lib/instagram-publishing/config", () => ({ getInstagramPublishingConfig: (...args: unknown[]) => mockGetInstagramPublishingConfig(...args), INSTAGRAM_PUBLISHING_SCOPES: ["instagram_business_basic", "instagram_business_content_publish"] }));
vi.mock("@/lib/socialolla/publishing/provider", () => ({ instagramPublishingOAuthEnabled: (...args: unknown[]) => mockInstagramPublishingOAuthEnabled(...args) }));

import { GET } from "./route";

const originalEnv = { ...process.env };

describe("GET /api/meta/instagram/publish/callback", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("returns failed to the configured public app URL when Next sees a loopback request URL", async () => {
    process.env.APP_URL = "https://staging.socialolla.com";
    mockGetAcceptedSessionUser.mockResolvedValue(null);
    mockInstagramPublishingOAuthEnabled.mockReturnValue(true);

    const response = await GET(new NextRequest("https://localhost:3004/api/meta/instagram/publish/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://staging.socialolla.com/connections?instagram=failed");
    expect(response.headers.get("set-cookie")).toContain("socialoreo_instagram_publish_oauth=");
  });

  it("does not use a revoked entitlement snapshot to authorize another destination", async () => {
    process.env.APP_URL = "https://staging.socialolla.com";
    mockGetAcceptedSessionUser.mockResolvedValue({ id: "auth-user", email: "owner@example.com" });
    mockInstagramPublishingOAuthEnabled.mockReturnValue(true);
    mockGetInstagramPublishingConfig.mockReturnValue({ tokenEncryptionKey: "encryption-key" });
    mockSyncUserFromAuth0.mockResolvedValue({ id: "user-1" });
    mockVerifyInstagramOAuthState.mockReturnValue(true);
    mockGetOrCreatePersonalWorkspace.mockResolvedValue({ dbId: "ws-1" });
    mockExchangeInstagramPublishingAuthorizationCode.mockResolvedValue({ access_token: "token", expires_in: 3600 });
    mockGetInstagramPublishingProfile.mockResolvedValue({ id: "ig-1", username: "owner", account_type: "BUSINESS" });
    mockEncryptInstagramToken.mockReturnValue("ciphertext");

    const tx = {
      destination: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      entitlementSnapshot: { findFirst: vi.fn().mockResolvedValue({ maxDestinations: 3 }) },
    };
    mockPrismaTransaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const response = await GET(new NextRequest("https://staging.socialolla.com/api/meta/instagram/publish/callback?code=code&state=state"));

    expect(response.headers.get("location")).toBe("https://staging.socialolla.com/connections?instagram=connected");
    expect(tx.entitlementSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "ws-1", workspace: { ownerUser: { accessPlan: { in: ["LIFETIME", "MONTHLY"] } } } },
    }));
  });
});
