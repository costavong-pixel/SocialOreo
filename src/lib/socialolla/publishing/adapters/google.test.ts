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
    providerRequestState: { started: false, completed: false },
    sleep: vi.fn(async () => undefined),
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

  it("uploads one owned video to YouTube and normalizes the receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "video_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("youtube", [{ descriptor: { assetId: "video-1", ownerWorkspaceId: "workspace-1", kind: "video", mimeType: "video/mp4", detectedMimeType: "video/mp4", sizeBytes: 10, originalName: "clip.mp4", storageKey: "media/workspace-1/video-1" }, grant: "https://app.test/media/video-1" }]);
    input.storage.read = vi.fn(async () => Buffer.from("video"));
    const result = await googlePlatformAdapters.youtube.publish(input);
    expect(result).toMatchObject({ provider: "youtube-data-api", externalId: "video_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("upload/youtube/v3/videos");
  });
});
