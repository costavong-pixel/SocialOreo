import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, jsonHeaders, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  if (context.mediaUrls.length > 0) throw new Error("LinkedIn media publishing requires an approved asset-upload adapter; text/link publishing remains available");
  const path = envUrl("SOCIALOLLA_LINKEDIN_URL", "https://api.linkedin.com/rest/posts");
  const body = { author: `urn:li:person:${context.platformUserId}`, commentary: context.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED" };
  return {
    url: path,
    init: { method: "POST", headers: { ...jsonHeaders(context.accessToken), "LinkedIn-Version": process.env.SOCIALOLLA_LINKEDIN_VERSION?.trim() || "202601", "X-Restli-Protocol-Version": "2.0.0" }, body: JSON.stringify(body) },
    receipt: (response, _context, rawResponse) => {
      const externalId = rawResponse?.headers.get("x-restli-id");
      if (!externalId) throw new Error("LinkedIn response did not include x-restli-id");
      return { provider: "linkedin", externalId, url: path, publishedAt: new Date().toISOString(), metadata: response && typeof response === "object" ? { responseType: "json" } : undefined };
    },
  };
}

export function createLinkedInPublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("linkedin", storage, buildRequest, fetcher);
}
