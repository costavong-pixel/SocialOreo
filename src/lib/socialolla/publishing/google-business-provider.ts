import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt, assertSingleMedia } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  const mediaUrl = assertSingleMedia("Google Business Profile", context.mediaUrls);
  const base = envUrl("SOCIALOLLA_GOOGLE_BUSINESS_URL", "https://mybusiness.googleapis.com/v4");
  const path = `${base}/${encodeURIComponent(context.platformUserId)}/localPosts`;
  const body = {
    languageCode: "en",
    summary: context.text,
    topicType: "STANDARD",
    ...(mediaUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: mediaUrl }] } : {}),
    ...(context.link ? { callToAction: { actionType: "LEARN_MORE", url: context.link } } : {}),
  };
  return { url: path, init: { method: "POST", headers: jsonHeaders(context.accessToken), body: JSON.stringify(body) }, receipt: (response) => providerReceipt("google_business", response, { url: path }) };
}

export function createGoogleBusinessPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("google_business", storage, buildRequest, fetcher);
}
