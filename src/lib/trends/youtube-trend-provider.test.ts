import { TrendSourceType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchYouTubeTrendVideos } from "./youtube-trend-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchYouTubeTrendVideos", () => {
  it("uses only public short-form video data for a capped hashtag scan", async () => {
    vi.stubEnv("YOUTUBE_TREND_DISCOVERY_ENABLED", "true");
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: { videoId: "video-1" } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "video-1", snippet: { title: "A #hook", description: "Watch this", channelTitle: "Creator", publishedAt: "2026-07-18T00:00:00Z", thumbnails: { high: { url: "https://img.example/1" } } }, contentDetails: { duration: "PT59S" }, statistics: { viewCount: "4200", likeCount: "210", commentCount: "8" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const videos = await fetchYouTubeTrendVideos({ sourceType: TrendSourceType.HASHTAG, query: "smallbusiness" });

    expect(videos).toEqual([expect.objectContaining({ platform: "youtube", url: "https://www.youtube.com/watch?v=video-1", viewCount: 4200, likeCount: 210, commentCount: 8, hashtags: ["hook"] })]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=%23smallbusiness");
    expect(String(fetchMock.mock.calls[0][0])).toContain("videoDuration=short");
  });
});
