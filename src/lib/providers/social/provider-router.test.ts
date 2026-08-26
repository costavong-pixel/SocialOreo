import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  instagram: vi.fn(),
  tiktok: vi.fn(),
}));

vi.mock("./apify-instagram-provider", () => ({
  createApifyInstagramProvider: () => ({ fetchAudit: mocks.instagram }),
}));
vi.mock("./apify-tiktok-provider", () => ({
  createApifyTikTokProvider: () => ({ fetchAudit: mocks.tiktok }),
}));

describe("social provider router", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps the deterministic fixture as the default staging-safe path", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");

    const { fetchSocialAudit } = await import("./provider-router");
    const result = await fetchSocialAudit("instagram", { url: "https://www.instagram.com/example/", limit: 30 });

    expect(result.profile.provider).toBe("provider-disabled");
    expect(mocks.instagram).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "staging"],
    ["staging", "preview"],
  ])("refuses live providers outside the exact staging runtime (%s/%s)", async (nodeEnv, socialollaEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("SOCIALOLLA_ENV", socialollaEnv);
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");

    const { fetchSocialAudit } = await import("./provider-router");
    await expect(fetchSocialAudit("instagram", { url: "https://www.instagram.com/example/", limit: 30 })).rejects.toThrow(
      "disabled outside the exact staging runtime",
    );
    expect(mocks.instagram).not.toHaveBeenCalled();
  });

  it("routes Instagram to Apify only after the exact live boundary passes", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    mocks.instagram.mockResolvedValue({ profile: { provider: "apify" }, videos: [] });

    const { fetchSocialAudit } = await import("./provider-router");
    const input = { url: "https://www.instagram.com/example/", limit: 30 };
    await expect(fetchSocialAudit("instagram", input)).resolves.toEqual({ profile: { provider: "apify" }, videos: [] });
    expect(mocks.instagram).toHaveBeenCalledWith(input);
  });

  it("routes TikTok to Apify and does not pretend YouTube is implemented", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    mocks.tiktok.mockResolvedValue({ profile: { provider: "apify" }, videos: [] });

    const { fetchSocialAudit } = await import("./provider-router");
    await expect(fetchSocialAudit("tiktok", { url: "https://www.tiktok.com/@example", limit: 30 })).resolves.toMatchObject({
      profile: { provider: "apify" },
    });
    await expect(fetchSocialAudit("youtube", { url: "https://www.youtube.com/@example", limit: 30 })).rejects.toThrow(
      "No live social provider is configured for youtube",
    );
  });
});
