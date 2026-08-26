import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublishingProvider, livePublishingEnabled, livePublishingRuntimeAllowed } from "./provider";

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

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
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

  it.each(["", "unexpected", "TRUE"]) ("keeps the publishing provider disabled for an unsafe disabled flag: %s", (disabledFlag) => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", disabledFlag);

    const provider = createPublishingProvider("instagram", { mediaStorage: {} as never });
    expect(provider.enabled).toBe(false);
  });

  it("keeps the provider disabled when the disabled flag is absent", () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED", "true");
    delete process.env.SOCIALOLLA_PROVIDER_DISABLED;

    const provider = createPublishingProvider("instagram", { mediaStorage: {} as never });
    expect(provider.enabled).toBe(false);
  });

  it("requires an explicit false provider flag to enable publishing", () => {
    expect(livePublishingEnabled({
      NODE_ENV: "staging",
      SOCIALOLLA_ENV: "staging",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    }, true)).toBe(true);
  });
});
