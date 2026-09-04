import { describe, expect, it } from "vitest";

import { getInstagramInsightsConfig, instagramInsightsEnabled } from "./config";

const baseEnv = {
  APP_URL: "https://staging.socialolla.com",
  META_INSTAGRAM_CLIENT_ID: "client-id",
  META_INSTAGRAM_CLIENT_SECRET: "client-secret",
  META_INSTAGRAM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  META_INSTAGRAM_GRAPH_VERSION: "v25.0",
};

describe("Instagram Insights configuration", () => {
  it("requires an explicit opt-in separate from publishing configuration", () => {
    expect(instagramInsightsEnabled(baseEnv)).toBe(false);
    expect(getInstagramInsightsConfig(baseEnv)).toBeNull();
  });

  it("builds the legacy Insights configuration only when explicitly enabled", () => {
    const config = getInstagramInsightsConfig({ ...baseEnv, SOCIALOLLA_INSTAGRAM_INSIGHTS_ENABLED: "true" });

    expect(instagramInsightsEnabled({ ...baseEnv, SOCIALOLLA_INSTAGRAM_INSIGHTS_ENABLED: "true" })).toBe(true);
    expect(config).toMatchObject({
      redirectUri: "https://staging.socialolla.com/api/meta/instagram/callback",
      graphVersion: "v25.0",
    });
  });
});
