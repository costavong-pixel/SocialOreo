type InstagramInsightsConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  graphVersion: string;
  tokenEncryptionKey: string;
};

export function getInstagramInsightsConfig(): InstagramInsightsConfig | null {
  const clientId = process.env.META_INSTAGRAM_CLIENT_ID?.trim();
  const clientSecret = process.env.META_INSTAGRAM_CLIENT_SECRET?.trim();
  const appUrl = (process.env.APP_URL ?? process.env.APP_BASE_URL)?.replace(/\/$/, "");
  const tokenEncryptionKey = process.env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim();

  if (!clientId || !clientSecret || !appUrl || !tokenEncryptionKey) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/meta/instagram/callback`,
    graphVersion: process.env.META_INSTAGRAM_GRAPH_VERSION?.trim() || "v25.0",
    tokenEncryptionKey,
  };
}
