import { describe, expect, it } from "vitest";
import type { ConnectionHttpClient } from "./contracts";
import { CONNECTION_PROVIDER_ADAPTERS } from "./provider-adapters";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("shared OAuth provider adapters", () => {
  it("declares the requested provider scopes and family endpoints", () => {
    const expected: Record<string, string[]> = {
      facebook: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
      threads: ["threads_basic", "threads_content_publish"],
      google_business: ["https://www.googleapis.com/auth/business.manage"],
      youtube: ["https://www.googleapis.com/auth/youtube.upload"],
      linkedin: ["openid", "profile", "email", "w_member_social"],
      tiktok: ["user.info.basic", "video.publish"],
      pinterest: ["boards:read", "boards:write", "pins:read", "pins:write"],
      x: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      reddit: ["identity", "submit"],
    };
    for (const [platform, scopes] of Object.entries(expected)) {
      const adapter = CONNECTION_PROVIDER_ADAPTERS[platform as keyof typeof CONNECTION_PROVIDER_ADAPTERS]!;
      expect(adapter.requiredScopes).toEqual(scopes);
      expect(adapter.authorizationUrl({ clientId: "client", redirectUri: `https://socialolla.com/api/connections/${platform}/callback`, state: "state", codeChallenge: adapter.supportsPkce ? "challenge" : undefined }).searchParams.get("state")).toBe("state");
    }
    expect(CONNECTION_PROVIDER_ADAPTERS.tiktok!.hardDisabled).toBe(true);
  });

  it("uses one callback, refresh, and disconnect contract for every non-Instagram provider", async () => {
    const providers = Object.entries(CONNECTION_PROVIDER_ADAPTERS).filter(([platform]) => platform !== "instagram") as Array<[keyof typeof CONNECTION_PROVIDER_ADAPTERS, NonNullable<(typeof CONNECTION_PROVIDER_ADAPTERS)[keyof typeof CONNECTION_PROVIDER_ADAPTERS]>]>;
    for (const [platform, adapter] of providers) {
      const tokenClient: ConnectionHttpClient = async () => response({ access_token: `${platform}-access`, refresh_token: `${platform}-refresh`, expires_in: 3600, scope: adapter.requiredScopes.join(" ") });
      const exchange = await adapter.exchangeCallback({ clientId: "client", clientSecret: "secret", code: "code", redirectUri: `https://socialolla.com/api/connections/${platform}/callback`, codeVerifier: adapter.supportsPkce ? "verifier" : undefined, http: tokenClient });
      expect(exchange).toMatchObject({ accessToken: `${platform}-access`, refreshToken: `${platform}-refresh` });
      const refreshed = await adapter.refresh({ clientId: "client", clientSecret: "secret", refreshToken: "refresh", http: tokenClient });
      expect(refreshed.accessToken).toBe(`${platform}-access`);
      await expect(adapter.revoke({ clientId: "client", clientSecret: "secret", accessToken: "access", http: async () => response({}) })).resolves.toBeUndefined();
    }
  });

  it("discovers Meta pages with page-scoped credentials", async () => {
    const client: ConnectionHttpClient = async (url) => {
      expect(String(url)).toContain("/me/accounts");
      return response({ data: [{ id: "page_1", name: "Slab Pizza", access_token: "page-token", tasks: ["PROFILE_PLUS_CREATE_CONTENT"] }] });
    };
    const destinations = await CONNECTION_PROVIDER_ADAPTERS.facebook!.discoverDestinations({ token: { accessToken: "user-token", scopes: [] }, http: client });
    expect(destinations[0]).toMatchObject({ platformUserId: "page_1", destinationType: "PAGE", accessToken: "page-token", eligible: true });
  });

  it("rejects Facebook Pages without an explicit content-creation task", async () => {
    const discover = (tasks: string[]) => CONNECTION_PROVIDER_ADAPTERS.facebook!.discoverDestinations({
      token: { accessToken: "user-token", scopes: [] },
      http: async () => response({ data: [{ id: "page_1", name: "Slab Pizza", access_token: "page-token", tasks }] }),
    });
    await expect(discover(["PROFILE_PLUS_MODERATE"])).resolves.toMatchObject([{ eligible: false }]);
    await expect(discover([])).resolves.toMatchObject([{ eligible: false }]);
    await expect(discover(["CREATE_CONTENT"])).resolves.toMatchObject([{ eligible: true }]);
  });

  it("accepts the documented Threads token response shape without inferring permissions", async () => {
    const token = await CONNECTION_PROVIDER_ADAPTERS.threads!.exchangeCallback({
      clientId: "threads-client",
      clientSecret: "threads-secret",
      code: "code",
      redirectUri: "https://socialolla.com/api/connections/threads/callback",
      http: async () => response({ access_token: "threads-access", user_id: "threads-user" }),
    });
    expect(token).toMatchObject({ accessToken: "threads-access", scopes: [] });
  });

  it("discovers Google locations and YouTube channels without exposing tokens", async () => {
    const googleClient: ConnectionHttpClient = async (url) => String(url).includes("/accounts") && !String(url).includes("/locations")
      ? response({ accounts: [{ name: "accounts/1" }] })
      : response({ locations: [{ name: "accounts/1/locations/2", title: "Slab Pizza" }] });
    const locations = await CONNECTION_PROVIDER_ADAPTERS.google_business!.discoverDestinations({ token: { accessToken: "google-token", scopes: [] }, http: googleClient });
    expect(locations[0]).toMatchObject({ platformUserId: "accounts/1/locations/2", destinationType: "LOCATION" });
    const youtube = await CONNECTION_PROVIDER_ADAPTERS.youtube!.discoverDestinations({ token: { accessToken: "youtube-token", scopes: [] }, http: async () => response({ items: [{ id: "channel_1", snippet: { title: "Slab Pizza" } }] }) });
    expect(youtube[0]).toMatchObject({ platformUserId: "channel_1", destinationType: "CHANNEL" });
  });

  it("supports TikTok creator eligibility while keeping publishing hard-disabled", async () => {
    const creator = await CONNECTION_PROVIDER_ADAPTERS.tiktok!.discoverDestinations({ token: { accessToken: "tiktok-token", scopes: [] }, http: async () => response({ data: { creator_open_id: "creator_1", display_name: "Slab Pizza" } }) });
    expect(creator[0]).toMatchObject({ platformUserId: "creator_1", eligible: true });
    expect(CONNECTION_PROVIDER_ADAPTERS.tiktok!.hardDisabled).toBe(true);
  });

  it("does not include provider secrets in sanitized request errors", async () => {
    await expect(CONNECTION_PROVIDER_ADAPTERS.facebook!.exchangeCallback({ clientId: "client-id", clientSecret: "super-secret", code: "code", redirectUri: "https://socialolla.com/callback", http: async () => response({}, 401) })).rejects.toMatchObject({ provider: "facebook" });
    try {
      await CONNECTION_PROVIDER_ADAPTERS.facebook!.exchangeCallback({ clientId: "client-id", clientSecret: "super-secret", code: "code", redirectUri: "https://socialolla.com/callback", http: async () => response({}, 401) });
    } catch (error) {
      expect(String(error)).not.toContain("super-secret");
    }
  });

  it("fails closed when a token response omits the granted scope set", async () => {
    await expect(CONNECTION_PROVIDER_ADAPTERS.facebook!.exchangeCallback({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code",
      redirectUri: "https://socialolla.com/callback",
      http: async () => response({ access_token: "access-token", expires_in: 3600 }),
    })).rejects.toMatchObject({ provider: "facebook" });
  });
});
