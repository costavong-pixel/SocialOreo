import { createApifyInstagramProvider } from "./apify-instagram-provider";
import { createApifyTikTokProvider } from "./apify-tiktok-provider";
import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialPlatform, SocialProviderAdapter } from "./types";

function getInstagramProvider(): SocialProviderAdapter {
  const configuredProvider = process.env.SOCIAL_PROVIDER_INSTAGRAM ?? "apify";

  if (configuredProvider !== "apify") {
    throw new Error(`Unsupported Instagram provider: ${configuredProvider}`);
  }

  return createApifyInstagramProvider();
}

function getTikTokProvider(): SocialProviderAdapter {
  const configuredProvider = process.env.SOCIAL_PROVIDER_TIKTOK ?? "apify";
  if (configuredProvider !== "apify") {
    throw new Error(`Unsupported TikTok provider: ${configuredProvider}`);
  }
  return createApifyTikTokProvider();
}

export async function fetchSocialAudit(
  platform: SocialPlatform,
  input: FetchSocialAuditInput,
): Promise<NormalizedSocialAuditResult> {
  if (platform === "instagram") {
    return getInstagramProvider().fetchAudit(input);
  }

  if (platform === "tiktok") {
    return getTikTokProvider().fetchAudit(input);
  }

  throw new Error(`Platform is not implemented in Phase 1: ${platform}`);
}
