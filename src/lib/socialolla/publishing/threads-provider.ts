import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt, assertSingleMedia, responseObject, requiredProviderId } from "./adapter-helpers";
import { PublishingProviderRequestError } from "./provider";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  const mediaUrl = assertSingleMedia("Threads", context.mediaUrls);
  const base = envUrl("SOCIALOLLA_THREADS_GRAPH_URL", "https://graph.threads.net");
  const createUrl = `${base}/${encodeURIComponent(context.platformUserId)}/threads`;
  const body = mediaUrl
    ? { media_type: context.mediaKinds[0] === "video" ? "VIDEO" : "IMAGE", image_url: context.mediaKinds[0] === "video" ? undefined : mediaUrl, video_url: context.mediaKinds[0] === "video" ? mediaUrl : undefined, text: context.text }
    : { media_type: "TEXT", text: context.text };
  const publishUrl = `${base}/${encodeURIComponent(context.platformUserId)}/threads_publish`;
  return {
    execute: async (fetcher, currentContext) => {
      const createResponse = await fetcher(createUrl, { method: "POST", headers: jsonHeaders(currentContext.accessToken), body: JSON.stringify(body) });
      if (!createResponse.ok) throw new PublishingProviderRequestError(`Threads media container creation failed (${createResponse.status})`, { retryable: createResponse.status >= 500 || createResponse.status === 429, reconciliationRequired: createResponse.status >= 500 });
      const container = responseObject(await createResponse.json());
      const containerId = requiredProviderId(container, "threads container");
      const publishResponse = await fetcher(publishUrl, { method: "POST", headers: jsonHeaders(currentContext.accessToken), body: JSON.stringify({ creation_id: containerId }) });
      if (!publishResponse.ok) throw new PublishingProviderRequestError(`Threads publish failed (${publishResponse.status})`, { retryable: publishResponse.status >= 500 || publishResponse.status === 429, reconciliationRequired: publishResponse.status >= 500 });
      return providerReceipt("threads", await publishResponse.json(), { url: publishUrl, metadata: { containerId } });
    },
  };
}

export function createThreadsPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  // The container call is deliberately not hidden from the shared request
  // boundary: the claim is acquired immediately before this choreography.
  return createRemotePublishingProvider("threads", storage, buildRequest, fetcher);
}
