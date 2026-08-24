import type { PostVariant, ProviderReceipt } from "./contracts";
import { platformCapabilities, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";

export type PublishProviderInput = Readonly<{ workspaceId: string; destinationExternalId: string; platform: PublishingPlatform; variant: PostVariant }>;

export interface PublishProvider {
  readonly platform: PublishingPlatform;
  readonly capabilities: PlatformCapabilities;
  readonly enabled: boolean;
  publish(input: PublishProviderInput): Promise<ProviderReceipt>;
}

export class PublishingProviderDisabledError extends Error {
  constructor(platform: string) {
    super(`Live publishing is disabled for ${platform}; no provider request was made.`);
    this.name = "PublishingProviderDisabledError";
  }
}

export function createPublishingProvider(platform: string, options: { mediaStorage?: PrivateMediaStorage } = {}): PublishProvider {
  const capabilities = platformCapabilities(platform);
  if (!capabilities || platform !== "instagram") throw new Error(`No publishing provider contract exists for ${platform}`);
  if (options.mediaStorage && process.env.SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED === "true" && process.env.SOCIALOLLA_PROVIDER_DISABLED !== "true") {
    const { createInstagramPublishingProvider } = require("./instagram-provider") as typeof import("./instagram-provider");
    return createInstagramPublishingProvider(options.mediaStorage);
  }
  return { platform: "instagram", capabilities, enabled: false, async publish() { throw new PublishingProviderDisabledError("instagram"); } };
}
