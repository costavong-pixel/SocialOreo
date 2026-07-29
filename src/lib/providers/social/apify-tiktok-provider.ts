import { runApifyActor } from "./apify-client";
import { normalizeApifyTikTokPayload } from "./normalize-apify-tiktok";
import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialProviderAdapter } from "./types";
import { SocialProviderError } from "./types";

const DEFAULT_POST_LIMIT = 30;
// Conservative public list pricing: $0.001 start + up to $0.0037/result.
const ACTOR_START_COST_USD = 0.001;
const MAX_RESULT_COST_USD = 0.0037;

function usernameFromUrl(value: string): string | undefined {
  return value.match(/tiktok\.com\/@([^/?#]+)/i)?.[1];
}

export function createApifyTikTokProvider(): SocialProviderAdapter {
  return {
    async fetchAudit(input: FetchSocialAuditInput): Promise<NormalizedSocialAuditResult> {
      const token = process.env.APIFY_API_TOKEN;
      const actorId = process.env.APIFY_TIKTOK_ACTOR_ID;
      const username = usernameFromUrl(input.url);

      if (!token || !actorId || !username) {
        throw new SocialProviderError("Missing Apify TikTok configuration.");
      }

      try {
        const limit = input.limit > 0 ? input.limit : DEFAULT_POST_LIMIT;
        const { items } = await runApifyActor({
          token,
          actorId,
          input: {
            profiles: [username],
            resultsPerPage: limit,
            profileScrapeSections: ["videos"],
            commentsPerPost: 0,
            topLevelCommentsPerPost: 0,
            maxRepliesPerComment: 0,
            shouldDownloadVideos: false,
            shouldDownloadCovers: false,
            shouldDownloadSlideshowImages: false,
            shouldDownloadSubtitles: false,
          },
        });

        return normalizeApifyTikTokPayload(items, input.url, limit);
      } catch (error) {
        if (error instanceof SocialProviderError) throw error;
        const message = error instanceof Error ? error.message : "Unknown Apify error";
        throw new SocialProviderError(message);
      }
    },
  };
}

export function estimateApifyTikTokCost(resultLimit: number): number {
  return Number((ACTOR_START_COST_USD + Math.max(1, resultLimit) * MAX_RESULT_COST_USD).toFixed(4));
}
