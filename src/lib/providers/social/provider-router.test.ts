import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSocialAuditRuntimeAllowed, providerDisabledEnabled } from "./provider-guard";

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

  it("keeps the fixture when the provider-disabled flag is absent or malformed", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    expect(providerDisabledEnabled({ NODE_ENV: "staging", SOCIALOLLA_ENV: "staging" })).toBe(true);
    expect(providerDisabledEnabled({ SOCIALOLLA_PROVIDER_DISABLED: "unexpected" })).toBe(true);

    const { fetchSocialAudit } = await import("./provider-router");
    const result = await fetchSocialAudit("instagram", { url: "https://www.instagram.com/example/", limit: 30 });

    expect(result.profile.provider).toBe("provider-disabled");
    expect(mocks.instagram).not.toHaveBeenCalled();
  });

  it("keeps production provider execution disabled by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");

    const { fetchSocialAudit } = await import("./provider-router");
    const result = await fetchSocialAudit("instagram", { url: "https://www.instagram.com/example/", limit: 30 });

    expect(result.profile.provider).toBe("provider-disabled");
    expect(liveSocialAuditRuntimeAllowed()).toBe(false);
    expect(mocks.instagram).not.toHaveBeenCalled();
    expect(mocks.tiktok).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "staging"],
    ["staging", "preview"],
    ["development", "staging"],
    ["test", "staging"],
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

  it("requires both production Watch gates and provider opt-in before the Watch worker can call Instagram", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED", "true");

    const { fetchSocialAudit } = await import("./provider-router");
    const input = { url: "https://www.instagram.com/example/", limit: 30 };

    await expect(fetchSocialAudit("instagram", input, { runtime: "production-watch-worker" }))
      .rejects.toThrow("disabled outside the exact staging runtime");
    expect(mocks.instagram).not.toHaveBeenCalled();

    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED", "false");
    await expect(fetchSocialAudit("instagram", input, { runtime: "production-watch-worker" }))
      .rejects.toThrow("disabled outside the exact staging runtime");
    expect(mocks.instagram).not.toHaveBeenCalled();

    await expect(fetchSocialAudit("instagram", input)).rejects.toThrow("disabled outside the exact staging runtime");
    expect(mocks.instagram).not.toHaveBeenCalled();

    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED", "true");
    mocks.instagram.mockResolvedValue({ profile: { provider: "apify" }, videos: [] });
    await expect(fetchSocialAudit("instagram", input, { runtime: "production-watch-worker" }))
      .resolves.toEqual({ profile: { provider: "apify" }, videos: [] });
    expect(mocks.instagram).toHaveBeenCalledWith(input);
  });

  it("never enables TikTok live execution in production, even with Watch provider gates set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED", "true");

    const { fetchSocialAudit } = await import("./provider-router");
    await expect(fetchSocialAudit("tiktok", { url: "https://www.tiktok.com/@example", limit: 30 }, { runtime: "production-watch-worker" }))
      .rejects.toThrow("TikTok production provider execution is disabled");
    expect(mocks.tiktok).not.toHaveBeenCalled();
    expect(mocks.instagram).not.toHaveBeenCalled();
  });

  it("does not turn provider-disabled TikTok production work into a fixture execution", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");

    const { fetchSocialAudit } = await import("./provider-router");
    await expect(fetchSocialAudit("tiktok", { url: "https://www.tiktok.com/@example", limit: 30 }, { runtime: "production-watch-worker" }))
      .rejects.toThrow("TikTok production provider execution is disabled");
    expect(mocks.tiktok).not.toHaveBeenCalled();
  });

  it("does not let the Watch production provider flag replace the worker flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_PROVIDER_ENABLED", "true");
    vi.stubEnv("SOCIALOLLA_PRODUCTION_WATCH_WORKER_ENABLED", " true");

    const { fetchSocialAudit } = await import("./provider-router");
    await expect(fetchSocialAudit("instagram", { url: "https://www.instagram.com/example/", limit: 30 }, { runtime: "production-watch-worker" }))
      .rejects.toThrow("disabled outside the exact staging runtime");
    expect(mocks.instagram).not.toHaveBeenCalled();
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
