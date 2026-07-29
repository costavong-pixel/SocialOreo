import { afterEach, describe, expect, it, vi } from "vitest";

import { runApifyActor } from "./apify-client";

describe("runApifyActor actor id URL encoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the normalized and encoded actor id in the request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runApifyActor({
        token: "test-token",
        actorId: "apify/instagram-scraper",
        input: { directUrls: ["https://www.instagram.com/example/"] },
      }),
    ).rejects.toThrow("Apify actor run failed with status 400.");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=test-token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
