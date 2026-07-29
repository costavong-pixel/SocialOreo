import { runApifyActor } from "./apify-client";
import { normalizeApifyInstagramPayload } from "./normalize-apify-instagram";
import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialProviderAdapter } from "./types";
import { SocialProviderError } from "./types";

const DEFAULT_REEL_LIMIT = 30;
const ESTIMATED_COST_USD = 0.05;

export function createApifyInstagramProvider(): SocialProviderAdapter {
  return {
    async fetchAudit(input: FetchSocialAuditInput): Promise<NormalizedSocialAuditResult> {
      const token = process.env.APIFY_API_TOKEN;
      const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID;

      if (!token || !actorId) {
        throw new SocialProviderError("Missing Apify Instagram configuration.");
      }

      try {
        const limit = input.limit > 0 ? input.limit : DEFAULT_REEL_LIMIT;
        const { items } = await runApifyActor({
          token,
          actorId,
          input: {
            directUrls: [input.url],
            resultsType: "posts",
            resultsLimit: limit,
            addParentData: true,
          },
        });

        return normalizeApifyInstagramPayload(items, input.url, limit);
      } catch (error) {
        if (error instanceof SocialProviderError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : "Unknown Apify error";

        if (message.includes("timed out")) {
          throw new SocialProviderError(message, "This profile took too long to analyze. Please try again.");
        }

        throw new SocialProviderError(message);
      }
    },
  };
}

export function estimateApifyInstagramCost(): number {
  return ESTIMATED_COST_USD;
}
