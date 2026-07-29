import { describe, expect, it } from "vitest";

import { buildPublicSnapshotMetrics } from "./public-profile-snapshots";

describe("public profile snapshot metrics", () => {
  it("stores only public profile and visible reel aggregates", () => {
    const metrics = buildPublicSnapshotMetrics({
      profile: {
        platform: "instagram",
        provider: "apify",
        profileUrl: "https://www.instagram.com/example/",
        followerCount: 1200,
        followingCount: 90,
        postCount: 40,
      },
      videos: [
        {
          platform: "instagram",
          provider: "apify",
          url: "https://www.instagram.com/reel/one/",
          hashtags: [],
          mentions: [],
          viewCount: 100,
          likeCount: 10,
          commentCount: 5,
        },
        {
          platform: "instagram",
          provider: "apify",
          url: "https://www.instagram.com/reel/two/",
          hashtags: [],
          mentions: [],
          viewCount: 300,
          likeCount: 30,
          shareCount: 5,
          saveCount: 10,
        },
      ],
    });

    expect(metrics).toEqual({
      followerCount: 1200,
      followingCount: 90,
      postCount: 40,
      reelsCollected: 2,
      totalViews: 400,
      medianViews: 200,
      visibleInteractions: 60,
      visibleInteractionRate: 0.15,
    });
  });

  it("keeps unavailable public counts unavailable", () => {
    const metrics = buildPublicSnapshotMetrics({
      profile: { platform: "instagram", provider: "apify", profileUrl: "https://www.instagram.com/example/" },
      videos: [{ platform: "instagram", provider: "apify", url: "https://www.instagram.com/reel/one/", hashtags: [], mentions: [] }],
    });

    expect(metrics).toMatchObject({ reelsCollected: 1 });
    expect(metrics.totalViews).toBeUndefined();
    expect(metrics.visibleInteractionRate).toBeUndefined();
  });
});
