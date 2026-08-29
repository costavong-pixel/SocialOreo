export type PublishingPlatform = "instagram";

export type PlatformCapabilities = Readonly<{
  image: boolean;
  video: boolean;
  scheduling: boolean;
}>;

export function platformCapabilities(platform: string): PlatformCapabilities | null {
  if (platform !== "instagram") return null;
  return { image: true, video: false, scheduling: true };
}
