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
    providerRequestState: { started: false, completed: false },
    sleep: vi.fn(async () => undefined),
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "thread_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("threads");
    await metaPlatformAdapters.threads.publish(input);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/threads");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("fields=status,error_message");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/threads_publish");
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

  it("requires reconciliation when a Facebook album fails after an earlier upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "photo_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const media = [
      { descriptor: { assetId: "image-1", ownerWorkspaceId: "workspace-1", kind: "image" as const, mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: 10, originalName: "one.jpg", storageKey: "media/workspace-1/image-1" }, grant: "https://app.test/media/image-1" },
      { descriptor: { assetId: "image-2", ownerWorkspaceId: "workspace-1", kind: "image" as const, mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: 10, originalName: "two.jpg", storageKey: "media/workspace-1/image-2" }, grant: "https://app.test/media/image-2" },
    ];
    await expect(metaPlatformAdapters.facebook.publish(context("facebook", media))).rejects.toMatchObject({ reconciliationRequired: true, status: 400 });
  });

  it("requires reconciliation when Threads publishing fails after creating a container", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(metaPlatformAdapters.threads.publish(context("threads"))).rejects.toMatchObject({ reconciliationRequired: true, status: 400 });
  });

  it("polls an in-progress Threads container until it is finished", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "IN_PROGRESS" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "FINISHED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "thread_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = context("threads");
    await metaPlatformAdapters.threads.publish(input);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(input.sleep).toHaveBeenCalledWith(5_000);
    expect(fetchMock.mock.calls[3]?.[0]).toContain("/threads_publish");
  });

  it.each(["ERROR", "EXPIRED"] as const)("does not publish a Threads container in %s state", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(metaPlatformAdapters.threads.publish(context("threads"))).rejects.toMatchObject({ reconciliationRequired: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("threads_publish"))).toBe(false);
  });

  it("fails closed without publishing when Threads readiness exceeds the poll bound", async () => {
    const responses = [new Response(JSON.stringify({ id: "container_1" }), { status: 200 })];
    for (let index = 0; index < 24; index += 1) responses.push(new Response(JSON.stringify({ status: "IN_PROGRESS" }), { status: 200 }));
    const fetchMock = vi.fn();
    for (const response of responses) fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(metaPlatformAdapters.threads.publish(context("threads"))).rejects.toMatchObject({ retryable: true, reconciliationRequired: false });
    expect(fetchMock).toHaveBeenCalledTimes(25);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("threads_publish"))).toBe(false);
  });

  it.each(["PUBLISHED", "UNKNOWN"] as const)("fails closed for an unexpected Threads status %s", async (status) => {
    const reported = status === "UNKNOWN" ? "UNKNOWN" : status;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: reported }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(metaPlatformAdapters.threads.publish(context("threads"))).rejects.toMatchObject({ reconciliationRequired: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("threads_publish"))).toBe(false);
  });
});
