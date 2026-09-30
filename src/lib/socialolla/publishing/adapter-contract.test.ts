import { createCipheriv, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ destination: vi.fn(), media: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { destination: { findFirst: mocks.destination }, mediaAsset: { findFirst: mocks.media } } }));

import { createPublishingProvider } from "./provider";
import { platformCapabilities, platformFlagName } from "./platform-adaptation";

function encryptedToken(): string {
  const key = Buffer.alloc(32, 7);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update("test-token", "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

describe("shared platform adapter contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_DESTINATION_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    mocks.destination.mockImplementation(async (args: { where: { platform: string } }) => {
      const platform = args.where.platform as any;
      const capabilities = platformCapabilities(platform);
      return { externalId: "dst_1", platform, platformUserId: "account_1", providerDisabled: false, status: "CONNECTED", accessTokenCiphertext: encryptedToken(), accessTokenExpiresAt: null, publishingEligibilityVerifiedAt: new Date(), scopes: capabilities?.requiredScopes ?? [], workspace: { externalId: "workspace_1" } };
    });
    mocks.media.mockResolvedValue(null);
  });

  it("supports mocked request/receipt contracts without any live provider call", async () => {
    const cases = ["facebook", "threads", "google_business", "linkedin", "x", "reddit"] as const;
    for (const platform of cases) {
      vi.stubEnv(platformFlagName(platform), "true");
      const responses = platform === "threads"
        ? [new Response(JSON.stringify({ id: "container_1" }), { status: 200 }), new Response(JSON.stringify({ id: "thread_1" }), { status: 200 })]
        : [new Response(JSON.stringify(platform === "reddit" ? { json: { data: { name: "t3_reddit_1" } } } : { id: `${platform}_1` }), { status: 200, headers: platform === "linkedin" ? { "x-restli-id": "urn:li:share:1", "content-type": "application/json" } : { "content-type": "application/json" } })];
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift() ?? new Response("{}", { status: 500 }));
      const provider = createPublishingProvider(platform, { mediaStorage: { createControlledReadGrant: vi.fn(), read: vi.fn() } as never, fetcher });
      const receipt = await provider.publish({ workspaceId: "ws_1", destinationExternalId: "dst_1", platform, variant: { id: "variant_1", postId: "post_1", platform, content: { text: `Hello from ${platform}`, mediaAssetIds: [] } }, onProviderRequestStart: async () => true });
      expect(receipt.provider).toBe(platform);
      expect(receipt.externalId).toBeTruthy();
      expect(fetcher).toHaveBeenCalled();
      vi.stubEnv(platformFlagName(platform), "false");
    }
  });

  it("keeps provider-disabled as the default for every adapter", async () => {
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
    for (const platform of ["facebook", "threads", "google_business", "linkedin", "x", "reddit"] as const) {
      vi.stubEnv(platformFlagName(platform), "true");
      const fetcher = vi.fn<typeof fetch>();
      const provider = createPublishingProvider(platform, { mediaStorage: {} as never, fetcher });
      await expect(provider.publish({} as never)).rejects.toThrow("Live publishing is disabled");
      expect(fetcher).not.toHaveBeenCalled();
      vi.stubEnv(platformFlagName(platform), "false");
    }
  });
});
