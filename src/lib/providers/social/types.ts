export type SocialPlatform = "instagram" | "tiktok" | "youtube";
export type SocialProvider = "apify" | "data365" | "youtube";

export type NormalizedSocialProfile = {
  platform: SocialPlatform;
  provider: SocialProvider;
  profileId?: string;
  username?: string;
  displayName?: string;
  profileUrl: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  profileImageUrl?: string;
  rawProviderPayload?: unknown;
};

export type NormalizedSocialVideo = {
  platform: SocialPlatform;
  provider: SocialProvider;
  providerVideoId?: string;
  url: string;
  caption?: string;
  hashtags: string[];
  mentions: string[];
  audioName?: string;
  durationSeconds?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  saveCount?: number;
  postedAt?: string;
  thumbnailUrl?: string;
  videoUrlIfAvailable?: string;
  transcriptIfAvailable?: string;
  rawProviderPayload?: unknown;
};

export type NormalizedSocialAuditResult = {
  profile: NormalizedSocialProfile;
  videos: NormalizedSocialVideo[];
};

export type FetchSocialAuditInput = {
  url: string;
  limit: number;
};

export type SocialProviderAdapter = {
  fetchAudit(input: FetchSocialAuditInput): Promise<NormalizedSocialAuditResult>;
};

export class SocialProviderError extends Error {
  constructor(
    message: string,
    public readonly publicMessage = "We could not analyze this profile. Please check that it is public and try again.",
  ) {
    super(message);
    this.name = "SocialProviderError";
  }
}
