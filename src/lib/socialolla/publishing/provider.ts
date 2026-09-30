import type { PostVariant, ProviderReceipt } from "./contracts";
import { platformCapabilities, platformFlagName, isPublishingPlatform, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { createInstagramPublishingProvider } from "./instagram-provider";
import { createFacebookPublishingProvider } from "./facebook-provider";
import { createThreadsPublishingProvider } from "./threads-provider";
import { createGoogleBusinessPublishingProvider } from "./google-business-provider";
import { createLinkedInPublishingProvider } from "./linkedin-provider";
import { createTikTokPublishingProvider } from "./tiktok-provider";
import { createYouTubePublishingProvider } from "./youtube-provider";
import { createPinterestPublishingProvider } from "./pinterest-provider";
import { createXPublishingProvider } from "./x-provider";
import { createRedditPublishingProvider } from "./reddit-provider";

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

function isStagingRuntime(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV?.trim().toLowerCase() === "staging" && env.SOCIALOLLA_ENV?.trim().toLowerCase() === "staging";
}

function isExactProductionRuntime(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production" && env.SOCIALOLLA_ENV === "production";
}

/** The worker gate is required for production publishing; provider opt-ins remain separate. */
export function livePublishingRuntimeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (isStagingRuntime(env)) return true;
  return isExactProductionRuntime(env) && env.SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED === "true";
}

export function livePublishingEnabled(env: Record<string, string | undefined> = process.env, hasMediaStorage: boolean): boolean {
  return hasMediaStorage && postPublishingEnabled("instagram", env);
}

/** Provider failures preserve retry/permanence and request-boundary ambiguity. */
export class PublishingProviderRequestError extends Error {
  readonly retryable: boolean;
  readonly reconciliationRequired: boolean;

  constructor(message: string, options: { retryable: boolean; reconciliationRequired: boolean }) {
    super(message);
    this.name = "PublishingProviderRequestError";
    this.retryable = options.retryable;
    this.reconciliationRequired = options.reconciliationRequired;
  }
}

/**
 * Every Post platform has its own explicit opt-in. Production also requires
 * the exact Post worker gate, while staging keeps its existing exact staging
 * boundary. Provider-disabled remains the safe default in both runtimes.
 */
export function postPublishingEnabled(platform: PublishingPlatform, env: Record<string, string | undefined> = process.env): boolean {
  return livePublishingRuntimeAllowed(env)
    && env[platformFlagName(platform)] === "true"
    && !providerDisabledEnabled(env);
}

/**
 * OAuth is an externally mutating capability too: connecting an account
 * exchanges a code and stores a token. Keep its boundary server-side rather
 * than relying on the Connections page hiding the link.
 */
export function instagramPublishingOAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return postPublishingEnabled("instagram", env);
}

export function createPublishingProvider(platform: string, options: { mediaStorage?: PrivateMediaStorage; fetcher?: typeof fetch } = {}): PublishProvider {
  const capabilities = platformCapabilities(platform);
  if (!capabilities || !isPublishingPlatform(platform)) throw new Error(`No publishing provider contract exists for ${platform}`);
  if (options.mediaStorage && postPublishingEnabled(platform, process.env)) {
    switch (platform) {
      case "instagram": {
        return createInstagramPublishingProvider(options.mediaStorage);
      }
      case "facebook": {
        return createFacebookPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "threads": {
        return createThreadsPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "google_business": {
        return createGoogleBusinessPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "linkedin": {
        return createLinkedInPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "tiktok": {
        return createTikTokPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "youtube": {
        return createYouTubePublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "pinterest": {
        return createPinterestPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "x": {
        return createXPublishingProvider(options.mediaStorage, options.fetcher);
      }
      case "reddit": {
        return createRedditPublishingProvider(options.mediaStorage, options.fetcher);
      }
    }
  }
  return { platform, capabilities, enabled: false, async publish() { throw new PublishingProviderDisabledError(platform); } };
}
