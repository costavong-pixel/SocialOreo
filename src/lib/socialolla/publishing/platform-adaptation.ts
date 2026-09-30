/** Canonical Post platform registry and variant adaptation contract. */

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
export type DestinationType = "ACCOUNT" | "PAGE" | "LOCATION" | "CHANNEL" | "BOARD" | "SUBREDDIT";
export type PlatformMediaKind = "image" | "video";

export type PlatformCapabilities = Readonly<{
  platform: PublishingPlatform;
  provider: string;
  destinationType: DestinationType;
  text: boolean;
  title: boolean;
  image: boolean;
  multipleImages: boolean;
  video: boolean;
  link: boolean;
  scheduling: boolean;
  nativeScheduling: boolean;
  maxTextLength: number;
  maxTitleLength: number;
  maxMedia: number;
  requiredScopes: readonly string[];
}>;

const registry: Record<PublishingPlatform, PlatformCapabilities> = {
  instagram: {
    platform: "instagram", provider: "meta-instagram", destinationType: "ACCOUNT",
    text: true, title: false, image: true, multipleImages: false, video: false, link: false,
    scheduling: true, nativeScheduling: false, maxTextLength: 2_200, maxTitleLength: 0, maxMedia: 1,
    requiredScopes: ["instagram_business_basic", "instagram_business_content_publish"],
  },
  facebook: {
    platform: "facebook", provider: "meta-pages", destinationType: "PAGE",
    text: true, title: false, image: true, multipleImages: true, video: true, link: true,
    scheduling: true, nativeScheduling: true, maxTextLength: 63_206, maxTitleLength: 0, maxMedia: 10,
    requiredScopes: ["pages_manage_posts", "pages_read_engagement"],
  },
  threads: {
    platform: "threads", provider: "meta-threads", destinationType: "ACCOUNT",
    text: true, title: false, image: true, multipleImages: false, video: true, link: true,
    scheduling: true, nativeScheduling: false, maxTextLength: 500, maxTitleLength: 0, maxMedia: 1,
    requiredScopes: ["threads_basic", "threads_content_publish"],
  },
  google_business: {
    platform: "google_business", provider: "google-business-profile", destinationType: "LOCATION",
    text: true, title: false, image: true, multipleImages: false, video: false, link: true,
    scheduling: true, nativeScheduling: true, maxTextLength: 1_500, maxTitleLength: 0, maxMedia: 1,
    requiredScopes: ["https://www.googleapis.com/auth/business.manage"],
  },
  linkedin: {
    platform: "linkedin", provider: "linkedin", destinationType: "ACCOUNT",
    text: true, title: false, image: true, multipleImages: true, video: true, link: true,
    scheduling: true, nativeScheduling: false, maxTextLength: 3_000, maxTitleLength: 0, maxMedia: 9,
    requiredScopes: ["w_member_social"],
  },
  tiktok: {
    platform: "tiktok", provider: "tiktok-content-posting", destinationType: "ACCOUNT",
    text: true, title: false, image: true, multipleImages: true, video: true, link: false,
    scheduling: true, nativeScheduling: false, maxTextLength: 2_200, maxTitleLength: 0, maxMedia: 35,
    requiredScopes: ["video.publish"],
  },
  youtube: {
    platform: "youtube", provider: "youtube-data-api", destinationType: "CHANNEL",
    text: true, title: true, image: false, multipleImages: false, video: true, link: false,
    scheduling: true, nativeScheduling: true, maxTextLength: 5_000, maxTitleLength: 100, maxMedia: 1,
    requiredScopes: ["https://www.googleapis.com/auth/youtube.upload"],
  },
  pinterest: {
    platform: "pinterest", provider: "pinterest", destinationType: "BOARD",
    text: true, title: true, image: true, multipleImages: false, video: true, link: true,
    scheduling: true, nativeScheduling: false, maxTextLength: 500, maxTitleLength: 100, maxMedia: 1,
    requiredScopes: ["boards:read", "pins:write"],
  },
  x: {
    platform: "x", provider: "x-api", destinationType: "ACCOUNT",
    text: true, title: false, image: true, multipleImages: true, video: true, link: true,
    scheduling: true, nativeScheduling: false, maxTextLength: 280, maxTitleLength: 0, maxMedia: 4,
    requiredScopes: ["tweet.read", "tweet.write", "users.read"],
  },
  reddit: {
    platform: "reddit", provider: "reddit-api", destinationType: "SUBREDDIT",
    text: true, title: true, image: true, multipleImages: false, video: true, link: true,
    scheduling: true, nativeScheduling: false, maxTextLength: 40_000, maxTitleLength: 300, maxMedia: 1,
    requiredScopes: ["submit"],
  },
};

export const PLATFORM_REGISTRY: Readonly<Record<PublishingPlatform, PlatformCapabilities>> = Object.freeze(
  Object.fromEntries(
    PUBLISHING_PLATFORMS.map((platform) => [
      platform,
      Object.freeze({ ...registry[platform], requiredScopes: Object.freeze([...registry[platform].requiredScopes]) }),
    ]),
  ) as Record<PublishingPlatform, PlatformCapabilities>,
);

export function isPublishingPlatform(value: string): value is PublishingPlatform {
  return (PUBLISHING_PLATFORMS as readonly string[]).includes(value.trim().toLowerCase());
}
export function platformCapabilities(platform: string): PlatformCapabilities | null {
  const normalized = platform.trim().toLowerCase();
  return isPublishingPlatform(normalized) ? PLATFORM_REGISTRY[normalized] : null;
}

export function platformGateEnvName(platform: string): string {
  const capabilities = platformCapabilities(platform);
  if (!capabilities) throw new Error(`Unsupported publishing platform: ${platform}`);
  return `SOCIALOLLA_${capabilities.platform.toUpperCase()}_PUBLISH_ENABLED`;
}

export type VariantMedia = Readonly<{ kind: PlatformMediaKind; assetId: string }>;
export type PlatformVariantInput = Readonly<{
  title?: string | null;
  text?: string | null;
  caption?: string | null;
  hashtags?: readonly string[];
  cta?: string | null;
  link?: string | null;
  media?: readonly VariantMedia[];
  mediaAssetIds?: readonly string[];
}>;

export type PlatformVariantResult = Readonly<{
  platform: PublishingPlatform;
  ok: boolean;
  content: {
    title: string | null;
    text: string;
    hashtags: string[];
    cta: string | null;
    link: string | null;
    mediaAssetIds: string[];
  };
  warnings: string[];
  errors: string[];
}>;

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Validate/adapt one Post concept for one destination without dropping content. */
export function adaptPostVariant(platform: string, input: PlatformVariantInput): PlatformVariantResult {
  const capabilities = platformCapabilities(platform);
  if (!capabilities) {
    return {
      platform: "instagram",
      ok: false,
      content: { title: null, text: "", hashtags: [], cta: null, link: null, mediaAssetIds: [] },
      warnings: [],
      errors: [`Unsupported publishing platform: ${platform}`],
    };
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const title = clean(input.title);
  const caption = clean(input.text ?? input.caption);
  const hashtags = (input.hashtags ?? []).map(clean).filter(Boolean);
  const cta = clean(input.cta) || null;
  const link = clean(input.link) || null;
  const media = [...(input.media ?? [])];
  const mediaAssetIds = [...(input.mediaAssetIds ?? media.map((item) => item.assetId).filter(Boolean))];

  if (title && !capabilities.title) warnings.push(`${capabilities.platform} does not expose a separate title; the title is folded into the post text.`);
  if (link && !capabilities.link) errors.push(`${capabilities.platform} does not support link attachments for this post type.`);
  if (title.length > capabilities.maxTitleLength && capabilities.title) errors.push(`${capabilities.platform} title exceeds ${capabilities.maxTitleLength} characters.`);
  if (mediaAssetIds.length > capabilities.maxMedia) errors.push(`${capabilities.platform} accepts at most ${capabilities.maxMedia} media item${capabilities.maxMedia === 1 ? "" : "s"}.`);
  if (media.length > 0) {
    if (media.some((item) => item.kind === "image" && !capabilities.image)) errors.push(`${capabilities.platform} does not support image media for this post type.`);
    if (media.some((item) => item.kind === "video" && !capabilities.video)) errors.push(`${capabilities.platform} does not support video media for this post type.`);
    if (!capabilities.multipleImages && media.filter((item) => item.kind === "image").length > 1) errors.push(`${capabilities.platform} does not support image carousels for this post type.`);
  }

  const textParts = [!capabilities.title && title ? title : "", caption, ...hashtags, cta, capabilities.link ? link : ""].filter(Boolean);
  const text = textParts.join("\n\n");
  if (text.length > capabilities.maxTextLength) errors.push(`${capabilities.platform} text exceeds ${capabilities.maxTextLength} characters.`);
  if (title && !capabilities.title) warnings.push("Title retained in adapted text so no customer content is lost.");
  if (mediaAssetIds.length > 0 && media.length === 0) warnings.push("Media kind was not supplied; the provider adapter will verify the stored asset before publishing.");

  return {
    platform: capabilities.platform,
    ok: errors.length === 0,
    content: { title: capabilities.title ? title || null : null, text, hashtags, cta, link, mediaAssetIds },
    warnings,
    errors,
  };
}
