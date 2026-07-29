import {
  SocialProviderError,
  type NormalizedSocialAuditResult,
  type NormalizedSocialProfile,
  type NormalizedSocialVideo,
} from "./types";

type ApifyInstagramItem = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readNestedString(item: ApifyInstagramItem, key: string, nestedKey: string): string | undefined {
  const nested = item[key];
  if (nested && typeof nested === "object" && nestedKey in nested) {
    return asString((nested as Record<string, unknown>)[nestedKey]);
  }

  return undefined;
}

function normalizeInstagramUsername(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

function extractRequestedProfileUsername(profileUrl: string): string | undefined {
  try {
    const url = new URL(profileUrl);
    const [firstPathPart] = url.pathname.split("/").filter(Boolean);

    if (!firstPathPart || ["p", "reel", "stories", "tv"].includes(firstPathPart.toLowerCase())) {
      return undefined;
    }

    return normalizeInstagramUsername(firstPathPart);
  } catch {
    return undefined;
  }
}

function collectReturnedUsernames(items: ApifyInstagramItem[]): string[] {
  const usernames = items.map(
    (item) =>
      asString(item.username) ??
      asString(item.ownerUsername) ??
      readNestedString(item, "owner", "username"),
  );

  return [
    ...new Set(
      usernames
        .filter((username): username is string => Boolean(username))
        .map(normalizeInstagramUsername),
    ),
  ];
}

function itemMatchesRequestedProfile(item: ApifyInstagramItem, requestedUsername: string): boolean {
  return [
    asString(item.username),
    asString(item.ownerUsername),
    readNestedString(item, "owner", "username"),
  ].some((username) => username && normalizeInstagramUsername(username) === requestedUsername);
}

function scopeItemsToRequestedProfile(items: ApifyInstagramItem[], profileUrl: string): ApifyInstagramItem[] {
  const requestedUsername = extractRequestedProfileUsername(profileUrl);

  if (!requestedUsername) {
    return items;
  }

  const matchingItems = items.filter((item) => itemMatchesRequestedProfile(item, requestedUsername));
  if (matchingItems.length > 0) {
    return matchingItems;
  }

  const returnedUsernames = collectReturnedUsernames(items);
  throw new SocialProviderError(
    `Apify returned Instagram data for ${returnedUsernames.join(", ") || "an unknown profile"} while ${requestedUsername} was requested.`,
    "We could not confirm that Instagram returned the requested profile. Please check the profile URL and try again.",
  );
}

function extractHashtags(caption?: string, explicit?: unknown): string[] {
  const fromCaption = caption?.match(/#[\w]+/g)?.map((tag) => tag.slice(1)) ?? [];
  const fromExplicit = Array.isArray(explicit)
    ? explicit.filter((value): value is string => typeof value === "string")
    : [];

  return [...new Set([...fromCaption, ...fromExplicit])];
}

function extractMentions(caption?: string, explicit?: unknown): string[] {
  const fromCaption = caption?.match(/@[\w.]+/g)?.map((mention) => mention.slice(1)) ?? [];
  const fromExplicit = Array.isArray(explicit)
    ? explicit.filter((value): value is string => typeof value === "string")
    : [];

  return [...new Set([...fromCaption, ...fromExplicit])];
}

function normalizeVideo(item: ApifyInstagramItem, profileUrl: string): NormalizedSocialVideo {
  const caption = asString(item.caption) ?? asString(item.text);
  const providerVideoId =
    asString(item.id) ?? asString(item.shortCode) ?? asString(item.code) ?? asString(item.postId);
  const url =
    asString(item.url) ??
    (providerVideoId ? `https://www.instagram.com/p/${providerVideoId}/` : profileUrl);

  return {
    platform: "instagram",
    provider: "apify",
    providerVideoId,
    url,
    caption,
    hashtags: extractHashtags(caption, item.hashtags),
    mentions: extractMentions(caption, item.mentions),
    audioName:
      readNestedString(item, "musicInfo", "title") ?? asString(item.audioName) ?? asString(item.songName),
    durationSeconds: asNumber(item.videoDuration) ?? asNumber(item.duration),
    viewCount: asNumber(item.videoViewCount) ?? asNumber(item.videoPlayCount) ?? asNumber(item.igPlayCount) ?? asNumber(item.viewCount) ?? asNumber(item.playCount),
    likeCount: asNumber(item.likesCount) ?? asNumber(item.likes) ?? asNumber(item.likeCount),
    commentCount: asNumber(item.commentsCount) ?? asNumber(item.comments) ?? asNumber(item.commentCount),
    shareCount: asNumber(item.sharesCount) ?? asNumber(item.shareCount),
    saveCount: asNumber(item.savesCount) ?? asNumber(item.saveCount),
    postedAt: asString(item.timestamp) ?? asString(item.takenAt) ?? asString(item.publishedAt),
    thumbnailUrl:
      asString(item.displayUrl) ?? asString(item.thumbnailUrl) ?? asString(item.imageUrl),
    videoUrlIfAvailable: asString(item.videoUrl) ?? asString(item.video),
    transcriptIfAvailable: asString(item.transcript),
    rawProviderPayload: item,
  };
}

function isVideoItem(item: ApifyInstagramItem): boolean {
  const type = asString(item.type)?.toLowerCase();
  return type === "video" || type === "reel" || type === "clips" || Boolean(item.videoUrl ?? item.video);
}

export function normalizeApifyInstagramTrendVideos(items: ApifyInstagramItem[], limit: number): NormalizedSocialVideo[] {
  const videos = items
    .filter((item) => isVideoItem(item))
    .map((item) => normalizeVideo(item, "https://www.instagram.com/"))
    .filter((video, index, source) => source.findIndex((candidate) => candidate.url === video.url) === index)
    .slice(0, limit);

  if (videos.length === 0) {
    throw new SocialProviderError(
      "Apify returned no public Instagram reels for this trend source.",
      "We could not find public reels for this source. Try a more specific public hashtag, keyword, or creator.",
    );
  }

  return videos;
}

export function normalizeApifyInstagramPayload(
  items: ApifyInstagramItem[],
  profileUrl: string,
  limit: number,
): NormalizedSocialAuditResult {
  if (items.length === 0) {
    throw new Error("Apify returned no Instagram data for this URL.");
  }

  const profileItems = scopeItemsToRequestedProfile(items, profileUrl);

  const profileSeed =
    profileItems.find((item) => asString(item.username) || asString(item.ownerUsername)) ?? profileItems[0];

  const profile: NormalizedSocialProfile = {
    platform: "instagram",
    provider: "apify",
    profileId: asString(profileSeed.id) ?? asString(profileSeed.ownerId),
    username: asString(profileSeed.username) ?? asString(profileSeed.ownerUsername),
    displayName: asString(profileSeed.fullName) ?? asString(profileSeed.ownerFullName),
    profileUrl,
    bio: asString(profileSeed.biography) ?? asString(profileSeed.bio),
    followerCount: asNumber(profileSeed.followersCount) ?? asNumber(profileSeed.followers),
    followingCount: asNumber(profileSeed.followsCount) ?? asNumber(profileSeed.followingCount),
    postCount: asNumber(profileSeed.postsCount) ?? asNumber(profileSeed.postCount),
    profileImageUrl:
      asString(profileSeed.profilePicUrl) ??
      asString(profileSeed.profileImageUrl) ??
      asString(profileSeed.ownerProfilePicUrl),
    rawProviderPayload: profileSeed,
  };

  const videos = profileItems
    .filter((item) => isVideoItem(item))
    .map((item) => normalizeVideo(item, profileUrl))
    .slice(0, limit);

  if (videos.length === 0) {
    throw new SocialProviderError(
      "Apify returned no public Instagram reels for this URL.",
      "We could not find public reels for this profile. Check that it is public and has reels, then try again.",
    );
  }

  return { profile, videos };
}
