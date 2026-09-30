export const PUBLISHING_PLATFORMS = [
  "instagram",
  "facebook",
  "threads",
  "google_business",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "x",
  "reddit",
] as const;

export type PublishingPlatform = (typeof PUBLISHING_PLATFORMS)[number];

export type PlatformDestinationType = "ACCOUNT" | "PAGE" | "LOCATION" | "CHANNEL" | "BOARD" | "SUBREDDIT";

export type PlatformCapabilities = Readonly<{
  platform: PublishingPlatform;
  text: boolean;
  title: boolean;
  image: boolean;
  carousel: boolean;
  video: boolean;
  link: boolean;
  maxTextLength: number;
  maxTitleLength: number;
  maxMediaItems: number;
  scheduling: boolean;
  destinationType: PlatformDestinationType;
  requiredScopes: readonly string[];
  providerType: string;
  externalApprovalRequired: boolean;
}>;

const registry: Record<PublishingPlatform, PlatformCapabilities> = {
  instagram: {
    platform: "instagram",
    text: true,
    title: false,
    image: true,
    carousel: false,
    video: false,
    link: false,
    maxTextLength: 2200,
    maxTitleLength: 0,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "ACCOUNT",
    requiredScopes: ["instagram_business_basic", "instagram_business_content_publish"],
    providerType: "meta",
    externalApprovalRequired: false,
  },
  facebook: {
    platform: "facebook",
    text: true,
    title: false,
    image: true,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 63206,
    maxTitleLength: 0,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "PAGE",
    requiredScopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
    providerType: "meta",
    externalApprovalRequired: true,
  },
  threads: {
    platform: "threads",
    text: true,
    title: false,
    image: true,
    carousel: false,
    video: true,
    link: true,
    maxTextLength: 500,
    maxTitleLength: 0,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "ACCOUNT",
    requiredScopes: ["threads_basic", "threads_content_publish"],
    providerType: "meta",
    externalApprovalRequired: true,
  },
  google_business: {
    platform: "google_business",
    text: true,
    title: false,
    image: true,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 1500,
    maxTitleLength: 0,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "LOCATION",
    requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
    providerType: "google-business-profile",
    externalApprovalRequired: true,
  },
  linkedin: {
    platform: "linkedin",
    text: true,
    title: false,
    image: false,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 3000,
    maxTitleLength: 0,
    maxMediaItems: 0,
    scheduling: true,
    destinationType: "ACCOUNT",
    requiredScopes: ["w_member_social"],
    providerType: "linkedin",
    externalApprovalRequired: true,
  },
  tiktok: {
    platform: "tiktok",
    text: true,
    title: true,
    image: true,
    carousel: true,
    video: true,
    link: false,
    maxTextLength: 2200,
    maxTitleLength: 150,
    maxMediaItems: 35,
    scheduling: true,
    destinationType: "ACCOUNT",
    requiredScopes: ["video.publish"],
    providerType: "tiktok-content-posting",
    externalApprovalRequired: true,
  },
  youtube: {
    platform: "youtube",
    text: true,
    title: true,
    image: false,
    carousel: false,
    video: true,
    link: true,
    maxTextLength: 5000,
    maxTitleLength: 100,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "CHANNEL",
    requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
    providerType: "youtube-data",
    externalApprovalRequired: true,
  },
  pinterest: {
    platform: "pinterest",
    text: true,
    title: true,
    image: true,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 500,
    maxTitleLength: 100,
    maxMediaItems: 1,
    scheduling: true,
    destinationType: "BOARD",
    requiredScopes: ["boards:read", "pins:read", "pins:write"],
    providerType: "pinterest",
    externalApprovalRequired: true,
  },
  x: {
    platform: "x",
    text: true,
    title: false,
    image: false,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 280,
    maxTitleLength: 0,
    maxMediaItems: 0,
    scheduling: true,
    destinationType: "ACCOUNT",
    requiredScopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    providerType: "x-api",
    externalApprovalRequired: true,
  },
  reddit: {
    platform: "reddit",
    text: true,
    title: true,
    image: false,
    carousel: false,
    video: false,
    link: true,
    maxTextLength: 40000,
    maxTitleLength: 300,
    maxMediaItems: 0,
    scheduling: true,
    destinationType: "SUBREDDIT",
    requiredScopes: ["submit", "identity", "read"],
    providerType: "reddit",
    externalApprovalRequired: true,
  },
};

export function isPublishingPlatform(value: string): value is PublishingPlatform {
  return (PUBLISHING_PLATFORMS as readonly string[]).includes(value);
}

export function platformCapabilities(platform: string): PlatformCapabilities | null {
  return isPublishingPlatform(platform) ? registry[platform] : null;
}

export function allPlatformCapabilities(): readonly PlatformCapabilities[] {
  return PUBLISHING_PLATFORMS.map((platform) => registry[platform]);
}

export function platformFlagName(platform: PublishingPlatform): `SOCIALOLLA_${string}_PUBLISH_ENABLED` {
  const suffix = platform === "google_business" ? "GOOGLE_BUSINESS" : platform.toUpperCase();
  return `SOCIALOLLA_${suffix}_PUBLISH_ENABLED`;
}

export function platformLabel(platform: PublishingPlatform): string {
  const labels: Record<PublishingPlatform, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    threads: "Threads",
    google_business: "Google Business Profile",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
    youtube: "YouTube",
    pinterest: "Pinterest",
    x: "X",
    reddit: "Reddit",
  };
  return labels[platform];
}

export class PlatformContentValidationError extends Error {
  readonly platform: PublishingPlatform;
  readonly warnings: readonly string[];

  constructor(platform: PublishingPlatform, message: string, warnings: readonly string[] = []) {
    super(`${platform}: ${message}`);
    this.name = "PlatformContentValidationError";
    this.platform = platform;
    this.warnings = warnings;
  }
}

export type AdaptablePostContent = Readonly<{
  title: string;
  text: string;
  hashtags: readonly string[];
  cta?: string;
  mediaAssetIds: readonly string[];
}>;

export type AdaptedPostContent = AdaptablePostContent & Readonly<{ warnings: readonly string[] }>;

export function adaptPostContent(platform: PublishingPlatform, content: AdaptablePostContent): AdaptedPostContent {
  const capabilities = registry[platform];
  const warnings: string[] = [];
  const text = [
    ...(capabilities.title ? [] : [content.title.trim()]),
    content.text.trim(),
    ...content.hashtags.map((tag) => tag.trim()).filter(Boolean),
    content.cta?.trim(),
  ].filter(Boolean).join("\n\n");
  if (!capabilities.text) throw new PlatformContentValidationError(platform, "text content is not supported");
  if (text.length > capabilities.maxTextLength) throw new PlatformContentValidationError(platform, `text exceeds the ${capabilities.maxTextLength}-character limit`);
  if (capabilities.title && content.title.length > capabilities.maxTitleLength) throw new PlatformContentValidationError(platform, `title exceeds the ${capabilities.maxTitleLength}-character limit`);
  if (!capabilities.title && content.title.trim()) warnings.push("title is represented in the shared caption because this platform has no separate title field");
  if (content.mediaAssetIds.length > 0 && !capabilities.image && !capabilities.video) throw new PlatformContentValidationError(platform, "media is not supported by this adapter");
  if (content.mediaAssetIds.length > capabilities.maxMediaItems) throw new PlatformContentValidationError(platform, `at most ${capabilities.maxMediaItems} media item${capabilities.maxMediaItems === 1 ? "" : "s"} are supported`);
  return { title: capabilities.title ? content.title.trim() : "", text, hashtags: [...content.hashtags], cta: content.cta?.trim() || undefined, mediaAssetIds: [...content.mediaAssetIds], warnings };
}
