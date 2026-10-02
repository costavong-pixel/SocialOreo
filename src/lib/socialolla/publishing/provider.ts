import type { PostVariant, ProviderReceipt } from "./contracts";
import { platformCapabilities, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { instagramConnectionEnabled, postPublishingEnabled, postWorkerRuntimeAllowed } from "./gates";
import { createPlatformPublishingProvider } from "./platform-provider";
import { metaPlatformAdapters } from "./adapters/meta";
import { googlePlatformAdapters } from "./adapters/google";
import { otherPlatformAdapters } from "./adapters/other";
import { PublishingProviderClaimLostError, PublishingProviderDisabledError } from "./provider-errors";

export { PublishingProviderClaimLostError, PublishingProviderDisabledError } from "./provider-errors";

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

/** Instagram account connection does not authorize Instagram publishing. */
export function instagramConnectionOAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return instagramConnectionEnabled(env);
}

export function createPublishingProvider(platform: string, options: { mediaStorage?: PrivateMediaStorage } = {}): PublishProvider {
  const normalizedPlatform = platform.trim().toLowerCase();
  const capabilities = platformCapabilities(normalizedPlatform);
  if (!capabilities) throw new Error(`No publishing provider contract exists for ${platform}`);
  if (normalizedPlatform === "instagram" && options.mediaStorage && livePublishingEnabled(process.env, true)) {
    const { createInstagramPublishingProvider } = require("./instagram-provider") as typeof import("./instagram-provider");
    return createInstagramPublishingProvider(options.mediaStorage);
  }
  const adapter = ({
    instagram: null,
    facebook: metaPlatformAdapters.facebook,
    threads: metaPlatformAdapters.threads,
    google_business: googlePlatformAdapters.googleBusiness,
    youtube: googlePlatformAdapters.youtube,
    linkedin: otherPlatformAdapters.linkedin,
    tiktok: otherPlatformAdapters.tiktok,
    pinterest: otherPlatformAdapters.pinterest,
    x: otherPlatformAdapters.x,
    reddit: otherPlatformAdapters.reddit,
  } as const)[capabilities.platform] ?? null;
  // TikTok direct posting stays hard-disabled until the integration can prove
  // creator-info/privacy controls and durable verified media URLs required by
  // the Content Posting API. The adapter remains contract-tested, but a live
  // factory can never cross its provider boundary yet.
  if (adapter && options.mediaStorage && capabilities.platform !== "tiktok") return createPlatformPublishingProvider(adapter, options.mediaStorage);
  return {
    platform: capabilities.platform,
    capabilities,
    enabled: false,
    async publish() {
      throw new PublishingProviderDisabledError(capabilities.platform);
    },
  };
}
