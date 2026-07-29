import { beforeEach, describe, expect, it, vi } from "vitest";

import { runApifyActor } from "./apify-client";
import { createApifyInstagramProvider } from "./apify-instagram-provider";
import { normalizeApifyInstagramPayload } from "./normalize-apify-instagram";
import { SocialProviderError } from "./types";

vi.mock("./apify-client", () => ({
  runApifyActor: vi.fn(),
}));

vi.mock("./normalize-apify-instagram", () => ({
  normalizeApifyInstagramPayload: vi.fn(),
}));

describe("createApifyInstagramProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a safe public error when Apify config is missing", async () => {
    const originalToken = process.env.APIFY_API_TOKEN;
    const originalActor = process.env.APIFY_INSTAGRAM_ACTOR_ID;

    delete process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_INSTAGRAM_ACTOR_ID;

    const provider = createApifyInstagramProvider();

    await expect(
      provider.fetchAudit({
        url: "https://www.instagram.com/example/",
        limit: 30,
      }),
    ).rejects.toMatchObject({
      name: "SocialProviderError",
      publicMessage: "We could not analyze this profile. Please check that it is public and try again.",
    } satisfies Partial<SocialProviderError>);

    process.env.APIFY_API_TOKEN = originalToken;
    process.env.APIFY_INSTAGRAM_ACTOR_ID = originalActor;
  });

  it("uses URL mode without profile-search settings", async () => {
    const originalToken = process.env.APIFY_API_TOKEN;
    const originalActor = process.env.APIFY_INSTAGRAM_ACTOR_ID;
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.APIFY_INSTAGRAM_ACTOR_ID = "apify/instagram-scraper";

    vi.mocked(runApifyActor).mockResolvedValue({
      items: [],
      runId: "run-1",
      datasetId: "dataset-1",
    });
    vi.mocked(normalizeApifyInstagramPayload).mockReturnValue({} as never);

    await createApifyInstagramProvider().fetchAudit({
      url: "https://www.instagram.com/delve.interiors/",
      limit: 7,
    });

    expect(runApifyActor).toHaveBeenCalledWith({
      token: "test-token",
      actorId: "apify/instagram-scraper",
      input: {
        directUrls: ["https://www.instagram.com/delve.interiors/"],
        resultsType: "posts",
        resultsLimit: 7,
        addParentData: true,
      },
    });

    process.env.APIFY_API_TOKEN = originalToken;
    process.env.APIFY_INSTAGRAM_ACTOR_ID = originalActor;
  });
});
