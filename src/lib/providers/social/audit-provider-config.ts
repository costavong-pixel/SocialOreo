import { estimateApifyInstagramCost } from "./apify-instagram-provider";
import { estimateApifyTikTokCost } from "./apify-tiktok-provider";
import type { SocialPlatform, SocialProvider } from "./types";

export function socialProviderForPlatform(platform: SocialPlatform): SocialProvider {
  if (platform === "instagram") return "apify";
  if (platform === "tiktok") return "apify";
  return "youtube";
}

export function socialProviderEndpoint(platform: SocialPlatform): string {
  if (platform === "instagram") return process.env.APIFY_INSTAGRAM_ACTOR_ID ?? "apify-instagram";
  if (platform === "tiktok") return process.env.APIFY_TIKTOK_ACTOR_ID ?? "clockworks-tiktok-scraper";
  return "youtube-data-api";
}

export function estimateSocialAuditCost(platform: SocialPlatform, resultLimit: number): number {
  if (platform === "instagram") return estimateApifyInstagramCost();
  if (platform === "tiktok") return estimateApifyTikTokCost(resultLimit);
  return 0;
}
