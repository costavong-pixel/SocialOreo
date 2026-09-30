import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, formHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  if (context.mediaUrls.length > 0) throw new Error("Reddit adapter does not support media assets in this release");
  const path = `${envUrl("SOCIALOLLA_REDDIT_URL", "https://oauth.reddit.com")}/api/submit`;
  const form = new URLSearchParams({ api_type: "json", kind: context.link ? "link" : "self", sr: context.platformUserId, title: context.title || context.text.slice(0, 300) });
  if (context.link) form.set("url", context.link); else form.set("text", context.text);
  return { url: path, init: { method: "POST", headers: { ...formHeaders(context.accessToken), "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }, receipt: (response) => providerReceipt("reddit", response, { url: path }) };
}

export function createRedditPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("reddit", storage, buildRequest, fetcher);
}
