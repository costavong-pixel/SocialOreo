export const INSTAGRAM_PUBLISHING_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;

export type InstagramPublishingConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  graphVersion: string;
  tokenEncryptionKey: string;
}>;

export function getInstagramPublishingConfig(): InstagramPublishingConfig | null {
  const clientId = process.env.META_INSTAGRAM_CLIENT_ID?.trim();
  const clientSecret = process.env.META_INSTAGRAM_CLIENT_SECRET?.trim();
  const appUrl = (process.env.APP_URL ?? process.env.APP_BASE_URL)?.replace(/\/$/, "");
  const tokenEncryptionKey = process.env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !appUrl || !tokenEncryptionKey) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/meta/instagram/publish/callback`, graphVersion: process.env.META_INSTAGRAM_GRAPH_VERSION?.trim() || "v25.0", tokenEncryptionKey };
}
