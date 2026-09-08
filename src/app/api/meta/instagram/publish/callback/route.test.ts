import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAcceptedSessionUser, mockInstagramPublishingOAuthEnabled } = vi.hoisted(() => ({
  mockGetAcceptedSessionUser: vi.fn(),
  mockInstagramPublishingOAuthEnabled: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/auth/current-user", () => ({ getAcceptedSessionUser: (...args: unknown[]) => mockGetAcceptedSessionUser(...args) }));
vi.mock("@/lib/auth/sync-user", () => ({ isAuthIdentityCollisionError: vi.fn(), syncUserFromAuth0: vi.fn() }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: vi.fn() }));
vi.mock("@/lib/instagram-insights/oauth", () => ({ verifyInstagramOAuthState: vi.fn() }));
vi.mock("@/lib/instagram-insights/token-crypto", () => ({ encryptInstagramToken: vi.fn() }));
vi.mock("@/lib/instagram-publishing/client", () => ({ assertProfessionalAccount: vi.fn(), exchangeInstagramPublishingAuthorizationCode: vi.fn(), getInstagramPublishingProfile: vi.fn(), verifyInstagramPublishingEligibility: vi.fn() }));
vi.mock("@/lib/instagram-publishing/config", () => ({ getInstagramPublishingConfig: vi.fn(), INSTAGRAM_PUBLISHING_SCOPES: ["instagram_business_basic", "instagram_business_content_publish"] }));
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
});
