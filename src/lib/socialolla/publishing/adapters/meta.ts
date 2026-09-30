import type { ProviderReceipt } from "../contracts";
import type { PlatformAdapter, PlatformPublishContext } from "../platform-provider";
import { PlatformPublishingError, providerJsonRequest } from "../platform-provider";

function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || "v25.0";
}

function requiredId(body: Record<string, unknown>, label: string): string {
  const id = typeof body.id === "string" ? body.id : typeof body.post_id === "string" ? body.post_id : "";
  if (!id) throw new PlatformPublishingError(`Meta returned no ${label} identifier; reconciliation is required.`, false, true);
  return id;
}

function receipt(provider: string, body: Record<string, unknown>, url?: string, metadata?: Record<string, unknown>): ProviderReceipt {
  const externalId = requiredId(body, "post");
  return { provider, externalId, url, publishedAt: new Date().toISOString(), metadata };
}

const facebook: PlatformAdapter = {
  platform: "facebook",
  provider: "meta-pages",
  async publish(context: PlatformPublishContext) {
    const pageId = encodeURIComponent(context.destination.platformUserId);
    const base = `https://graph.facebook.com/${graphVersion()}/${pageId}`;
    if (context.media.length === 0) {
      const body = new URLSearchParams({ message: context.input.variant.content.text });
      const result = await providerJsonRequest(context, { url: `${base}/feed`, body });
      return receipt("facebook", result.body, `https://www.facebook.com/${requiredId(result.body, "post")}`);
    }

    const hasVideo = context.media.some((media) => media.descriptor.kind === "video");
    if (hasVideo) {
      if (context.media.length !== 1 || context.media[0]?.descriptor.kind !== "video") {
        throw new PlatformPublishingError("Facebook video publishing requires exactly one video asset.");
      }
      const result = await providerJsonRequest(context, {
        url: `${base}/videos`,
        body: new URLSearchParams({ file_url: context.media[0].grant, description: context.input.variant.content.text }),
      });
      return receipt("facebook", result.body, `https://www.facebook.com/${requiredId(result.body, "video")}`);
    }

    const mediaIds: string[] = [];
    for (const media of context.media) {
      const upload = await providerJsonRequest(context, {
        url: `${base}/photos`,
        body: new URLSearchParams({ url: media.grant, published: "false" }),
      });
      mediaIds.push(requiredId(upload.body, "photo"));
    }
    const body = new URLSearchParams({ message: context.input.variant.content.text, attached_media: JSON.stringify(mediaIds.map((id) => ({ media_fbid: id }))) });
    const published = await providerJsonRequest(context, { url: `${base}/feed`, body });
    return receipt("facebook", published.body, `https://www.facebook.com/${requiredId(published.body, "post")}`, { unpublishedPhotoCount: mediaIds.length });
  },
};

const threads: PlatformAdapter = {
  platform: "threads",
  provider: "meta-threads",
  async publish(context: PlatformPublishContext) {
    const userId = encodeURIComponent(context.destination.platformUserId);
    const version = graphVersion();
    const createBody = new URLSearchParams({ media_type: context.media.length ? (context.media[0]?.descriptor.kind === "video" ? "VIDEO" : "IMAGE") : "TEXT", text: context.input.variant.content.text });
    if (context.media[0]) createBody.set(context.media[0].descriptor.kind === "video" ? "video_url" : "image_url", context.media[0].grant);
    const container = await providerJsonRequest(context, { url: `https://graph.threads.net/${version}/${userId}/threads`, body: createBody });
    const creationId = requiredId(container.body, "container");
    const published = await providerJsonRequest(context, {
      url: `https://graph.threads.net/${version}/${userId}/threads_publish`,
      body: new URLSearchParams({ creation_id: creationId }),
    });
    return receipt("threads", published.body, `https://www.threads.net/@${context.destination.platformUserId}/post/${requiredId(published.body, "post")}`, { creationId });
  },
};

export const metaPlatformAdapters = { facebook, threads } as const;
