import { TrendSourceType } from "@prisma/client";

import { runApifyActor } from "@/lib/providers/social/apify-client";
import { normalizeApifyTikTokTrendVideos } from "@/lib/providers/social/normalize-apify-tiktok";
import type { NormalizedSocialVideo } from "@/lib/providers/social/types";

export const TIKTOK_TREND_RESULT_LIMIT = 20;
// Apify currently lists clockworks/tiktok-scraper from $1.70 / 1,000 results.
// Twenty capped results rounds up to a $0.04 pre-run estimate; provider billing can vary.
export const TIKTOK_TREND_ESTIMATED_COST_USD = 0.04;

export type TikTokTrendSource = {
  sourceType: TrendSourceType;
  query: string;
};

export class TikTokTrendProviderDisabledError extends Error {
  constructor() {
    super("TikTok Trend Radar is not enabled on this server.");
  }
}

export function isTikTokTrendPilotEnabled() {
  return process.env.TIKTOK_TREND_DISCOVERY_ENABLED === "true"
    && Boolean(process.env.APIFY_API_TOKEN)
    && Boolean(process.env.APIFY_TIKTOK_ACTOR_ID);
}

export function buildTikTokTrendActorInput(source: TikTokTrendSource) {
  const base = {
    resultsPerPage: TIKTOK_TREND_RESULT_LIMIT,
    commentsPerPost: 0,
    topLevelCommentsPerPost: 0,
    maxRepliesPerComment: 0,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  };

  if (source.sourceType === TrendSourceType.HASHTAG) {
    return { ...base, hashtags: [source.query.replace(/^#/, "")] };
  }

  if (source.sourceType === TrendSourceType.CREATOR) {
    return {
      ...base,
      profiles: [source.query.replace(/^@/, "")],
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      excludePinnedPosts: true,
    };
  }

  return {
    ...base,
    searchQueries: [source.query],
    searchSection: "/video",
    videoSearchSorting: "LATEST",
    videoSearchDateFilter: "PAST_WEEK",
  };
}

export async function fetchTikTokTrendVideos(source: TikTokTrendSource): Promise<NormalizedSocialVideo[]> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_TIKTOK_ACTOR_ID;
  if (!isTikTokTrendPilotEnabled() || !token || !actorId) throw new TikTokTrendProviderDisabledError();

  const result = await runApifyActor({
    token,
    actorId,
    input: buildTikTokTrendActorInput(source),
  });

  return normalizeApifyTikTokTrendVideos(result.items, TIKTOK_TREND_RESULT_LIMIT);
}
