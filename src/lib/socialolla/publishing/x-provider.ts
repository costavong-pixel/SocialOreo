import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  if (context.mediaUrls.length > 0) throw new Error("X media publishing requires an approved media-upload adapter; text/link publishing remains available");
  const path = `${envUrl("SOCIALOLLA_X_URL", "https://api.x.com/2")}/tweets`;
  return { url: path, init: { method: "POST", headers: jsonHeaders(context.accessToken), body: JSON.stringify({ text: context.text }) }, receipt: (response) => providerReceipt("x", response, { url: path }) };
}

export function createXPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("x", storage, buildRequest, fetcher);
}
