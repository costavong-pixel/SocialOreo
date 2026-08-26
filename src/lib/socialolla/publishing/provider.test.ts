import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublishingProvider, livePublishingRuntimeAllowed } from "./provider";

describe("publishing runtime boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows live publishing only in the staging runtime", () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    expect(livePublishingRuntimeAllowed()).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(livePublishingRuntimeAllowed()).toBe(false);

    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    expect(livePublishingRuntimeAllowed()).toBe(false);
  });

  it("cannot enable the provider in a production Node runtime even with positive flags", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");

    const provider = createPublishingProvider("instagram", { mediaStorage: {} as never });
    expect(provider.enabled).toBe(false);
    await expect(provider.publish({} as never)).rejects.toThrow("Live publishing is disabled");
  });
});
