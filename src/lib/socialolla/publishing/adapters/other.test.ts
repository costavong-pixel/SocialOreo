import { afterEach, describe, expect, it, vi } from "vitest";
import { platformCapabilities } from "../platform-adaptation";
import type { PlatformMediaContext, PlatformPublishContext } from "../platform-provider";
import { otherPlatformAdapters } from "./other";

function context(platform: "linkedin" | "tiktok" | "pinterest" | "x" | "reddit", media: readonly PlatformMediaContext[] = []): PlatformPublishContext {
  const providerRequestState = { started: false, completed: false };
  return {
    input: {
      workspaceId: "workspace-1",
      destinationExternalId: "dst-1",
      platform,
      variant: { id: "variant-1", postId: "post-1", platform, content: { text: "Launch from SocialOlla", mediaAssetIds: [] } },
    },
    capabilities: platformCapabilities(platform)!,
    destination: { id: "db-1", externalId: "dst-1", platformUserId: platform === "reddit" ? "r/socialolla" : "provider-user", scopes: [], accessTokenExpiresAt: null },
    accessToken: "redacted-token",
    media,
    storage: { read: vi.fn(async () => Buffer.from("media")), put: vi.fn(), createControlledReadGrant: vi.fn() } as unknown as PlatformPublishContext["storage"],
    beforeProviderRequest: vi.fn(async () => { providerRequestState.started = true; }),
    providerRequestState,
    sleep: vi.fn(async () => undefined),
  };
}

const image: PlatformMediaContext = {
  descriptor: { assetId: "image-1", ownerWorkspaceId: "workspace-1", kind: "image", mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: 5, originalName: "image.jpg", storageKey: "media/workspace-1/image-1" },
  grant: "https://app.test/media/image-1",
};

const video: PlatformMediaContext = {
  descriptor: { assetId: "video-1", ownerWorkspaceId: "workspace-1", kind: "video", mimeType: "video/mp4", detectedMimeType: "video/mp4", sizeBytes: 5, originalName: "video.mp4", storageKey: "media/workspace-1/video-1" },
  grant: "https://app.test/media/video-1",
};

describe("other Post adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("publishes a LinkedIn text post and normalizes the REST header receipt", async () => {
    const response = new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:post_1" } });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await otherPlatformAdapters.linkedin.publish(context("linkedin"));
    expect(result).toMatchObject({ provider: "linkedin", externalId: "urn:li:share:post_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.linkedin.com/rest/posts");
  });

  it("uploads a LinkedIn image before creating its post", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: { uploadUrl: "https://upload.linkedin.test/image", image: "urn:li:image:1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 201 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:post_2" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await otherPlatformAdapters.linkedin.publish(context("linkedin", [image]));
    expect(result.externalId).toBe("urn:li:share:post_2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("initializeUpload");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://upload.linkedin.test/image");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.linkedin.com/rest/posts");
  });

  it("waits for TikTok processing before returning a receipt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publish_id: "tiktok-publish-1" }, error: { code: "ok", message: "" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok", message: "" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [] }, error: { code: "ok", message: "" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("tiktok", [video]);
    const result = await otherPlatformAdapters.tiktok.publish(input);
    expect(result).toMatchObject({ provider: "tiktok-content-posting", externalId: "tiktok-publish-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(input.sleep).toHaveBeenCalledWith(5_000);
  });

  it("classifies a TikTok failed status without leaking provider details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { publish_id: "tiktok-publish-2" }, error: { code: "ok", message: "" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "FAILED", fail_reason: "picture_size_check_failed" }, error: { code: "ok", message: "" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(otherPlatformAdapters.tiktok.publish(context("tiktok", [image]))).rejects.toMatchObject({ retryable: false, reconciliationRequired: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates an image Pin on the selected Pinterest board", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pin-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await otherPlatformAdapters.pinterest.publish(context("pinterest", [image]));
    expect(result).toMatchObject({ provider: "pinterest", externalId: "pin-1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.pinterest.com/v5/pins");
  });

  it("publishes a text-only X post through API v2", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "tweet-1", text: "Launch from SocialOlla" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await otherPlatformAdapters.x.publish(context("x"));
    expect(result).toMatchObject({ provider: "x-api", externalId: "tweet-1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.com/2/tweets");
  });

  it("submits a Reddit self post to the selected subreddit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ json: { data: { name: "t3_post_1", url: "https://reddit.test/r/socialolla/post_1" }, errors: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await otherPlatformAdapters.reddit.publish(context("reddit"));
    expect(result).toMatchObject({ provider: "reddit-api", externalId: "t3_post_1" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://oauth.reddit.com/api/submit");
  });

  it("rejects media that the current Pinterest and X adapters do not claim to support", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(otherPlatformAdapters.pinterest.publish(context("pinterest", [video]))).rejects.toThrow("one owned image");
    await expect(otherPlatformAdapters.x.publish(context("x", [image]))).rejects.toThrow("OAuth 1.0a");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
