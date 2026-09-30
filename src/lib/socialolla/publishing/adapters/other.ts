import type { ProviderReceipt } from "../contracts";
import type { PlatformAdapter, PlatformMediaContext, PlatformPublishContext } from "../platform-provider";
import { PlatformPublishingError, providerJsonRequest } from "../platform-provider";

function requiredString(value: unknown, label: string, reconciliationRequired = true): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new PlatformPublishingError(`${label} was not returned by the provider.`, false, reconciliationRequired);
}

function firstLine(text: string, maxLength: number): string {
  return text.split(/\r?\n/, 1)[0]?.trim().slice(0, maxLength) || "SocialOlla Post";
}

function ownerUrn(platformUserId: string): string {
  return platformUserId.startsWith("urn:li:") ? platformUserId : `urn:li:person:${platformUserId}`;
}

function linkedInHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "LinkedIn-Version": process.env.LINKEDIN_VERSION?.trim() || "202603",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function uploadLinkedInImage(context: PlatformPublishContext, media: PlatformMediaContext, owner: string): Promise<string> {
  const initialized = await providerJsonRequest(context, {
    url: "https://api.linkedin.com/rest/images?action=initializeUpload",
    headers: linkedInHeaders(),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const value = initialized.body.value && typeof initialized.body.value === "object" ? initialized.body.value as Record<string, unknown> : {};
  const uploadUrl = requiredString(value.uploadUrl, "LinkedIn image upload URL");
  const imageUrn = requiredString(value.image, "LinkedIn image URN");
  const bytes = await context.storage.read(media.descriptor);
  await providerJsonRequest(context, {
    url: uploadUrl,
    method: "PUT",
    headers: { "Content-Type": media.descriptor.mimeType },
    body: new Blob([new Uint8Array(bytes)], { type: media.descriptor.mimeType }),
  });
  return imageUrn;
}

async function uploadLinkedInVideo(context: PlatformPublishContext, media: PlatformMediaContext, owner: string): Promise<string> {
  const bytes = await context.storage.read(media.descriptor);
  const initialized = await providerJsonRequest(context, {
    url: "https://api.linkedin.com/rest/videos?action=initializeUpload",
    headers: linkedInHeaders(),
    body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } }),
  });
  const value = initialized.body.value && typeof initialized.body.value === "object" ? initialized.body.value as Record<string, unknown> : {};
  const videoUrn = requiredString(value.video, "LinkedIn video URN");
  const uploadToken = typeof value.uploadToken === "string" ? value.uploadToken : "";
  const instructions = Array.isArray(value.uploadInstructions) ? value.uploadInstructions : [];
  if (instructions.length === 0) throw new PlatformPublishingError("LinkedIn video upload instructions were not returned.", false, true);
  const uploadedPartIds: string[] = [];
  for (const instructionValue of instructions) {
    if (!instructionValue || typeof instructionValue !== "object") throw new PlatformPublishingError("LinkedIn video upload instruction is invalid.");
    const instruction = instructionValue as Record<string, unknown>;
    const uploadUrl = requiredString(instruction.uploadUrl, "LinkedIn video upload URL");
    const firstByte = typeof instruction.firstByte === "number" ? instruction.firstByte : 0;
    const lastByte = typeof instruction.lastByte === "number" ? instruction.lastByte : bytes.length - 1;
    if (firstByte < 0 || lastByte < firstByte || lastByte >= bytes.length) throw new PlatformPublishingError("LinkedIn video upload range is invalid.");
    const uploaded = await providerJsonRequest(context, {
      url: uploadUrl,
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "Content-Range": `bytes ${firstByte}-${lastByte}/${bytes.length}` },
      body: new Blob([new Uint8Array(bytes.slice(firstByte, lastByte + 1))], { type: "application/octet-stream" }),
    });
    const etag = uploaded.response.headers.get("etag");
    if (!etag) throw new PlatformPublishingError("LinkedIn video upload did not return a part identifier.", false, true);
    uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
  }
  await providerJsonRequest(context, {
    url: "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    headers: linkedInHeaders(),
    body: JSON.stringify({ finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds } }),
  });
  return videoUrn;
}

function linkedInReceipt(response: Response): ProviderReceipt {
  const externalId = response.headers.get("x-restli-id");
  if (!externalId) throw new PlatformPublishingError("LinkedIn did not return a post identifier; reconciliation is required.", false, true);
  return { provider: "linkedin", externalId, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(externalId)}`, publishedAt: new Date().toISOString() };
}

const linkedin: PlatformAdapter = {
  platform: "linkedin",
  provider: "linkedin",
  async publish(context) {
    if (context.media.length > 0 && context.media.some((item) => item.descriptor.kind === "video") && context.media.some((item) => item.descriptor.kind === "image")) {
      throw new PlatformPublishingError("LinkedIn does not support mixed image and video media in one post.");
    }
    const owner = ownerUrn(context.destination.platformUserId);
    let content: Record<string, unknown> | undefined;
    if (context.media.length > 0) {
      const mediaIds = context.media[0]?.descriptor.kind === "video"
        ? [await uploadLinkedInVideo(context, context.media[0], owner)]
        : await Promise.all(context.media.map((media) => uploadLinkedInImage(context, media, owner)));
      content = mediaIds.length === 1
        ? { media: { id: mediaIds[0], title: firstLine(context.input.variant.content.text, 200) } }
        : { multiImage: { images: mediaIds.map((id) => ({ id })) } };
    }
    const body: Record<string, unknown> = {
      author: owner,
      commentary: context.input.variant.content.text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (content) body.content = content;
    const result = await providerJsonRequest(context, { url: "https://api.linkedin.com/rest/posts", headers: linkedInHeaders(), body: JSON.stringify(body) });
    return linkedInReceipt(result.response);
  },
};

const TIKTOK_STATUS_POLL_INTERVAL_MS = 5_000;
const TIKTOK_STATUS_MAX_ATTEMPTS = 24;

function tiktokData(body: Record<string, unknown>): Record<string, unknown> {
  const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
  const errorCode = typeof error.code === "string" ? error.code : "ok";
  if (errorCode !== "ok") {
    const retryable = errorCode === "internal" || errorCode === "rate_limit_exceeded";
    throw new PlatformPublishingError("TikTok rejected the publishing request.", retryable, false);
  }
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  if (!data) throw new PlatformPublishingError("TikTok returned no publish data; reconciliation is required.", false, true);
  return data;
}

async function waitForTikTokPublish(context: PlatformPublishContext, publishId: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < TIKTOK_STATUS_MAX_ATTEMPTS; attempt += 1) {
    const result = await providerJsonRequest(context, {
      url: "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = tiktokData(result.body);
    const status = typeof data.status === "string" ? data.status : "";
    if (status === "PUBLISH_COMPLETE") return data;
    if (status === "FAILED") {
      const retryable = data.fail_reason === "internal" || data.fail_reason === "video_pull_failed" || data.fail_reason === "photo_pull_failed";
      throw new PlatformPublishingError("TikTok rejected the publishing request.", retryable, false);
    }
    if (status !== "PROCESSING" && status !== "PROCESSING_UPLOAD" && status !== "PROCESSING_DOWNLOAD" && status !== "SCHEDULED") throw new PlatformPublishingError("TikTok returned an unknown publish status; reconciliation is required.", false, true);
    if (attempt + 1 < TIKTOK_STATUS_MAX_ATTEMPTS) await context.sleep(TIKTOK_STATUS_POLL_INTERVAL_MS);
  }
  throw new PlatformPublishingError("TikTok publish readiness timed out before completion.", true, false);
}

const tiktok: PlatformAdapter = {
  platform: "tiktok",
  provider: "tiktok-content-posting",
  async publish(context) {
    if (context.media.length !== 1) throw new PlatformPublishingError("TikTok direct publishing requires exactly one image or video asset.");
    const media = context.media[0];
    const postInfo = { title: context.input.variant.content.text.slice(0, 2_200), privacy_level: process.env.SOCIALOLLA_TIKTOK_PRIVACY_LEVEL === "PUBLIC_TO_EVERYONE" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY", disable_duet: true, disable_comment: true, disable_stitch: true };
    const isVideo = media.descriptor.kind === "video";
    const result = await providerJsonRequest(context, {
      url: isVideo ? "https://open.tiktokapis.com/v2/post/publish/video/init/" : "https://open.tiktokapis.com/v2/post/publish/content/init/",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isVideo
        ? { post_info: postInfo, source_info: { source: "PULL_FROM_URL", video_url: media.grant } }
        : { post_mode: "DIRECT_POST", media_type: "PHOTO", post_info: postInfo, source_info: { source: "PULL_FROM_URL", photo_images: [media.grant], photo_cover_index: 0 } }),
    });
    const data = tiktokData(result.body);
    const publishId = requiredString(data.publish_id, "TikTok publish identifier");
    await waitForTikTokPublish(context, publishId);
    return { provider: "tiktok-content-posting", externalId: publishId, publishedAt: new Date().toISOString(), metadata: { mediaType: isVideo ? "video" : "photo" } };
  },
};

const pinterest: PlatformAdapter = {
  platform: "pinterest",
  provider: "pinterest",
  async publish(context) {
    const media = context.media[0];
    if (!media || media.descriptor.kind !== "image") throw new PlatformPublishingError("Pinterest publishing requires one owned image asset.");
    const result = await providerJsonRequest(context, {
      url: "https://api.pinterest.com/v5/pins",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: context.destination.platformUserId, title: firstLine(context.input.variant.content.text, 100), description: context.input.variant.content.text.slice(0, 500), media_source: { source_type: "image_url", url: media.grant } }),
    });
    const externalId = requiredString(result.body.id, "Pinterest Pin identifier");
    return { provider: "pinterest", externalId, url: `https://www.pinterest.com/pin/${externalId}/`, publishedAt: new Date().toISOString() };
  },
};

const x: PlatformAdapter = {
  platform: "x",
  provider: "x-api",
  async publish(context) {
    if (context.media.length > 0) throw new PlatformPublishingError("X media publishing requires an OAuth 1.0a media upload credential; text-only publishing is enabled for this adapter.");
    const result = await providerJsonRequest(context, { url: "https://api.x.com/2/tweets", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: context.input.variant.content.text }) });
    const data = result.body.data && typeof result.body.data === "object" ? result.body.data as Record<string, unknown> : {};
    const externalId = requiredString(data.id, "X post identifier");
    return { provider: "x-api", externalId, url: `https://x.com/i/web/status/${externalId}`, publishedAt: new Date().toISOString() };
  },
};

const reddit: PlatformAdapter = {
  platform: "reddit",
  provider: "reddit-api",
  async publish(context) {
    const subreddit = context.destination.platformUserId.replace(/^r\//i, "");
    const title = firstLine(context.input.variant.content.text, 300);
    const media = context.media[0];
    const fields = new URLSearchParams({ api_type: "json", sr: subreddit, kind: media ? "link" : "self", title, resubmit: "true", sendreplies: "false" });
    if (media) fields.set("url", media.grant);
    else fields.set("text", context.input.variant.content.text);
    const result = await providerJsonRequest(context, { url: "https://oauth.reddit.com/api/submit", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fields });
    const json = result.body.json && typeof result.body.json === "object" ? result.body.json as Record<string, unknown> : {};
    const errors = Array.isArray(json.errors) ? json.errors : [];
    if (errors.length > 0) throw new PlatformPublishingError("Reddit rejected the submission.");
    const data = json.data && typeof json.data === "object" ? json.data as Record<string, unknown> : {};
    const externalId = requiredString(data.name ?? data.id, "Reddit submission identifier");
    return { provider: "reddit-api", externalId, url: typeof data.url === "string" ? data.url : undefined, publishedAt: new Date().toISOString() };
  },
};

export const otherPlatformAdapters = { linkedin, tiktok, pinterest, x, reddit } as const;
