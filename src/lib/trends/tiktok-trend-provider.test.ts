import { TrendSourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildTikTokTrendActorInput } from "./tiktok-trend-provider";

describe("buildTikTokTrendActorInput", () => {
  it("builds capped public requests without media, comment, or transcript add-ons", () => {
    const common = {
      resultsPerPage: 20,
      commentsPerPost: 0,
      topLevelCommentsPerPost: 0,
      maxRepliesPerComment: 0,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    };

    expect(buildTikTokTrendActorInput({ sourceType: TrendSourceType.HASHTAG, query: "#smallbusiness" })).toEqual({
      ...common,
      hashtags: ["smallbusiness"],
    });
    expect(buildTikTokTrendActorInput({ sourceType: TrendSourceType.CREATOR, query: "@creator.name" })).toEqual({
      ...common,
      profiles: ["creator.name"],
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      excludePinnedPosts: true,
    });
    expect(buildTikTokTrendActorInput({ sourceType: TrendSourceType.KEYWORD, query: "small business" })).toEqual({
      ...common,
      searchQueries: ["small business"],
      searchSection: "/video",
      videoSearchSorting: "LATEST",
      videoSearchDateFilter: "PAST_WEEK",
    });
  });
});
