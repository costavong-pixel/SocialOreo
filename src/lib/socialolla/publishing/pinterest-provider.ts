import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt, assertSingleMedia } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  const mediaUrl = assertSingleMedia("Pinterest", context.mediaUrls);
  if (!mediaUrl) throw new Error("Pinterest publishing requires one owned image or video asset");
  const path = `${envUrl("SOCIALOLLA_PINTEREST_URL", "https://api.pinterest.com/v5")}/pins`;
  const body = { board_id: context.platformUserId, title: context.title || context.text.slice(0, 100), description: context.text, ...(context.link ? { link: context.link } : {}), media_source: { source_type: "image_url", url: mediaUrl } };
  return { url: path, init: { method: "POST", headers: jsonHeaders(context.accessToken), body: JSON.stringify(body) }, receipt: (response) => providerReceipt("pinterest", response, { url: path }) };
}

export function createPinterestPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("pinterest", storage, buildRequest, fetcher);
}
