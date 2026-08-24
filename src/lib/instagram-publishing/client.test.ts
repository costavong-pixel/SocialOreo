import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyInstagramPublishingEligibility } from "./client";

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
