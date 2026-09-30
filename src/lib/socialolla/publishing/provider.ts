import type { PostVariant, ProviderReceipt } from "./contracts";
import { platformCapabilities, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { postPublishingEnabled, postWorkerRuntimeAllowed } from "./gates";

export type PublishProviderInput = Readonly<{
  workspaceId: string;
  destinationExternalId: string;
  platform: PublishingPlatform;
  variant: PostVariant;
  /** Called only after provider preflight and immediately before the external request. */
  onProviderRequestStart?: () => Promise<boolean>;
}>;

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

export class PublishingProviderClaimLostError extends Error {
  constructor() {
    super("Publish job ownership was lost before the provider request.");
    this.name = "PublishingProviderClaimLostError";
  }
}

/** The worker gate is required for production publishing; provider opt-ins remain separate. */
export function livePublishingRuntimeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return postWorkerRuntimeAllowed(env);
}

export function livePublishingEnabled(env: Record<string, string | undefined> = process.env, hasMediaStorage: boolean): boolean {
  return postPublishingEnabled("instagram", env, hasMediaStorage);
}

/**
 * OAuth is an externally mutating capability too: connecting an account
 * exchanges a code and stores a token. Keep its boundary server-side rather
 * than relying on the Connections page hiding the link.
 */
export function instagramPublishingOAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return postPublishingEnabled("instagram", env, true);
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
