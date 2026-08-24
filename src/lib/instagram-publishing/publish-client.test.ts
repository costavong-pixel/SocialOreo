import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstagramImageContainer, InstagramPublishError, publishInstagramImage } from "./publish-client";

describe("Instagram publishing transport", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not fetch arbitrary user URLs", async () => {
    vi.stubEnv("APP_URL", "https://staging.example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createInstagramImageContainer({ graphVersion: "v25.0", userId: "ig_1", accessToken: "secret", controlledMediaUrl: "https://evil.example/image.jpg" })).rejects.toThrow("approved application media endpoint");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the container then media_publish and returns the provider post id", async () => {
    vi.stubEnv("APP_URL", "https://staging.example.com");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "media_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const receipt = await publishInstagramImage({ graphVersion: "v25.0", userId: "ig_1", accessToken: "secret", controlledMediaUrl: "https://staging.example.com/api/media/med_1?expires=1&signature=s", caption: "hello" });
    expect(receipt.externalId).toBe("media_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/ig_1/media");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/ig_1/media_publish");
  });

  it("marks ambiguous transport failures for reconciliation instead of blind duplicate retry", async () => {
    vi.stubEnv("APP_URL", "https://staging.example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    const failure = await publishInstagramImage({ graphVersion: "v25.0", userId: "ig_1", accessToken: "secret", controlledMediaUrl: "https://staging.example.com/api/media/med_1?expires=1&signature=s" }).catch((error) => error);
    expect(failure).toBeInstanceOf(InstagramPublishError);
    expect(failure.reconciliationRequired).toBe(true);
    expect(failure.retryable).toBe(true);
  });
});
