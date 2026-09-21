import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialPlatform } from "./types";
import { createApifyInstagramProvider } from "./apify-instagram-provider";
import { createApifyTikTokProvider } from "./apify-tiktok-provider";
import { liveSocialAuditRuntimeAllowed, productionWatchProviderEnabled, providerDisabledEnabled, providerDisabledFixture } from "./provider-guard";
import { SocialProviderError } from "./types";

export type SocialProviderRuntime = "default" | "production-watch-worker";

export async function fetchSocialAudit(
  platform: SocialPlatform,
  input: FetchSocialAuditInput,
  options: { runtime?: SocialProviderRuntime } = {},
): Promise<NormalizedSocialAuditResult> {
  const exactProductionRuntime = process.env.NODE_ENV === "production" && process.env.SOCIALOLLA_ENV === "production";
  if (exactProductionRuntime && platform === "tiktok") {
    throw new Error("TikTok production provider execution is disabled.");
  }

  // The fixture remains the default path. Live providers are constructed only
  // after both the explicit fixture opt-out and the exact staging boundary
  // pass, so every caller (Watch, audits, future workers) shares one gate.
  if (providerDisabledEnabled()) {
    return providerDisabledFixture(platform, input);
  }

  const productionWatchRuntime = options.runtime === "production-watch-worker" && productionWatchProviderEnabled();
  if (!liveSocialAuditRuntimeAllowed()) {
    if (!productionWatchRuntime) {
      throw new Error("Live provider calls are disabled outside the exact staging runtime.");
    }
  }

  if (platform === "instagram") return createApifyInstagramProvider().fetchAudit(input);
  if (platform === "tiktok") return createApifyTikTokProvider().fetchAudit(input);

  throw new SocialProviderError(
    `No live social provider is configured for ${platform}.`,
    "This platform is not available for Watch yet.",
  );
}
