type InstagramInsightsConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  graphVersion: string;
  tokenEncryptionKey: string;
};

/**
 * Insights is a separate live Meta capability from Instagram publishing.
 * Keep it opt-in so publishing credentials cannot accidentally activate the
 * legacy owner-insights OAuth and sync routes during a publishing test.
 */
export function instagramInsightsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SOCIALOLLA_INSTAGRAM_INSIGHTS_ENABLED?.trim().toLowerCase() === "true";
}

export function getInstagramInsightsConfig(env: Record<string, string | undefined> = process.env): InstagramInsightsConfig | null {
  if (!instagramInsightsEnabled(env)) return null;
  const clientId = env.META_INSTAGRAM_CLIENT_ID?.trim();
  const clientSecret = env.META_INSTAGRAM_CLIENT_SECRET?.trim();
  const appUrl = (env.APP_URL ?? env.APP_BASE_URL)?.replace(/\/$/, "");
  const tokenEncryptionKey = env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim();

  if (!clientId || !clientSecret || !appUrl || !tokenEncryptionKey) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/meta/instagram/callback`,
    graphVersion: env.META_INSTAGRAM_GRAPH_VERSION?.trim() || "v25.0",
    tokenEncryptionKey,
  };
}
