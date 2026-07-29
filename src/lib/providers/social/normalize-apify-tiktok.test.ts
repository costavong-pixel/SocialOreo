import { describe, expect, it } from "vitest";
import { normalizeApifyTikTokPayload, normalizeApifyTikTokTrendVideos } from "./normalize-apify-tiktok";

describe("normalizeApifyTikTokPayload", () => {
  it("maps public video fields and rejects videos from another profile", () => {
    const result = normalizeApifyTikTokPayload([
      {
        id: "video-1",
        text: "A useful #hook for @friends",
        createTimeISO: "2026-07-16T12:00:00.000Z",
        playCount: 4200,
        diggCount: 210,
        commentCount: 8,
        shareCount: 4,
        authorMeta: { id: "profile-1", name: "creator", nickName: "Creator", fans: 3000, following: 120, video: 42 },
        videoMeta: { duration: 22, coverUrl: "https://cdn.example/cover.jpg" },
      },
      { id: "video-2", authorMeta: { name: "somebodyelse" } },
    ], "https://www.tiktok.com/@creator", 7);

    expect(result.profile).toMatchObject({ platform: "tiktok", username: "creator", followerCount: 3000 });
    expect(result.videos).toEqual([expect.objectContaining({
      url: "https://www.tiktok.com/@creator/video/video-1",
      viewCount: 4200, likeCount: 210, commentCount: 8, shareCount: 4,
      hashtags: ["hook"], mentions: ["friends"], durationSeconds: 22,
    })]);
  });
});

describe("normalizeApifyTikTokTrendVideos", () => {
  it("keeps public videos from multiple creators and removes duplicate URLs", () => {
    const videos = normalizeApifyTikTokTrendVideos([
      { id: "video-1", text: "#smallbusiness", authorMeta: { name: "creator-one" } },
      { id: "video-1", text: "#smallbusiness", authorMeta: { name: "creator-one" } },
      { id: "video-2", text: "#smallbusiness", authorMeta: { name: "creator-two" } },
    ], 20);

    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.url)).toEqual([
      "https://www.tiktok.com/@creator-one/video/video-1",
      "https://www.tiktok.com/@creator-two/video/video-2",
    ]);
  });
});
