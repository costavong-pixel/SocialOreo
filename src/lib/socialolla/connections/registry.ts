import { PLATFORM_REGISTRY, PUBLISHING_PLATFORMS, type PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";

export type ConnectionAvailability = "AVAILABLE" | "EXTERNAL_APPROVAL_REQUIRED" | "HARD_DISABLED";

export type ConnectionDescriptor = Readonly<{
  platform: PublishingPlatform;
  name: string;
  description: string;
  availability: ConnectionAvailability;
  destinationType: string;
}>;

const names: Record<PublishingPlatform, string> = {
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

const descriptions: Record<PublishingPlatform, string> = {
  instagram: "Publishing and Profile Analysis connections.",
  facebook: "Page publishing through the Meta Pages API.",
  threads: "Threads publishing through the Meta Threads API.",
  google_business: "Local post publishing for verified Business Profile locations.",
  linkedin: "Member publishing; organization destinations require additional provider scopes.",
  tiktok: "Creator connection and eligibility discovery; publishing remains hard-disabled.",
  youtube: "Video uploads to an authorized YouTube channel.",
  pinterest: "Image Pin publishing to an authorized board.",
  x: "Text post publishing through the X API.",
  reddit: "Self-post submissions to an authorized subreddit; native media/link publishing is not claimed.",
};

export const CONNECTION_REGISTRY: readonly ConnectionDescriptor[] = PUBLISHING_PLATFORMS.map((platform) => ({
  platform,
  name: names[platform],
  description: descriptions[platform],
  availability: platform === "instagram" ? "AVAILABLE" : platform === "tiktok" ? "HARD_DISABLED" : "EXTERNAL_APPROVAL_REQUIRED",
  destinationType: PLATFORM_REGISTRY[platform].destinationType,
}));

export function connectionDescriptor(platform: string): ConnectionDescriptor | null {
  return CONNECTION_REGISTRY.find((descriptor) => descriptor.platform === platform.trim().toLowerCase()) ?? null;
}
