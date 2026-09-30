import { afterEach, describe, expect, it, vi } from "vitest";
import { metaPlatformAdapters } from "./meta";
import { platformCapabilities } from "../platform-adaptation";
import { PlatformPublishingError, providerJsonRequest, type PlatformPublishContext } from "../platform-provider";

function context(platform: "facebook" | "threads", media: PlatformPublishContext["media"] = []): PlatformPublishContext {
  let started = false;
  const boundary = vi.fn(async () => {
    if (started) return;
    started = true;
  });
  return {
    input: {
      workspaceId: "workspace-1",
      destinationExternalId: "dst-1",
      platform,
      variant: { id: "variant-1", postId: "post-1", platform, content: { text: "Launch", mediaAssetIds: [] } },
    },
    capabilities: platformCapabilities(platform)!,
    destination: { id: "db-1", externalId: "dst-1", platformUserId: "provider-user", scopes: [], accessTokenExpiresAt: null },
    accessToken: "redacted-token",
    media,
    storage: {} as PlatformPublishContext["storage"],
    beforeProviderRequest: boundary,
  };
}

describe("Meta Post adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a Facebook Page feed request and normalizes its receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "page_1_42" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await metaPlatformAdapters.facebook.publish(context("facebook"));
    expect(result).toMatchObject({ provider: "facebook", externalId: "page_1_42" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/v25.0/provider-user/feed"), expect.objectContaining({ method: "POST" }));
  });

  it("uses the Facebook video endpoint for one video instead of the photo endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "video_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("facebook", [{ descriptor: { assetId: "video-1", ownerWorkspaceId: "workspace-1", kind: "video", mimeType: "video/mp4", detectedMimeType: "video/mp4", sizeBytes: 10, originalName: "clip.mp4", storageKey: "media/workspace-1/video-1" }, grant: "https://app.test/media/video-1" }]);
    const result = await metaPlatformAdapters.facebook.publish(input);
    expect(result).toMatchObject({ provider: "facebook", externalId: "video_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/videos");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/photos");
  });

  it("publishes a Threads container then uses the publish endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "thread_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("threads");
    await metaPlatformAdapters.threads.publish(input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/threads");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/threads_publish");
  });

  it("classifies a rate-limit response as retryable without reconciliation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(providerJsonRequest(context("facebook"), { url: "https://graph.facebook.com/v25.0/provider-user/feed" }))
      .rejects.toMatchObject({ retryable: true, reconciliationRequired: false, status: 429 });
  });

  it("classifies a server error as reconciliation-required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const result = providerJsonRequest(context("facebook"), { url: "https://graph.facebook.com/v25.0/provider-user/feed" });
    await expect(result).rejects.toBeInstanceOf(PlatformPublishingError);
    await expect(result).rejects.toMatchObject({ retryable: true, reconciliationRequired: true, status: 500 });
  });
});
