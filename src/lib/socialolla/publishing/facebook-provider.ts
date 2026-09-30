import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt, assertSingleMedia } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  const mediaUrl = assertSingleMedia("Facebook", context.mediaUrls);
  const base = envUrl("SOCIALOLLA_FACEBOOK_GRAPH_URL", "https://graph.facebook.com/v25.0");
  const path = mediaUrl ? `${base}/${encodeURIComponent(context.platformUserId)}/photos` : `${base}/${encodeURIComponent(context.platformUserId)}/feed`;
  const body = mediaUrl ? { url: mediaUrl, caption: context.text, published: true } : { message: context.text, ...(context.link ? { link: context.link } : {}) };
  return { url: path, init: { method: "POST", headers: jsonHeaders(context.accessToken), body: JSON.stringify(body) }, receipt: (response) => providerReceipt("facebook", response, { url: path }) };
}

export function createFacebookPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("facebook", storage, buildRequest, fetcher);
}
