import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDestination: vi.fn(),
  findAsset: vi.fn(),
  updateDestination: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  publish: vi.fn(),
  providerDisabled: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    destination: {
      findFirst: (...args: unknown[]) => mocks.findDestination(...args),
      updateMany: (...args: unknown[]) => mocks.updateDestination(...args),
    },
    mediaAsset: { findFirst: (...args: unknown[]) => mocks.findAsset(...args) },
  },
}));

vi.mock("@/lib/instagram-insights/token-crypto", () => ({
  decryptInstagramToken: (...args: unknown[]) => mocks.decrypt(...args),
  encryptInstagramToken: (...args: unknown[]) => mocks.encrypt(...args),
}));

vi.mock("@/lib/instagram-publishing/config", () => ({
  getInstagramPublishingConfig: () => ({ graphVersion: "v25.0", tokenEncryptionKey: "encryption-key" }),
}));

vi.mock("@/lib/instagram-publishing/client", () => ({
  refreshInstagramPublishingToken: (...args: unknown[]) => mocks.publish(...args),
}));

vi.mock("@/lib/instagram-publishing/publish-client", () => ({
  publishInstagramImage: (...args: unknown[]) => mocks.publish(...args),
}));

vi.mock("@/lib/providers/social/provider-guard", () => ({
  providerDisabledEnabled: () => mocks.providerDisabled(),
}));

vi.mock("./platform-adaptation", () => ({
  platformCapabilities: () => ({
    platform: "instagram",
    media: "image",
    maxMedia: 1,
    supportsScheduling: true,
  }),
}));

const destination = {
  id: "destination-db-id",
  externalId: "dst_instagram",
  platformUserId: "instagram-user",
  accessTokenCiphertext: "ciphertext",
  accessTokenExpiresAt: null,
  publishingEligibilityVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
  scopes: ["instagram_business_basic", "instagram_business_content_publish"],
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  workspace: { externalId: "workspace-external" },
};

const asset = {
  externalId: "asset_image",
  kind: "image",
  mimeType: "image/jpeg",
  detectedMimeType: "image/jpeg",
  sizeBytes: 1024,
  originalName: "launch.jpg",
  storageKey: "private/asset_image",
  status: "READY",
};

describe("Instagram provider request boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    mocks.providerDisabled.mockReturnValue(false);
    mocks.findDestination.mockResolvedValue(destination);
    mocks.findAsset.mockResolvedValue(asset);
    mocks.decrypt.mockReturnValue("access-token");
    mocks.publish.mockResolvedValue({ provider: "instagram", externalId: "media_1", publishedAt: "2026-08-26T00:00:00.000Z" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("marks the request started only after preflight and before the provider call", async () => {
    const events: string[] = [];
    const { createInstagramPublishingProvider } = await import("./instagram-provider");
    const provider = createInstagramPublishingProvider({
      createControlledReadGrant: async () => {
        events.push("grant");
        return { grant: "https://staging.socialolla.com/api/media/asset_image?expires=1&signature=s" };
      },
    });
    const started = vi.fn(async () => {
      events.push("start");
      return true;
    });
    mocks.publish.mockImplementationOnce(async () => {
      events.push("provider");
      return { provider: "instagram", externalId: "media_1", publishedAt: "2026-08-26T00:00:00.000Z" };
    });

    await expect(provider.publish({
      workspaceId: "workspace-db-id",
      destinationExternalId: "dst_instagram",
      platform: "instagram",
      variant: {
        id: "variant-1",
        postId: "post-1",
        platform: "instagram",
        content: { text: "Launch", mediaAssetIds: ["asset_image"] },
      },
      onProviderRequestStart: started,
    })).resolves.toMatchObject({ externalId: "media_1" });

    expect(started).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["grant", "start", "provider"]);
  });

  it("does not mark a request started when preflight rejects the destination", async () => {
    const { createInstagramPublishingProvider } = await import("./instagram-provider");
    const provider = createInstagramPublishingProvider({ createControlledReadGrant: vi.fn() });
    const started = vi.fn(async () => true);
    mocks.findDestination.mockResolvedValue({ ...destination, publishingEligibilityVerifiedAt: null });

    await expect(provider.publish({
      workspaceId: "workspace-db-id",
      destinationExternalId: "dst_instagram",
      platform: "instagram",
      variant: { id: "variant-1", postId: "post-1", platform: "instagram", content: { text: "Launch", mediaAssetIds: ["asset_image"] } },
      onProviderRequestStart: started,
    })).rejects.toThrow("eligibility");

    expect(started).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
