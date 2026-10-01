import type { ProviderReceipt } from "../contracts";
import type { PlatformAdapter, PlatformPublishContext } from "../platform-provider";
import { PlatformPublishingError, providerJsonRequest } from "../platform-provider";

function requiredName(body: Record<string, unknown>, label: string): string {
  const name = typeof body.name === "string" ? body.name : typeof body.id === "string" ? body.id : "";
  if (!name) throw new PlatformPublishingError(`Google returned no ${label} identifier; reconciliation is required.`, false, true);
  return name;
}

const googleBusiness: PlatformAdapter = {
  platform: "google_business",
  provider: "google-business-profile",
  async publish(context: PlatformPublishContext) {
    const location = context.destination.platformUserId.replace(/^\/+/, "");
    const body: Record<string, unknown> = {
      languageCode: "en-US",
      summary: context.input.variant.content.text,
      topicType: "STANDARD",
    };
    if (context.media[0]) body.media = [{ mediaFormat: "PHOTO", sourceUrl: context.media[0].grant }];
    const result = await providerJsonRequest(context, {
      url: `https://mybusiness.googleapis.com/v4/${location}/localPosts`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const externalId = requiredName(result.body, "local post");
    return { provider: "google-business-profile", externalId, url: result.body.searchUrl as string | undefined, publishedAt: new Date().toISOString() };
  },
};

const youtube: PlatformAdapter = {
  platform: "youtube",
  provider: "youtube-data-api",
  async publish(context: PlatformPublishContext) {
    const media = context.media[0];
    if (!media || media.descriptor.kind !== "video") throw new PlatformPublishingError("YouTube publishing requires one owned video asset.");
    const title = context.input.variant.content.text.split(/\r?\n/)[0]?.slice(0, 100) || "SocialOlla Post";
    const metadata = {
      snippet: { title, description: context.input.variant.content.text.slice(0, 5_000), categoryId: "22" },
      status: { privacyStatus: process.env.SOCIALOLLA_YOUTUBE_PRIVACY_STATUS === "public" ? "public" : "private" },
    };
    const bytes = await context.storage.read(media.descriptor);
    const form = new FormData();
    form.append("metadata", new Blob([new Uint8Array(Buffer.from(JSON.stringify(metadata)))], { type: "application/json" }));
    form.append("media", new Blob([new Uint8Array(bytes)], { type: media.descriptor.mimeType }), media.descriptor.originalName);
    const result = await providerJsonRequest(context, {
      url: "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
      body: form,
    });
    const externalId = requiredName(result.body, "video");
    return { provider: "youtube-data-api", externalId, url: `https://www.youtube.com/watch?v=${externalId}`, publishedAt: new Date().toISOString() };
  },
};

export const googlePlatformAdapters = { googleBusiness, youtube } as const;
