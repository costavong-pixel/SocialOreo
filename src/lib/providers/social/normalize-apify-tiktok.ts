import type { NormalizedSocialAuditResult, NormalizedSocialVideo } from "./types";
import { SocialProviderError } from "./types";
import { safeHttpsUrl } from "@/lib/validators/external-url";

type ApifyTikTokItem = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function extractHashtags(text: string | undefined): string[] {
  return text ? [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1].toLowerCase()) : [];
}

function extractMentions(text: string | undefined): string[] {
  return text ? [...text.matchAll(/@([\p{L}\p{N}._]+)/gu)].map((match) => match[1].toLowerCase()) : [];
}

function usernameFromUrl(profileUrl: string): string | undefined {
  const match = profileUrl.match(/tiktok\.com\/@([^/?#]+)/i);
  return match?.[1]?.toLowerCase();
}

function normalizeUsername(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function videoUrl(item: ApifyTikTokItem, username: string | undefined): string | undefined {
  const direct = stringValue(item.webVideoUrl) ?? stringValue(item.videoUrl) ?? stringValue(item.url);
  if (direct) return safeHttpsUrl(direct);

  const id = stringValue(item.id) ?? stringValue(item.videoId);
  return id && username ? `https://www.tiktok.com/@${username}/video/${id}` : undefined;
}

function isVideoItem(item: ApifyTikTokItem): boolean {
  return Boolean(stringValue(item.id) ?? stringValue(item.videoId) ?? stringValue(item.webVideoUrl));
}

function normalizeVideo(item: ApifyTikTokItem, fallbackUsername: string | undefined): NormalizedSocialVideo | undefined {
  const author = recordValue(item.authorMeta) ?? recordValue(item.author);
  const username = stringValue(author?.name) ?? stringValue(author?.uniqueId) ?? fallbackUsername;
  const url = safeHttpsUrl(videoUrl(item, username));
  if (!url) return undefined;

  const caption = stringValue(item.text) ?? stringValue(item.desc) ?? stringValue(item.caption);
  const stats = recordValue(item.stats);
  const videoMeta = recordValue(item.videoMeta);

  return {
    platform: "tiktok",
    provider: "apify",
    providerVideoId: stringValue(item.id) ?? stringValue(item.videoId),
    url,
    caption,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
    audioName: stringValue(recordValue(item.musicMeta)?.musicName) ?? stringValue(recordValue(item.music)?.title),
    durationSeconds: numberValue(videoMeta?.duration) ?? numberValue(item.duration),
    viewCount: numberValue(item.playCount) ?? numberValue(stats?.playCount) ?? numberValue(stats?.views),
    likeCount: numberValue(item.diggCount) ?? numberValue(stats?.diggCount) ?? numberValue(stats?.likes),
    commentCount: numberValue(item.commentCount) ?? numberValue(stats?.commentCount) ?? numberValue(stats?.comments),
    shareCount: numberValue(item.shareCount) ?? numberValue(stats?.shareCount) ?? numberValue(stats?.shares),
    postedAt: stringValue(item.createTimeISO) ?? stringValue(item.createTime),
    thumbnailUrl: safeHttpsUrl(stringValue(videoMeta?.coverUrl) ?? stringValue(item.covers && recordValue(item.covers)?.default)),
    videoUrlIfAvailable: safeHttpsUrl(stringValue(videoMeta?.downloadAddr) ?? stringValue(item.videoUrl)),
    rawProviderPayload: item,
  };
}

export function normalizeApifyTikTokPayload(
  items: ApifyTikTokItem[],
  profileUrl: string,
  limit: number,
): NormalizedSocialAuditResult {
  const requestedUsername = usernameFromUrl(profileUrl);
  if (!requestedUsername) {
    throw new SocialProviderError("Could not determine the requested TikTok username.");
  }

  const videos = items
    .filter(isVideoItem)
    .map((item) => normalizeVideo(item, requestedUsername))
    .filter((video): video is NormalizedSocialVideo => Boolean(video))
    .filter((video) => usernameFromUrl(video.url) === requestedUsername)
    .slice(0, limit);

  if (!videos.length) {
    throw new SocialProviderError(
      "Apify returned no public TikTok videos for this profile.",
      "We could not find public TikTok videos for this profile. Check the profile URL and try again.",
    );
  }

  const profileItem = items.find((item) => {
    const author = recordValue(item.authorMeta) ?? recordValue(item.author);
    const returned = stringValue(author?.name) ?? stringValue(author?.uniqueId);
    return returned && normalizeUsername(returned) === requestedUsername;
  });
  const author = recordValue(profileItem?.authorMeta) ?? recordValue(profileItem?.author);

  return {
    profile: {
      platform: "tiktok",
      provider: "apify",
      profileId: stringValue(author?.id) ?? stringValue(author?.userId),
      username: stringValue(author?.name) ?? stringValue(author?.uniqueId) ?? requestedUsername,
      displayName: stringValue(author?.nickName) ?? stringValue(author?.nickname),
      profileUrl: `https://www.tiktok.com/@${requestedUsername}`,
      bio: stringValue(author?.signature),
      followerCount: numberValue(author?.fans) ?? numberValue(author?.followerCount),
      followingCount: numberValue(author?.following),
      postCount: numberValue(author?.video),
    profileImageUrl: safeHttpsUrl(stringValue(author?.avatar) ?? stringValue(author?.avatarLarger)),
      rawProviderPayload: profileItem ?? items[0],
    },
    videos,
  };
}

/**
 * Normalizes unscoped public TikTok results returned for a hashtag or keyword.
 * Unlike profile audits, trend captures deliberately retain videos from many creators.
 */
export function normalizeApifyTikTokTrendVideos(items: ApifyTikTokItem[], limit: number): NormalizedSocialVideo[] {
  const seenUrls = new Set<string>();
  const videos = items
    .filter(isVideoItem)
    .map((item) => normalizeVideo(item, undefined))
    .filter((video): video is NormalizedSocialVideo => Boolean(video))
    .filter((video) => {
      if (seenUrls.has(video.url)) return false;
      seenUrls.add(video.url);
      return true;
    })
    .slice(0, limit);

  if (!videos.length) {
    throw new SocialProviderError(
      "Apify returned no usable public TikTok videos for this source.",
      "We could not find public TikTok videos for this source. Check the source and try again.",
    );
  }

  return videos;
}
