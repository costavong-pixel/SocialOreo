import { describe, expect, it } from "vitest";
import { adaptPostVariant, PLATFORM_REGISTRY, PUBLISHING_PLATFORMS, platformCapabilities, platformGateEnvName } from "./platform-adaptation";

describe("canonical Post platform registry", () => {
  it("contains exactly the ten core platforms", () => {
    expect(Object.keys(PLATFORM_REGISTRY).sort()).toEqual([...PUBLISHING_PLATFORMS].sort());
    for (const platform of PUBLISHING_PLATFORMS) {
      expect(platformCapabilities(platform)?.platform).toBe(platform);
      expect(platformGateEnvName(platform)).toBe(`SOCIALOLLA_${platform.toUpperCase()}_PUBLISH_ENABLED`);
    }
  });

  it("describes platform-specific media and destination limits", () => {
    expect(PLATFORM_REGISTRY.instagram.maxMedia).toBe(1);
    expect(PLATFORM_REGISTRY.facebook.multipleImages).toBe(true);
    expect(PLATFORM_REGISTRY.youtube.video).toBe(true);
    expect(PLATFORM_REGISTRY.google_business.destinationType).toBe("LOCATION");
    expect(PLATFORM_REGISTRY.reddit.destinationType).toBe("SUBREDDIT");
  });

  it("returns a clear adaptation result without dropping unsupported fields", () => {
    const result = adaptPostVariant("instagram", {
      title: "A title",
      caption: "A caption",
      link: "https://example.com",
      media: [{ kind: "image", assetId: "asset-1" }, { kind: "image", assetId: "asset-2" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "instagram does not support link attachments for this post type.",
      "instagram accepts at most 1 media item.",
    ]));
    expect(result.warnings).toContain("Title retained in adapted text so no customer content is lost.");
    expect(result.content.text).toContain("A title");
  });

  it("rejects unknown platforms", () => {
    const result = adaptPostVariant("mastodon", { caption: "hello" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported publishing platform");
  });
});

