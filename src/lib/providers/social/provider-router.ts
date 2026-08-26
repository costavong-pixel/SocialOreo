import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialPlatform } from "./types";
import { createApifyInstagramProvider } from "./apify-instagram-provider";
import { createApifyTikTokProvider } from "./apify-tiktok-provider";
import { liveSocialAuditRuntimeAllowed, providerDisabledEnabled, providerDisabledFixture } from "./provider-guard";
import { SocialProviderError } from "./types";

export async function fetchSocialAudit(
  platform: SocialPlatform,
  input: FetchSocialAuditInput,
): Promise<NormalizedSocialAuditResult> {
  // The fixture remains the default path. Live providers are constructed only
  // after both the explicit fixture opt-out and the exact staging boundary
  // pass, so every caller (Watch, audits, future workers) shares one gate.
  if (providerDisabledEnabled()) {
    return providerDisabledFixture(platform, input);
  }

  if (!liveSocialAuditRuntimeAllowed()) {
    throw new Error("Live provider calls are disabled outside the exact staging runtime.");
  }

  if (platform === "instagram") return createApifyInstagramProvider().fetchAudit(input);
  if (platform === "tiktok") return createApifyTikTokProvider().fetchAudit(input);

  throw new SocialProviderError(
    `No live social provider is configured for ${platform}.`,
    "This platform is not available for Watch yet.",
  );
}
