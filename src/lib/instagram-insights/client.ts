import { z } from "zod";

import type { getInstagramInsightsConfig } from "./config";

type Config = NonNullable<ReturnType<typeof getInstagramInsightsConfig>>;

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
const profileSchema = z.object({ id: z.string().min(1), username: z.string().optional(), account_type: z.string().optional() });

async function responseJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Instagram authorization was rejected. Reconnect the professional account and try again.");
  return body;
}

export async function exchangeInstagramAuthorizationCode(config: Config, code: string) {
  const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", redirect_uri: config.redirectUri, code });
  const shortLived = tokenSchema.parse(await responseJson(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, cache: "no-store" })));
  const longLivedUrl = new URL("https://graph.instagram.com/access_token");
  longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
  longLivedUrl.searchParams.set("client_secret", config.clientSecret);
  const longLived = tokenSchema.parse(await responseJson(await fetch(longLivedUrl, { headers: { Authorization: `Bearer ${shortLived.access_token}` }, cache: "no-store" })));
  return longLived;
}

export async function getInstagramProfessionalProfile(config: Config, accessToken: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/me`);
  url.searchParams.set("fields", "id,username,account_type");
  return profileSchema.parse(await responseJson(await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })));
}

type InsightValue = { value?: number; end_time?: string };
type InsightResponse = { data?: Array<{ name?: string; values?: InsightValue[] }> };

async function tryAccountMetric(config: Config, instagramUserId: string, accessToken: string, metric: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/${instagramUserId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("period", "day");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json() as InsightResponse;
  const values = body.data?.[0]?.values ?? [];
  const last = values.at(-1)?.value;
  return typeof last === "number" ? last : null;
}

async function tryAudienceDemographics(config: Config, instagramUserId: string, accessToken: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/${instagramUserId}/insights`);
  url.searchParams.set("metric", "follower_demographics");
  url.searchParams.set("period", "lifetime");
  url.searchParams.set("breakdown", "age,gender");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!response.ok) return null;
  return await response.json();
}

export async function fetchInstagramAccountInsights(config: Config, instagramUserId: string, accessToken: string) {
  const [accountReach, accountViews, profileViews, totalInteractions, followerCount, audienceDemographicsJson] = await Promise.all([
    tryAccountMetric(config, instagramUserId, accessToken, "reach"),
    tryAccountMetric(config, instagramUserId, accessToken, "views"),
    tryAccountMetric(config, instagramUserId, accessToken, "profile_views"),
    tryAccountMetric(config, instagramUserId, accessToken, "total_interactions"),
    tryAccountMetric(config, instagramUserId, accessToken, "follower_count"),
    tryAudienceDemographics(config, instagramUserId, accessToken),
  ]);
  return { accountReach, accountViews, profileViews, totalInteractions, followerCount, audienceDemographicsJson };
}
