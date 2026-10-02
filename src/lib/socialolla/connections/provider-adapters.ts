import { platformCapabilities, type DestinationType, type PlatformCapabilities, type PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";
import type { ConnectionHttpClient, ConnectionProviderAdapter, DiscoveredConnectionDestination, OAuthTokenSet } from "./contracts";

const http: ConnectionHttpClient = fetch;

export class ConnectionProviderError extends Error {
  constructor(public readonly provider: PublishingPlatform, public readonly status?: number, public readonly retryable = false) {
    super(`${provider} connection request failed.`);
    this.name = "ConnectionProviderError";
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayText(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/[ ,]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function expiresAt(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(Date.now() + value * 1000) : null;
}

function tokenFromBody(platform: PublishingPlatform, body: Record<string, unknown>, options: { allowMissingScope?: boolean } = {}): OAuthTokenSet {
  const accessToken = text(body.access_token);
  if (!accessToken) throw new ConnectionProviderError(platform);
  const scopes = arrayText(body.scope);
  if (scopes.length === 0 && !options.allowMissingScope) throw new ConnectionProviderError(platform);
  return {
    accessToken,
    refreshToken: text(body.refresh_token),
    expiresAt: expiresAt(body.expires_in),
    scopes,
  };
}

function jsonHeaders(headers?: Record<string, string>): Record<string, string> {
  return { Accept: "application/json", ...(headers ?? {}) };
}

async function requestJson(platform: PublishingPlatform, url: string, init: RequestInit, client: ConnectionHttpClient = http): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await client(url, { ...init, headers: jsonHeaders(init.headers as Record<string, string> | undefined) });
  } catch {
    throw new ConnectionProviderError(platform, undefined, true);
  }
  if (!response.ok) throw new ConnectionProviderError(platform, response.status, response.status === 408 || response.status === 429 || response.status >= 500);
  return record(await response.json().catch(() => ({})));
}

function formBody(values: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) body.set(key, value);
  return body.toString();
}

function basic(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function capabilities(platform: PublishingPlatform): PlatformCapabilities {
  const value = platformCapabilities(platform);
  if (!value) throw new Error(`Unsupported connection platform: ${platform}`);
  return value;
}

function authUrl(base: string, params: Record<string, string | undefined>): URL {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url;
}

function destination(platformUserId: string, label: string, destinationType: DestinationType, eligible = true, extra?: Partial<DiscoveredConnectionDestination>): DiscoveredConnectionDestination {
  return { platformUserId, label, destinationType, eligible, ...extra };
}

function verifyFromList(destinationList: readonly DiscoveredConnectionDestination[], wanted: DiscoveredConnectionDestination): DiscoveredConnectionDestination {
  const found = destinationList.find((item) => item.platformUserId === wanted.platformUserId);
  return found ?? { ...wanted, eligible: false, eligibilityReason: "Destination was not returned by the provider." };
}

function facebookPageCanCreateContent(tasks: readonly string[]): boolean {
  return tasks.includes("PROFILE_PLUS_CREATE_CONTENT") || tasks.includes("CREATE_CONTENT");
}

const facebookScopes = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"] as const;
const facebook: ConnectionProviderAdapter = {
  platform: "facebook", capabilities: capabilities("facebook"), requiredScopes: facebookScopes, supportsPkce: false,
  authorizationUrl: ({ clientId, redirectUri, state }) => authUrl("https://www.facebook.com/v25.0/dialog/oauth", { client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: facebookScopes.join(","), state }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, http: client = http }) {
    return tokenFromBody("facebook", await requestJson("facebook", "https://graph.facebook.com/v25.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }) }, client));
  },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) {
    const body = await requestJson("facebook", "https://graph.facebook.com/v25.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: clientSecret, fb_exchange_token: refreshToken }) }, client);
    return { ...tokenFromBody("facebook", body), refreshToken: text(body.access_token) ?? refreshToken };
  },
  async revoke({ accessToken, http: client = http }) {
    await requestJson("facebook", "https://graph.facebook.com/v25.0/me/permissions", { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }, client);
  },
  async discoverDestinations({ token, http: client = http }) {
    const body = await requestJson("facebook", "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,tasks", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
    const pages = Array.isArray(body.data) ? body.data : [];
    return pages.flatMap((item) => {
      const page = record(item);
      const id = text(page.id);
      if (!id) return [];
      const tasks = arrayText(page.tasks);
      const pageToken = text(page.access_token);
      return [destination(id, text(page.name) ?? "Facebook Page", "PAGE", Boolean(pageToken && facebookPageCanCreateContent(tasks)), { accountLabel: text(page.name), accessToken: pageToken ?? undefined })];
    });
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) {
    return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted);
  },
};

const threadsScopes = ["threads_basic", "threads_content_publish"] as const;
const threads: ConnectionProviderAdapter = {
  platform: "threads", capabilities: capabilities("threads"), requiredScopes: threadsScopes, supportsPkce: false,
  authorizationUrl: ({ clientId, redirectUri, state }) => authUrl("https://threads.net/oauth/authorize", { client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: threadsScopes.join(","), state }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, http: client = http }) {
    // Meta's documented Threads authorization-code response is access_token + user_id and may omit scope. Accept that response shape here, but saveConnection still requires explicit evidence of every requested scope before persisting a connection.
    return tokenFromBody("threads", await requestJson("threads", "https://graph.threads.net/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }) }, client), { allowMissingScope: true });
  },
  async refresh({ refreshToken, http: client = http }) {
    return tokenFromBody("threads", await requestJson("threads", `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(refreshToken)}`, { method: "GET" }, client), { allowMissingScope: true });
  },
  async revoke({ accessToken, http: client = http }) {
    await requestJson("threads", "https://graph.threads.net/v1.0/me/permissions", { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }, client);
  },
  async discoverDestinations({ token, http: client = http }) {
    const body = await requestJson("threads", "https://graph.threads.net/v1.0/me?fields=id,username,name", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
    const id = text(body.id);
    return id ? [destination(id, text(body.username) ? `@${text(body.username)}` : "Threads account", "ACCOUNT", true, { accountLabel: text(body.username) ? `@${text(body.username)}` : text(body.name) })] : [];
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

const googleBusinessScopes = ["https://www.googleapis.com/auth/business.manage"] as const;
const youtubeScopes = ["https://www.googleapis.com/auth/youtube.upload"] as const;

function googleAuthorizationUrl(platform: PublishingPlatform, scopes: readonly string[], clientId: string, redirectUri: string, state: string, codeChallenge?: string): URL {
  return authUrl("https://accounts.google.com/o/oauth2/v2/auth", { client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: scopes.join(" "), state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined });
}

function googleAdapter(platform: "google_business" | "youtube", scopes: readonly string[]): ConnectionProviderAdapter {
  return {
    platform, capabilities: capabilities(platform), requiredScopes: scopes, supportsPkce: true,
    authorizationUrl: ({ clientId, redirectUri, state, codeChallenge }) => googleAuthorizationUrl(platform, scopes, clientId, redirectUri, state, codeChallenge),
    async exchangeCallback({ clientId, clientSecret, code, redirectUri, codeVerifier, http: client = http }) {
      return tokenFromBody(platform, await requestJson(platform, "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier }) }, client));
    },
    async refresh({ clientId, clientSecret, refreshToken, http: client = http }) {
      return tokenFromBody(platform, await requestJson(platform, "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) }, client));
    },
    async revoke({ accessToken, http: client = http }) {
      await requestJson(platform, `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: "POST" }, client);
    },
    async discoverDestinations({ token, http: client = http }) {
      if (platform === "youtube") {
        const body = await requestJson(platform, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
        const items = Array.isArray(body.items) ? body.items : [];
        return items.flatMap((item) => {
          const channel = record(item); const snippet = record(channel.snippet); const id = text(channel.id);
          return id ? [destination(id, text(snippet.title) ?? "YouTube channel", "CHANNEL", true, { accountLabel: text(snippet.customUrl) ?? text(snippet.title) })] : [];
        });
      }
      const accounts = await requestJson(platform, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
      const accountItems = Array.isArray(accounts.accounts) ? accounts.accounts : [];
      const results: DiscoveredConnectionDestination[] = [];
      for (const accountValue of accountItems) {
        const account = record(accountValue); const accountName = text(account.name);
        if (!accountName) continue;
        const locations = await requestJson(platform, `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress`, { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
        for (const locationValue of Array.isArray(locations.locations) ? locations.locations : []) {
          const location = record(locationValue); const id = text(location.name); const title = text(record(location.title).value) ?? text(location.title);
          if (id) results.push(destination(id, title ?? "Business Profile location", "LOCATION", true, { accountLabel: accountName }));
        }
      }
      return results;
    },
    async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
  };
}

const linkedinScopes = ["openid", "profile", "email", "w_member_social"] as const;
const linkedin: ConnectionProviderAdapter = {
  platform: "linkedin", capabilities: capabilities("linkedin"), requiredScopes: linkedinScopes, supportsPkce: true,
  authorizationUrl: ({ clientId, redirectUri, state, codeChallenge }) => authUrl("https://www.linkedin.com/oauth/v2/authorization", { response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: linkedinScopes.join(" "), state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, codeVerifier, http: client = http }) { return tokenFromBody("linkedin", await requestJson("linkedin", "https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: codeVerifier }) }, client)); },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) { return tokenFromBody("linkedin", await requestJson("linkedin", "https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }) }, client)); },
  async revoke({ clientId, clientSecret, accessToken, http: client = http }) { await requestJson("linkedin", "https://www.linkedin.com/oauth/v2/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ token: accessToken, client_id: clientId, client_secret: clientSecret }) }, client); },
  async discoverDestinations({ token, http: client = http }) {
    const identity = await requestJson("linkedin", "https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
    const sub = text(identity.sub);
    const results: DiscoveredConnectionDestination[] = sub ? [destination(sub.startsWith("urn:") ? sub : `urn:li:person:${sub}`, text(identity.name) ?? "LinkedIn member", "ACCOUNT", true, { accountLabel: text(identity.email) })] : [];
    if (token.scopes.includes("w_organization_social")) {
      const organizations = await requestJson("linkedin", "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR", { headers: { Authorization: `Bearer ${token.accessToken}`, "LinkedIn-Version": "202603" } }, client);
      for (const itemValue of Array.isArray(organizations.elements) ? organizations.elements : []) {
        const item = record(itemValue); const organization = record(item.organization); const id = text(organization.id) ?? text(item.organization);
        if (id) results.push(destination(id.startsWith("urn:") ? id : `urn:li:organization:${id}`, text(organization.localizedName) ?? "LinkedIn organization", "PAGE", true));
      }
    }
    return results;
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

const tiktokScopes = ["user.info.basic", "video.publish"] as const;
const tiktok: ConnectionProviderAdapter = {
  platform: "tiktok", capabilities: capabilities("tiktok"), requiredScopes: tiktokScopes, supportsPkce: false, hardDisabled: true,
  authorizationUrl: ({ clientId, redirectUri, state }) => authUrl("https://www.tiktok.com/v2/auth/authorize/", { client_key: clientId, response_type: "code", scope: tiktokScopes.join(","), redirect_uri: redirectUri, state }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, http: client = http }) { return tokenFromBody("tiktok", await requestJson("tiktok", "https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_key: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }) }, client)); },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) { return tokenFromBody("tiktok", await requestJson("tiktok", "https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_key: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) }, client)); },
  async revoke({ accessToken, http: client = http }) { await requestJson("tiktok", "https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ access_token: accessToken }) }, client); },
  async discoverDestinations({ token, http: client = http }) {
    const body = await requestJson("tiktok", "https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" }, body: "{}" }, client);
    const data = record(body.data); const id = text(data.creator_open_id) ?? text(data.open_id); const label = text(data.display_name) ?? text(data.username);
    return id ? [destination(id, label ?? "TikTok creator", "ACCOUNT", true, { accountLabel: label })] : [];
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

const pinterestScopes = ["boards:read", "boards:write", "pins:read", "pins:write"] as const;
const pinterest: ConnectionProviderAdapter = {
  platform: "pinterest", capabilities: capabilities("pinterest"), requiredScopes: pinterestScopes, supportsPkce: true,
  authorizationUrl: ({ clientId, redirectUri, state, codeChallenge }) => authUrl("https://www.pinterest.com/oauth/", { client_id: clientId, response_type: "code", redirect_uri: redirectUri, scope: pinterestScopes.join(","), state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, codeVerifier, http: client = http }) { return tokenFromBody("pinterest", await requestJson("pinterest", "https://api.pinterest.com/v5/oauth/token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier }) }, client)); },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) { return tokenFromBody("pinterest", await requestJson("pinterest", "https://api.pinterest.com/v5/oauth/token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken }) }, client)); },
  async revoke({ accessToken, http: client = http }) { await requestJson("pinterest", "https://api.pinterest.com/v5/oauth/token", { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }, client); },
  async discoverDestinations({ token, http: client = http }) {
    const user = await requestJson("pinterest", "https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
    const boards = await requestJson("pinterest", "https://api.pinterest.com/v5/boards?page_size=100", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client);
    return (Array.isArray(boards.items) ? boards.items : []).flatMap((item) => { const board = record(item); const id = text(board.id); return id ? [destination(id, text(board.name) ?? "Pinterest board", "BOARD", true, { accountLabel: text(user.username) ?? text(user.business_name) })] : []; });
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

const xScopes = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
const x: ConnectionProviderAdapter = {
  platform: "x", capabilities: capabilities("x"), requiredScopes: xScopes, supportsPkce: true,
  authorizationUrl: ({ clientId, redirectUri, state, codeChallenge }) => authUrl("https://twitter.com/i/oauth2/authorize", { response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: xScopes.join(" "), state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined }),
  async exchangeCallback({ clientId, code, redirectUri, codeVerifier, http: client = http }) { return tokenFromBody("x", await requestJson("x", "https://api.x.com/2/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ code, grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier }) }, client)); },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) { return tokenFromBody("x", await requestJson("x", "https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ refresh_token: refreshToken, grant_type: "refresh_token", client_id: clientId }) }, client)); },
  async revoke({ clientId, accessToken, http: client = http }) { await requestJson("x", "https://api.x.com/2/oauth2/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ token: accessToken, client_id: clientId, token_type_hint: "access_token" }) }, client); },
  async discoverDestinations({ token, http: client = http }) { const body = await requestJson("x", "https://api.x.com/2/users/me?user.fields=username,name", { headers: { Authorization: `Bearer ${token.accessToken}` } }, client); const data = record(body.data); const id = text(data.id); return id ? [destination(id, text(data.name) ?? "X account", "ACCOUNT", true, { accountLabel: text(data.username) ? `@${text(data.username)}` : null })] : []; },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

const redditScopes = ["identity", "submit"] as const;
const reddit: ConnectionProviderAdapter = {
  platform: "reddit", capabilities: capabilities("reddit"), requiredScopes: redditScopes, supportsPkce: false,
  authorizationUrl: ({ clientId, redirectUri, state }) => authUrl("https://www.reddit.com/api/v1/authorize", { client_id: clientId, response_type: "code", state, redirect_uri: redirectUri, duration: "permanent", scope: redditScopes.join(" ") }),
  async exchangeCallback({ clientId, clientSecret, code, redirectUri, http: client = http }) { return tokenFromBody("reddit", await requestJson("reddit", "https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SocialOlla/connection" }, body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri }) }, client)); },
  async refresh({ clientId, clientSecret, refreshToken, http: client = http }) { return tokenFromBody("reddit", await requestJson("reddit", "https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SocialOlla/connection" }, body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken }) }, client)); },
  async revoke({ clientId, clientSecret, accessToken, http: client = http }) { await requestJson("reddit", "https://www.reddit.com/api/v1/revoke_token", { method: "POST", headers: { Authorization: basic(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SocialOlla/connection" }, body: formBody({ token: accessToken, token_type_hint: "access_token" }) }, client); },
  async discoverDestinations({ token, http: client = http }) {
    const identity = await requestJson("reddit", "https://oauth.reddit.com/api/v1/me", { headers: { Authorization: `Bearer ${token.accessToken}`, "User-Agent": "SocialOlla/connection" } }, client);
    const results: DiscoveredConnectionDestination[] = [];
    const id = text(identity.id); const name = text(identity.name);
    if (id) results.push(destination(`u_${id}`, name ? `u/${name}` : "Reddit account", "ACCOUNT", true, { accountLabel: name ? `u/${name}` : null }));
    try {
      const communities = await requestJson("reddit", "https://oauth.reddit.com/subreddits/mine/subscriber?limit=100", { headers: { Authorization: `Bearer ${token.accessToken}`, "User-Agent": "SocialOlla/connection" } }, client);
      const children = Array.isArray(record(communities).children) ? record(communities).children as unknown[] : [];
      for (const itemValue of children) { const item = record(itemValue); const data = record(item.data); const displayName = text(data.display_name); if (displayName) results.push(destination(displayName, `r/${displayName}`, "SUBREDDIT", true)); }
    } catch {
      // Identity connection remains valid when the account cannot enumerate communities.
    }
    return results;
  },
  async verifyEligibility({ token, destination: wanted, http: client = http }) { return verifyFromList(await this.discoverDestinations({ token, http: client }), wanted); },
};

export const CONNECTION_PROVIDER_ADAPTERS: Readonly<Partial<Record<PublishingPlatform, ConnectionProviderAdapter>>> = {
  facebook,
  threads,
  google_business: googleAdapter("google_business", googleBusinessScopes),
  linkedin,
  tiktok,
  youtube: googleAdapter("youtube", youtubeScopes),
  pinterest,
  x,
  reddit,
};

export function connectionProvider(platform: PublishingPlatform): ConnectionProviderAdapter | null {
  return CONNECTION_PROVIDER_ADAPTERS[platform] ?? null;
}
