import { z } from "zod";
import type { InstagramPublishingConfig } from "./config";

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
const refreshedTokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive() });
const profileSchema = z.object({ id: z.string().min(1), username: z.string().optional(), account_type: z.string().optional() });

async function responseJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Instagram publishing authorization was rejected.");
  return body;
}

export async function exchangeInstagramPublishingAuthorizationCode(config: InstagramPublishingConfig, code: string) {
  const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "authorization_code", redirect_uri: config.redirectUri, code });
  const shortLived = tokenSchema.parse(await responseJson(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, cache: "no-store" })));
  const longLivedUrl = new URL("https://graph.instagram.com/access_token");
  longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
  longLivedUrl.searchParams.set("client_secret", config.clientSecret);
  const longLived = tokenSchema.parse(await responseJson(await fetch(longLivedUrl, { headers: { Authorization: `Bearer ${shortLived.access_token}` }, cache: "no-store" })));
  return longLived;
}

export async function getInstagramPublishingProfile(config: InstagramPublishingConfig, accessToken: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/me`);
  url.searchParams.set("fields", "id,username,account_type");
  return profileSchema.parse(await responseJson(await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })));
}

/**
 * Meta exposes this read-only edge as the publishing eligibility/rate-limit
 * check. A successful response proves the connected token can reach the
 * publishing surface; it does not create a container or publish media.
 */
export async function verifyInstagramPublishingEligibility(config: InstagramPublishingConfig, userId: string, accessToken: string) {
  const url = new URL(`https://graph.instagram.com/${config.graphVersion}/${encodeURIComponent(userId)}/content_publishing_limit`);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  await responseJson(response);
  return true as const;
}

export async function refreshInstagramPublishingToken(accessToken: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  return refreshedTokenSchema.parse(await responseJson(await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })));
}

export function assertProfessionalAccount(accountType: string | undefined): asserts accountType is "BUSINESS" | "CREATOR" {
  if (accountType !== "BUSINESS" && accountType !== "CREATOR") throw new Error("Instagram publishing requires a professional Business or Creator account.");
}
