import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublishingProvider, instagramPublishingOAuthEnabled, livePublishingEnabled, livePublishingRuntimeAllowed } from "./provider";

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

  it("requires the explicit Post worker gate in an exact production runtime", () => {
    const production = { NODE_ENV: "production", SOCIALOLLA_ENV: "production" };
    expect(livePublishingRuntimeAllowed(production)).toBe(false);
    expect(livePublishingRuntimeAllowed({ ...production, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "TRUE" })).toBe(false);
    expect(livePublishingRuntimeAllowed({ ...production, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true " })).toBe(false);
    expect(livePublishingRuntimeAllowed({ ...production, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" })).toBe(true);
    expect(livePublishingRuntimeAllowed({ ...production, NODE_ENV: "Production", SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" })).toBe(false);
    expect(livePublishingRuntimeAllowed({ ...production, SOCIALOLLA_ENV: "production ", SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" })).toBe(false);
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

  it("does not activate Instagram from production or the Post worker gate alone", () => {
    const base = { NODE_ENV: "production", SOCIALOLLA_ENV: "production" };
    expect(livePublishingEnabled(base, true)).toBe(false);
    expect(livePublishingEnabled({ ...base, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" }, true)).toBe(false);
    expect(livePublishingEnabled({
      ...base,
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    }, true)).toBe(false);
  });

  it("requires the worker gate in addition to the separate Instagram provider gates in production", () => {
    const providerGates = {
      NODE_ENV: "production",
      SOCIALOLLA_ENV: "production",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    };
    expect(livePublishingEnabled(providerGates, true)).toBe(false);
    expect(livePublishingEnabled({ ...providerGates, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" }, true)).toBe(true);
    expect(livePublishingEnabled({ ...providerGates, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "TRUE" }, true)).toBe(false);
  });

  it("guards OAuth code exchange with the same staging and provider boundaries", () => {
    const allowed = { NODE_ENV: "staging", SOCIALOLLA_ENV: "staging", SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true", SOCIALOLLA_PROVIDER_DISABLED: "false" };
    expect(instagramPublishingOAuthEnabled(allowed)).toBe(true);
    expect(instagramPublishingOAuthEnabled({ ...allowed, NODE_ENV: "production" })).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...allowed, SOCIALOLLA_ENV: "production" })).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...allowed, SOCIALOLLA_PROVIDER_DISABLED: "true" })).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...allowed, SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "false" })).toBe(false);
  });

  it("requires the exact Post worker and provider gates for production OAuth", () => {
    const providerGates = {
      NODE_ENV: "production",
      SOCIALOLLA_ENV: "production",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    };
    expect(instagramPublishingOAuthEnabled({ NODE_ENV: "production", SOCIALOLLA_ENV: "production" })).toBe(false);
    expect(instagramPublishingOAuthEnabled(providerGates)).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...providerGates, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "TRUE" })).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...providerGates, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true " })).toBe(false);
    expect(instagramPublishingOAuthEnabled({ ...providerGates, SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true" })).toBe(true);
  });
});
