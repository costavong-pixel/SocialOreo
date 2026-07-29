import { beforeEach, describe, expect, it, vi } from "vitest";
import { runApifyActor } from "./apify-client";
import { createApifyTikTokProvider, estimateApifyTikTokCost } from "./apify-tiktok-provider";
import { normalizeApifyTikTokPayload } from "./normalize-apify-tiktok";

vi.mock("./apify-client", () => ({ runApifyActor: vi.fn() }));
vi.mock("./normalize-apify-tiktok", () => ({ normalizeApifyTikTokPayload: vi.fn() }));

describe("createApifyTikTokProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses profile videos only and disables billable extras", async () => {
    const originalToken = process.env.APIFY_API_TOKEN;
    const originalActor = process.env.APIFY_TIKTOK_ACTOR_ID;
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.APIFY_TIKTOK_ACTOR_ID = "clockworks/tiktok-scraper";
    vi.mocked(runApifyActor).mockResolvedValue({ items: [], runId: "run-1", datasetId: "dataset-1" });
    vi.mocked(normalizeApifyTikTokPayload).mockReturnValue({} as never);

    await createApifyTikTokProvider().fetchAudit({ url: "https://www.tiktok.com/@creator", limit: 7 });

    expect(runApifyActor).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "clockworks/tiktok-scraper",
      input: expect.objectContaining({
        profiles: ["creator"], resultsPerPage: 7, profileScrapeSections: ["videos"],
        commentsPerPost: 0, shouldDownloadVideos: false, shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false, shouldDownloadSubtitles: false,
      }),
    }));
    process.env.APIFY_API_TOKEN = originalToken;
    process.env.APIFY_TIKTOK_ACTOR_ID = originalActor;
  });

  it("uses the conservative public price cap", () => {
    expect(estimateApifyTikTokCost(7)).toBe(0.0269);
    expect(estimateApifyTikTokCost(30)).toBe(0.112);
  });
});
