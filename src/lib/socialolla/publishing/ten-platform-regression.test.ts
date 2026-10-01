import { describe, expect, it } from "vitest";

import { CONNECTION_REGISTRY } from "@/lib/socialolla/connections/registry";
import { sanitizeProviderReceipt, derivePublishIdempotencyKey } from "./contracts";
import { createPublishingProvider } from "./provider";
import { adaptPostVariant, PLATFORM_REGISTRY, PUBLISHING_PLATFORMS } from "./platform-adaptation";
import { postPublishingEnabled } from "./gates";

describe("combined ten platform Post regression matrix", () => {
  it("keeps the platform, connection, and provider registries aligned", () => {
    expect(CONNECTION_REGISTRY.map((item) => item.platform)).toEqual([...PUBLISHING_PLATFORMS]);
    for (const platform of PUBLISHING_PLATFORMS) {
      expect(PLATFORM_REGISTRY[platform].platform).toBe(platform);
      expect(PLATFORM_REGISTRY[platform].provider).toBeTruthy();
      expect(CONNECTION_REGISTRY.find((item) => item.platform === platform)?.destinationType)
        .toBe(PLATFORM_REGISTRY[platform].destinationType);
      expect(createPublishingProvider(platform)).toMatchObject({ platform, enabled: false });
    }
  });

  it("keeps every production platform gate fail-closed and independent", () => {
    const base = {
      NODE_ENV: "production",
      SOCIALOLLA_ENV: "production",
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    };
    for (const platform of PUBLISHING_PLATFORMS) {
      const envKey = `SOCIALOLLA_${platform.toUpperCase()}_PUBLISH_ENABLED`;
      expect(postPublishingEnabled(platform, base)).toBe(false);
      expect(postPublishingEnabled(platform, { ...base, [envKey]: "true" })).toBe(true);
      expect(postPublishingEnabled(platform, { ...base, [envKey]: "true", SOCIALOLLA_PROVIDER_DISABLED: "true" })).toBe(false);
      expect(postPublishingEnabled(platform, { ...base, [envKey]: "TRUE" })).toBe(false);
    }
  });

  it("returns explicit adaptation results for valid and unsupported media", () => {
    for (const platform of PUBLISHING_PLATFORMS) {
      const result = adaptPostVariant(platform, { caption: `Post for ${platform}` });
      expect(result.platform).toBe(platform);
      expect(result.ok).toBe(true);
      expect(result.content.text).toContain(platform);
    }
    expect(adaptPostVariant("x", { caption: "text", media: [{ kind: "image", assetId: "image-1" }] })).toMatchObject({ ok: false });
    expect(adaptPostVariant("pinterest", { caption: "video", media: [{ kind: "video", assetId: "video-1" }] })).toMatchObject({ ok: false });
    expect(adaptPostVariant("tiktok", { caption: "carousel", media: [{ kind: "image", assetId: "image-1" }, { kind: "image", assetId: "image-2" }] })).toMatchObject({ ok: false });
    expect(adaptPostVariant("youtube", { title: "A title", caption: "Description", media: [{ kind: "video", assetId: "video-1" }] })).toMatchObject({ ok: true });
  });

  it("sanitizes receipts and derives destination-scoped idempotency keys", () => {
    const receipt = sanitizeProviderReceipt({
      provider: "facebook",
      externalId: "post-1",
      metadata: { accessToken: "secret", safe: "kept", authorization: "Bearer secret" },
    });
    expect(receipt.metadata).toEqual({ safe: "kept" });
    const first = derivePublishIdempotencyKey({ workspaceId: "workspace", postId: "post", destinationId: "destination-a", variantId: "variant-a" });
    const replay = derivePublishIdempotencyKey({ workspaceId: "workspace", postId: "post", destinationId: "destination-a", variantId: "variant-a" });
    const secondDestination = derivePublishIdempotencyKey({ workspaceId: "workspace", postId: "post", destinationId: "destination-b", variantId: "variant-b" });
    expect(replay).toBe(first);
    expect(secondDestination).not.toBe(first);
  });

  it("does not allow a provider-disabled factory to call a provider", async () => {
    const provider = createPublishingProvider("reddit", { mediaStorage: {} as never });
    expect(provider.enabled).toBe(false);
    await expect(provider.publish({} as never)).rejects.toThrow(/disabled/);
  });

});
