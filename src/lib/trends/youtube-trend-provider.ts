import { TrendSourceType } from "@prisma/client";

import type { NormalizedSocialVideo } from "@/lib/providers/social/types";
import { SocialProviderError } from "@/lib/providers/social/types";

export const YOUTUBE_TREND_RESULT_LIMIT = 20;

type YoutubeTrendSource = {
  sourceType: TrendSourceType;
  query: string;
};

type YoutubeListResponse<T> = {
  items?: T[];
  error?: { message?: string };
};

type YoutubeSearchItem = {
  id?: { videoId?: string };
};

type YoutubeVideo = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string }>;
    tags?: string[];
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

export class YouTubeTrendProviderDisabledError extends Error {
  constructor() {
    super("YouTube Trend Radar is not enabled on this server.");
  }
}

export function isYouTubeTrendPilotEnabled() {
  return process.env.YOUTUBE_TREND_DISCOVERY_ENABLED === "true" && Boolean(process.env.YOUTUBE_API_KEY);
}

export function youtubeTrendPilotLabel() {
  return "Run pilot · Google API quota";
}

function numberValue(value: string | undefined) {
  const number = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function durationSeconds(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function hashtagsFromText(text: string) {
  return [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1].toLowerCase());
}

function normalizedCreatorQuery(query: string) {
  return query.replace(/^@/, "").trim();
}

async function youtubeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeTrendProviderDisabledError();
  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query.toString()}`);
  const payload = await response.json() as YoutubeListResponse<T>;
  if (!response.ok) throw new SocialProviderError(payload.error?.message ?? `YouTube Data API failed with ${response.status}.`);
  return payload as T;
}

async function channelIdForCreator(query: string) {
  const normalized = normalizedCreatorQuery(query);
  if (/^UC[\w-]{20,}$/i.test(normalized)) return normalized;
  const response = await youtubeGet<YoutubeListResponse<{ id?: string }>>("channels", { part: "id", forHandle: normalized });
  const channelId = response.items?.[0]?.id;
  if (!channelId) throw new SocialProviderError("YouTube returned no public channel for this creator.", "We could not find that public YouTube channel. Check the handle and try again.");
  return channelId;
}

export async function fetchYouTubeTrendVideos(source: YoutubeTrendSource): Promise<NormalizedSocialVideo[]> {
  if (!isYouTubeTrendPilotEnabled()) throw new YouTubeTrendProviderDisabledError();

  const searchParams: Record<string, string> = {
    part: "snippet",
    type: "video",
    maxResults: String(YOUTUBE_TREND_RESULT_LIMIT),
    order: "date",
    videoDuration: "short",
  };

  if (source.sourceType === TrendSourceType.CREATOR) {
    searchParams.channelId = await channelIdForCreator(source.query);
  } else {
    searchParams.q = source.sourceType === TrendSourceType.HASHTAG ? `#${source.query.replace(/^#/, "")}` : source.query;
  }

  const search = await youtubeGet<YoutubeListResponse<YoutubeSearchItem>>("search", searchParams);
  const ids = (search.items ?? []).map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
  if (!ids.length) throw new SocialProviderError("YouTube returned no public videos for this source.", "We could not find public YouTube videos for this source. Check the source and try again.");

  const details = await youtubeGet<YoutubeListResponse<YoutubeVideo>>("videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.join(","),
  });

  const videos = (details.items ?? [])
    .map((video): NormalizedSocialVideo | undefined => {
      const id = video.id;
      const snippet = video.snippet;
      if (!id || !snippet) return undefined;
      const caption = [snippet.title, snippet.description].filter(Boolean).join("\n");
      const thumbnail = snippet.thumbnails?.maxres?.url ?? snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url;
      return {
        platform: "youtube",
        provider: "youtube",
        providerVideoId: id,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        caption,
        hashtags: [...new Set([...(snippet.tags ?? []).filter((tag) => tag.startsWith("#")).map((tag) => tag.slice(1).toLowerCase()), ...hashtagsFromText(caption)])],
        mentions: [],
        durationSeconds: durationSeconds(video.contentDetails?.duration),
        viewCount: numberValue(video.statistics?.viewCount),
        likeCount: numberValue(video.statistics?.likeCount),
        commentCount: numberValue(video.statistics?.commentCount),
        postedAt: snippet.publishedAt,
        thumbnailUrl: thumbnail,
        rawProviderPayload: video,
      };
    })
    .filter((video): video is NormalizedSocialVideo => Boolean(video))
    .filter((video) => (video.durationSeconds ?? 0) <= 240)
    .slice(0, YOUTUBE_TREND_RESULT_LIMIT);

  if (!videos.length) throw new SocialProviderError("YouTube returned no usable public short-form videos for this source.", "We could not find public short-form YouTube videos for this source. Check the source and try again.");
  return videos;
}
