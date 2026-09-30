import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { platformCapabilities } from "./platform-adaptation";
import { PublishingProviderDisabledError, type PublishProvider } from "./provider";

/**
 * TikTok Direct Post is intentionally held behind an explicit provider
 * implementation gate until creator-info/privacy consent and asynchronous
 * publish-status reconciliation are implemented. It must not issue a request
 * that could be mistaken for a confirmed publish.
 */
export function createTikTokPublishingProvider(_storage: PrivateMediaStorage, _fetcher?: typeof fetch): PublishProvider {
  const capabilities = platformCapabilities("tiktok");
  if (!capabilities) throw new Error("TikTok publishing capabilities are unavailable");
  return { platform: "tiktok", capabilities, enabled: false, async publish() { throw new PublishingProviderDisabledError("tiktok"); } };
}
