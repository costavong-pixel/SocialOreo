import type { PostVariant, ProviderReceipt } from "./contracts";
import { platformCapabilities, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";

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

/**
 * The recovered publishing slice is a staging acceptance surface. Keep the
 * production runtime as an unconditional deny boundary until production
 * publishing is separately approved and implemented.
 */
export function livePublishingRuntimeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV?.trim().toLowerCase() === "staging" && env.SOCIALOLLA_ENV?.trim().toLowerCase() === "staging";
}

export function livePublishingEnabled(env: Record<string, string | undefined> = process.env, hasMediaStorage: boolean): boolean {
  return hasMediaStorage && livePublishingRuntimeAllowed(env) && env.SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED === "true" && !providerDisabledEnabled(env);
}

/**
 * OAuth is an externally mutating capability too: connecting an account
 * exchanges a code and stores a token. Keep its boundary server-side rather
 * than relying on the Connections page hiding the link.
 */
export function instagramPublishingOAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return livePublishingRuntimeAllowed(env) && env.SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED === "true" && !providerDisabledEnabled(env);
}

export function createPublishingProvider(platform: string, options: { mediaStorage?: PrivateMediaStorage } = {}): PublishProvider {
  const capabilities = platformCapabilities(platform);
  if (!capabilities || platform !== "instagram") throw new Error(`No publishing provider contract exists for ${platform}`);
  if (options.mediaStorage && livePublishingEnabled(process.env, true)) {
    const { createInstagramPublishingProvider } = require("./instagram-provider") as typeof import("./instagram-provider");
    return createInstagramPublishingProvider(options.mediaStorage);
  }
  return { platform: "instagram", capabilities, enabled: false, async publish() { throw new PublishingProviderDisabledError("instagram"); } };
}
