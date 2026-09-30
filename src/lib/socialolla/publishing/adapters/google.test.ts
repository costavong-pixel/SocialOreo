import { afterEach, describe, expect, it, vi } from "vitest";
import { googlePlatformAdapters } from "./google";
import { platformCapabilities } from "../platform-adaptation";
import type { PlatformPublishContext } from "../platform-provider";

function context(platform: "google_business" | "youtube", media: PlatformPublishContext["media"] = []): PlatformPublishContext {
  return {
    input: {
      workspaceId: "workspace-1",
      destinationExternalId: "dst-1",
      platform,
      variant: { id: "variant-1", postId: "post-1", platform, content: { text: "Launch", mediaAssetIds: [] } },
    },
    capabilities: platformCapabilities(platform)!,
    destination: { id: "db-1", externalId: "dst-1", platformUserId: platform === "google_business" ? "accounts/a/locations/l" : "channel-1", scopes: [], accessTokenExpiresAt: null },
    accessToken: "redacted-token",
    media,
    storage: { read: vi.fn(), put: vi.fn(), createControlledReadGrant: vi.fn() } as unknown as PlatformPublishContext["storage"],
    beforeProviderRequest: vi.fn(async () => undefined),
  };
}

describe("Google-family Post adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a Google Business Profile local post request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "accounts/a/locations/l/localPosts/p1", searchUrl: "https://maps.google.com/p1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await googlePlatformAdapters.googleBusiness.publish(context("google_business"));
    expect(result).toMatchObject({ provider: "google-business-profile", externalId: "accounts/a/locations/l/localPosts/p1" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v4/accounts/a/locations/l/localPosts");
  });

  it("fails closed when YouTube has no owned video", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(googlePlatformAdapters.youtube.publish(context("youtube"))).rejects.toThrow("one owned video");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
