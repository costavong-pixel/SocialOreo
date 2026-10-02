import { createHash } from "node:crypto";
import type { PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";

export type ConnectionClientConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  clientIdKey: string;
  clientSecretKey: string;
}>;

const upperPlatform = (platform: PublishingPlatform) => platform.toUpperCase();

export function connectionRedirectUri(platform: PublishingPlatform, env: Record<string, string | undefined> = process.env): string | null {
  const base = (env.APP_URL ?? env.APP_BASE_URL)?.trim().replace(/\/$/, "");
  return base ? `${base}/api/connections/${platform}/callback` : null;
}

export function connectionClientConfig(platform: PublishingPlatform, env: Record<string, string | undefined> = process.env): ConnectionClientConfig | null {
  const candidates: ReadonlyArray<readonly [string, string, string, string]> = platform === "tiktok"
    ? [["SOCIALOLLA_TIKTOK_CLIENT_KEY", "SOCIALOLLA_TIKTOK_CLIENT_SECRET", "", ""]]
    : platform === "threads"
    ? [["SOCIALOLLA_THREADS_CLIENT_ID", "SOCIALOLLA_THREADS_CLIENT_SECRET", "", ""]]
    : platform === "facebook"
    ? [["SOCIALOLLA_META_CLIENT_ID", "SOCIALOLLA_META_CLIENT_SECRET", "", ""]]
    : platform === "google_business" || platform === "youtube"
      ? [["SOCIALOLLA_GOOGLE_CLIENT_ID", "SOCIALOLLA_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]]
      : [[`SOCIALOLLA_${upperPlatform(platform)}_CLIENT_ID`, `SOCIALOLLA_${upperPlatform(platform)}_CLIENT_SECRET`, "", ""]];

  for (const [clientIdKey, clientSecretKey, fallbackIdKey, fallbackSecretKey] of candidates) {
    const clientId = env[clientIdKey] ?? (fallbackIdKey ? env[fallbackIdKey] : undefined);
    const clientSecret = env[clientSecretKey] ?? (fallbackSecretKey ? env[fallbackSecretKey] : undefined);
    if (clientId && clientSecret) return { clientId, clientSecret, clientIdKey, clientSecretKey };
  }
  return null;
}

export function connectionClientEnvKeys(platform: PublishingPlatform): readonly string[] {
  if (platform === "tiktok") return ["SOCIALOLLA_TIKTOK_CLIENT_KEY", "SOCIALOLLA_TIKTOK_CLIENT_SECRET"];
  if (platform === "threads") return ["SOCIALOLLA_THREADS_CLIENT_ID", "SOCIALOLLA_THREADS_CLIENT_SECRET"];
  if (platform === "facebook") return ["SOCIALOLLA_META_CLIENT_ID", "SOCIALOLLA_META_CLIENT_SECRET"];
  if (platform === "google_business" || platform === "youtube") return ["SOCIALOLLA_GOOGLE_CLIENT_ID", "SOCIALOLLA_GOOGLE_CLIENT_SECRET"];
  return [`SOCIALOLLA_${upperPlatform(platform)}_CLIENT_ID`, `SOCIALOLLA_${upperPlatform(platform)}_CLIENT_SECRET`];
}

export function connectionTokenEncryptionKey(platform: PublishingPlatform, env: Record<string, string | undefined> = process.env): string | null {
  return env[`SOCIALOLLA_${upperPlatform(platform)}_TOKEN_ENCRYPTION_KEY`]
    ?? env.SOCIALOLLA_CONNECTION_TOKEN_ENCRYPTION_KEY
    ?? env.SOCIALOLLA_TOKEN_ENCRYPTION_KEY
    ?? ((platform === "facebook" || platform === "threads") ? env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY : undefined)
    ?? null;
}

export function oauthStateEncryptionKey(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.SOCIALOLLA_OAUTH_STATE_SECRET ?? env.AUTH0_SECRET;
  return secret ? createHash("sha256").update(secret).digest("base64") : null;
}

export function connectionEnabled(platform: PublishingPlatform, env: Record<string, string | undefined> = process.env): boolean {
  const nodeEnv = env.NODE_ENV;
  const socialollaEnv = env.SOCIALOLLA_ENV;
  const environmentAllowed = (nodeEnv === "production" && socialollaEnv === "production") || (nodeEnv === "staging" && socialollaEnv === "staging");
  const gate = `SOCIALOLLA_${upperPlatform(platform)}_CONNECTION_ENABLED`;
  return environmentAllowed && env[gate] === "true" && !providerDisabledEnabled(env);
}
