import { TrendSourceType } from "@prisma/client";

import { runApifyActor } from "@/lib/providers/social/apify-client";
import { normalizeApifyInstagramTrendVideos } from "@/lib/providers/social/normalize-apify-instagram";
import type { NormalizedSocialVideo } from "@/lib/providers/social/types";

export const INSTAGRAM_TREND_RESULT_LIMIT = 20;
export const INSTAGRAM_TREND_ESTIMATED_COST_USD = 0.03;

export type InstagramTrendSource = {
  sourceType: TrendSourceType;
  query: string;
};

export class InstagramTrendProviderDisabledError extends Error {
  constructor() {
    super("Instagram Trend Radar is not enabled on this server.");
  }
}

export function isInstagramTrendPilotEnabled() {
  return process.env.TREND_DISCOVERY_ENABLED === "true"
    && Boolean(process.env.APIFY_API_TOKEN)
    && Boolean(process.env.APIFY_INSTAGRAM_TREND_ACTOR_ID);
}

export function buildInstagramTrendActorInput(source: InstagramTrendSource) {
  const base = {
    resultsType: "reels",
    resultsLimit: INSTAGRAM_TREND_RESULT_LIMIT,
    onlyPostsNewerThan: "7 days",
    addParentData: true,
  };

  if (source.sourceType === TrendSourceType.HASHTAG) {
    return { ...base, directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(source.query)}/`] };
  }

  if (source.sourceType === TrendSourceType.CREATOR) {
    return { ...base, directUrls: [`https://www.instagram.com/${encodeURIComponent(source.query)}/`] };
  }

  return { ...base, search: source.query, searchType: "hashtag", searchLimit: 1 };
}

export async function fetchInstagramTrendVideos(source: InstagramTrendSource): Promise<NormalizedSocialVideo[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_INSTAGRAM_TREND_ACTOR_ID;
  if (!isInstagramTrendPilotEnabled() || !token || !actorId) throw new InstagramTrendProviderDisabledError();

  const result = await runApifyActor({
    token,
    actorId,
    input: buildInstagramTrendActorInput(source),
  });

  return normalizeApifyInstagramTrendVideos(result.items, INSTAGRAM_TREND_RESULT_LIMIT);
}
