import { describe, expect, it } from "vitest";

import { normalizeApifyInstagramPayload, normalizeApifyInstagramTrendVideos } from "./normalize-apify-instagram";
import { SocialProviderError } from "./types";

describe("normalizeApifyInstagramPayload", () => {
  it("normalizes public reels from a discovery response without profile-scoping them", () => {
    const videos = normalizeApifyInstagramTrendVideos(
      [
        { id: "first", type: "Reel", ownerUsername: "creatorone", url: "https://www.instagram.com/reel/FIRST/", videoUrl: "https://cdn.example/first.mp4", videoViewCount: 1200 },
        { id: "second", type: "Video", ownerUsername: "creatortwo", url: "https://www.instagram.com/reel/SECOND/", videoUrl: "https://cdn.example/second.mp4", videoViewCount: 800 },
        { id: "photo", type: "Image", url: "https://www.instagram.com/p/PHOTO/" },
      ],
      20,
    );

    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.url)).toEqual([
      "https://www.instagram.com/reel/FIRST/",
      "https://www.instagram.com/reel/SECOND/",
    ]);
  });

  it("maps the current Apify reel play-count fields to visible public views", () => {
    const videos = normalizeApifyInstagramTrendVideos(
      [
        { id: "reel-play-count", type: "Video", productType: "clips", url: "https://www.instagram.com/reel/PLAYCOUNT/", videoUrl: "https://cdn.example/reel.mp4", igPlayCount: 3100 },
      ],
      20,
    );

    expect(videos[0]?.viewCount).toBe(3100);
  });

  it("maps Apify Instagram items into normalized profile and videos", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          id: "profile-1",
          username: "examplechef",
          fullName: "Example Chef",
          biography: "Restaurant in Austin",
          followersCount: 12000,
          followsCount: 400,
          postsCount: 180,
          profilePicUrl: "https://cdn.example/profile.jpg",
        },
        {
          id: "post-1",
          type: "Video",
          ownerUsername: "examplechef",
          shortCode: "ABC123",
          url: "https://www.instagram.com/reel/ABC123/",
          caption: "Best tacos in #Austin @localspot",
          videoViewCount: 45000,
          likesCount: 2200,
          commentsCount: 88,
          timestamp: "2026-06-01T12:00:00.000Z",
          displayUrl: "https://cdn.example/thumb.jpg",
          videoUrl: "https://cdn.example/video.mp4",
        },
      ],
      "https://www.instagram.com/examplechef/",
      30,
    );

    expect(result.profile.username).toBe("examplechef");
    expect(result.profile.followerCount).toBe(12000);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.providerVideoId).toBe("post-1");
    expect(result.videos[0]?.viewCount).toBe(45000);
    expect(result.videos[0]?.hashtags).toContain("Austin");
    expect(result.videos[0]?.mentions).toContain("localspot");
  });

  it("handles missing optional fields without crashing", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          ownerUsername: "minimal",
          caption: "Plain caption",
          type: "video",
        },
      ],
      "https://www.instagram.com/minimal/",
      10,
    );

    expect(result.profile.username).toBe("minimal");
    expect(result.videos[0]?.likeCount).toBeUndefined();
    expect(result.videos[0]?.caption).toBe("Plain caption");
  });

  it("accepts case-only differences between the requested and returned Instagram username", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          username: "examplechef",
          type: "Video",
          shortCode: "ABC123",
          videoUrl: "https://cdn.example/video.mp4",
        },
      ],
      "https://www.instagram.com/ExampleChef/",
      10,
    );

    expect(result.profile.username).toBe("examplechef");
    expect(result.videos).toHaveLength(1);
  });

  it("rejects Apify responses for a different Instagram profile than the requested handle", () => {
    expect(() =>
      normalizeApifyInstagramPayload(
        [
          {
            id: "profile-1",
            username: "vacationdesignhost",
            fullName: "Vacation Design Host",
          },
          {
            id: "reel-1",
            ownerUsername: "vacationdesignhost",
            type: "Reel",
            shortCode: "REEL1",
            caption: "Tour this rental transformation",
            videoUrl: "https://cdn.example/reel.mp4",
          },
        ],
        "https://www.instagram.com/slabburger/",
        10,
      ),
    ).toThrow(SocialProviderError);
  });

  it("accepts videos with a different ownerUsername when the primary username matches the request", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          id: "profile-1",
          username: "tatiannatt",
          fullName: "Tatianna Taylor-Tait",
        },
        {
          id: "reel-1",
          username: "tatiannatt",
          ownerUsername: "homenetworkca",
          type: "Reel",
          shortCode: "REEL1",
          videoUrl: "https://cdn.example/reel.mp4",
        },
      ],
      "https://www.instagram.com/tatiannatt/",
      10,
    );

    expect(result.profile.username).toBe("tatiannatt");
    expect(result.videos).toHaveLength(1);
  });

  it("keeps requested-profile rows while excluding unrelated actor rows", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          id: "profile-1",
          username: "slabburger",
          fullName: "Slab Burger",
        },
        {
          id: "reel-1",
          ownerUsername: "slabburger",
          type: "Reel",
          shortCode: "REEL1",
          videoUrl: "https://cdn.example/reel-1.mp4",
        },
        {
          id: "foreign-reel",
          ownerUsername: "vacationdesignhost",
          type: "Reel",
          shortCode: "FOREIGN1",
          videoUrl: "https://cdn.example/foreign.mp4",
        },
      ],
      "https://www.instagram.com/slabburger/",
      10,
    );

    expect(result.profile.username).toBe("slabburger");
    expect(result.videos.map((video) => video.providerVideoId)).toEqual(["reel-1"]);
  });

  it("rejects mixed Apify payloads when a video only identifies a different owner profile", () => {
    expect(() =>
      normalizeApifyInstagramPayload(
        [
          {
            id: "profile-1",
            username: "slabburger",
            fullName: "Slab Burger",
          },
          {
            id: "reel-1",
            ownerUsername: "vacationdesignhost",
            type: "Reel",
            shortCode: "REEL1",
            videoUrl: "https://cdn.example/reel.mp4",
          },
        ],
        "https://www.instagram.com/slabburger/",
        10,
      ),
    ).toThrow(SocialProviderError);
  });

  it("throws when Apify returns no items", () => {
    expect(() =>
      normalizeApifyInstagramPayload([], "https://www.instagram.com/example/", 30),
    ).toThrow("Apify returned no Instagram data");
  });

  it("returns only reels and videos, excluding photos and carousels with captions", () => {
    const result = normalizeApifyInstagramPayload(
      [
        {
          id: "profile-1",
          username: "examplechef",
          fullName: "Example Chef",
        },
        {
          id: "photo-1",
          type: "Image",
          shortCode: "PHOTO1",
          caption: "Still photo caption #food",
          displayUrl: "https://cdn.example/photo.jpg",
        },
        {
          id: "carousel-1",
          type: "Sidecar",
          shortCode: "CAR1",
          caption: "Carousel caption with text only",
          childPosts: [
            { type: "Image", caption: "Slide 1" },
            { type: "Image", caption: "Slide 2" },
          ],
        },
        {
          id: "reel-1",
          type: "Reel",
          ownerUsername: "examplechef",
          shortCode: "REEL1",
          caption: "Actual reel #reel",
          videoUrl: "https://cdn.example/reel.mp4",
          videoViewCount: 12000,
        },
        {
          id: "video-1",
          type: "Video",
          ownerUsername: "examplechef",
          shortCode: "VID1",
          caption: "Actual video post",
          videoUrl: "https://cdn.example/video.mp4",
          videoViewCount: 8000,
        },
      ],
      "https://www.instagram.com/examplechef/",
      30,
    );

    expect(result.videos).toHaveLength(2);
    expect(result.videos.map((video) => video.providerVideoId)).toEqual(["reel-1", "video-1"]);
    expect(result.videos.every((video) => video.videoUrlIfAvailable)).toBe(true);
  });

  it("returns a controlled error when the profile has no public reels", () => {
    expect(() =>
      normalizeApifyInstagramPayload(
        [
          {
            id: "profile-1",
            username: "photoonly",
            type: "Image",
          },
        ],
        "https://www.instagram.com/photoonly/",
        30,
      ),
    ).toThrow(SocialProviderError);

    try {
      normalizeApifyInstagramPayload(
        [{ id: "profile-1", username: "photoonly", type: "Image" }],
        "https://www.instagram.com/photoonly/",
        30,
      );
    } catch (error) {
      expect(error).toMatchObject({
        publicMessage: "We could not find public reels for this profile. Check that it is public and has reels, then try again.",
      });
    }
  });
});
