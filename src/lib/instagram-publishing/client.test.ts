import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeInstagramPublishingAuthorizationCode, refreshInstagramPublishingToken, verifyInstagramPublishingEligibility } from "./client";

const config = {
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "https://staging.example.com/callback",
  graphVersion: "v25.0",
  tokenEncryptionKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("Instagram publishing eligibility", () => {
  it("uses the read-only publishing-limit edge without exposing the token in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstagramPublishingEligibility(config, "ig/user", "secret-token")).resolves.toBe(true);

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    expect((request as URL).toString()).toBe("https://graph.instagram.com/v25.0/ig%2Fuser/content_publishing_limit");
    expect(options).toEqual(expect.objectContaining({ headers: { Authorization: "Bearer secret-token" } }));
    expect((request as URL).toString()).not.toContain("secret-token");
  });

  it("fails closed when Meta rejects publishing eligibility", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "denied" } }), { status: 403 })));

    await expect(verifyInstagramPublishingEligibility(config, "ig_1", "secret-token")).rejects.toThrow("Instagram publishing authorization was rejected.");
  });
});

describe("Instagram publishing token lifecycle", () => {
  it("sends the short-lived token as the required long-lived exchange query parameter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-lived-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long-lived-token", expires_in: 60 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(exchangeInstagramPublishingAuthorizationCode(config, "authorization-code")).resolves.toEqual({ access_token: "long-lived-token", expires_in: 60 });

    const [longLivedRequest, longLivedOptions] = fetchMock.mock.calls[1] ?? [];
    const longLivedUrl = new URL((longLivedRequest as URL).toString());
    expect(longLivedUrl.origin + longLivedUrl.pathname).toBe("https://graph.instagram.com/access_token");
    expect(longLivedUrl.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(longLivedUrl.searchParams.get("client_secret")).toBe(config.clientSecret);
    expect(longLivedUrl.searchParams.get("access_token")).toBe("short-lived-token");
    expect(longLivedOptions).toEqual({ cache: "no-store" });
  });

  it("sends the long-lived token as the required refresh query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "refreshed-token", expires_in: 60 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshInstagramPublishingToken("long-lived-token")).resolves.toEqual({ access_token: "refreshed-token", expires_in: 60 });

    const [request, options] = fetchMock.mock.calls[0] ?? [];
    const refreshUrl = new URL((request as URL).toString());
    expect(refreshUrl.origin + refreshUrl.pathname).toBe("https://graph.instagram.com/refresh_access_token");
    expect(refreshUrl.searchParams.get("grant_type")).toBe("ig_refresh_token");
    expect(refreshUrl.searchParams.get("access_token")).toBe("long-lived-token");
    expect(options).toEqual({ cache: "no-store" });
  });
});
