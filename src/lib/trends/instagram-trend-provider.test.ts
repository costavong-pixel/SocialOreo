import { TrendSourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildInstagramTrendActorInput } from "./instagram-trend-provider";

describe("buildInstagramTrendActorInput", () => {
  it("builds bounded public-source requests for each watchlist type", () => {
    expect(buildInstagramTrendActorInput({ sourceType: TrendSourceType.HASHTAG, query: "smallbusiness" })).toMatchObject({
      directUrls: ["https://www.instagram.com/explore/tags/smallbusiness/"],
      resultsType: "reels",
      resultsLimit: 20,
      onlyPostsNewerThan: "7 days",
    });
    expect(buildInstagramTrendActorInput({ sourceType: TrendSourceType.CREATOR, query: "creator.name" })).toMatchObject({
      directUrls: ["https://www.instagram.com/creator.name/"],
    });
    expect(buildInstagramTrendActorInput({ sourceType: TrendSourceType.KEYWORD, query: "small business" })).toMatchObject({
      search: "small business",
      searchType: "hashtag",
      searchLimit: 1,
    });
  });
});
