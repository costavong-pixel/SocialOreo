import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destinationFindFirst: vi.fn(),
  decryptToken: vi.fn(),
  mediaGrant: vi.fn(),
  adapterPublish: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    destination: { findFirst: (...args: unknown[]) => mocks.destinationFindFirst(...args) },
  },
}));

vi.mock("@/lib/instagram-insights/token-crypto", () => ({
  decryptInstagramToken: (...args: unknown[]) => mocks.decryptToken(...args),
}));

import { createPlatformPublishingProvider, type PlatformAdapter } from "./platform-provider";

describe("platform provider publish-time gate", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_FACEBOOK_PUBLISH_ENABLED", "true");
    vi.clearAllMocks();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rechecks the complete gate before token, media, or provider work", async () => {
    const adapter: PlatformAdapter = {
      platform: "facebook",
      provider: "meta-pages",
      publish: mocks.adapterPublish,
    };
    const storage = {
      createControlledReadGrant: mocks.mediaGrant,
      read: vi.fn(),
    } as never;

    const provider = createPlatformPublishingProvider(adapter, storage);
    expect(provider.enabled).toBe(true);

    vi.stubEnv("SOCIALOLLA_FACEBOOK_PUBLISH_ENABLED", "false");

    await expect(provider.publish({} as never)).rejects.toThrow("Live publishing is disabled for facebook; no provider request was made.");
    expect(mocks.destinationFindFirst).not.toHaveBeenCalled();
    expect(mocks.decryptToken).not.toHaveBeenCalled();
    expect(mocks.mediaGrant).not.toHaveBeenCalled();
    expect(mocks.adapterPublish).not.toHaveBeenCalled();
  });
});
