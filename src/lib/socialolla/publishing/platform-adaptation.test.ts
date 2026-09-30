import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLISHING_PLATFORMS,
  adaptPostContent,
  allPlatformCapabilities,
  platformCapabilities,
  platformFlagName,
} from "./platform-adaptation";
import { createPublishingProvider } from "./provider";

describe("ten-platform publishing registry", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("contains one capability record for every core platform", () => {
    expect(allPlatformCapabilities()).toHaveLength(10);
    expect(allPlatformCapabilities().map((item) => item.platform)).toEqual([...PUBLISHING_PLATFORMS]);
    for (const platform of PUBLISHING_PLATFORMS) {
      const capabilities = platformCapabilities(platform);
      expect(capabilities?.platform).toBe(platform);
      expect(capabilities?.requiredScopes.length).toBeGreaterThan(0);
      expect(platformFlagName(platform)).toMatch(/^SOCIALOLLA_[A-Z_]+_PUBLISH_ENABLED$/);
    }
  });

  it("adapts one shared concept without silently dropping a title", () => {
    const content = { title: "Launch", text: "A useful update", hashtags: ["#social"], cta: "Learn more", mediaAssetIds: [] };
    expect(adaptPostContent("instagram", content)).toMatchObject({ title: "", text: "Launch\n\nA useful update\n\n#social\n\nLearn more" });
    expect(adaptPostContent("youtube", content)).toMatchObject({ title: "Launch", text: "A useful update\n\n#social\n\nLearn more" });
  });

  it("rejects content beyond platform limits and unsupported media", () => {
    expect(() => adaptPostContent("x", { title: "", text: "x".repeat(281), hashtags: [], mediaAssetIds: [] })).toThrow(/280/);
    expect(() => adaptPostContent("reddit", { title: "Thread", text: "Body", hashtags: [], mediaAssetIds: ["asset_1"] })).toThrow(/media is not supported/);
  });

  it("creates one shared provider contract per platform without enabling TikTok transport", () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    for (const platform of PUBLISHING_PLATFORMS) {
      vi.stubEnv(platformFlagName(platform), "true");
      const provider = createPublishingProvider(platform, { mediaStorage: {} as never, fetcher: vi.fn() });
      expect(provider.platform).toBe(platform);
      expect(provider.capabilities.platform).toBe(platform);
      expect(provider.enabled).toBe(platform !== "tiktok");
      vi.stubEnv(platformFlagName(platform), "false");
    }
  });
});
