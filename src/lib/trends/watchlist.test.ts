import { TrendPlatform, TrendSourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizeTrendWatchlistInput } from "./watchlist";

function form(values: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(values)) value.set(key, item);
  return value;
}

describe("normalizeTrendWatchlistInput", () => {
  it("normalizes hashtag and creator prefixes", () => {
    expect(normalizeTrendWatchlistInput(form({ platform: "INSTAGRAM", sourceType: "HASHTAG", query: " #Small Business " }))).toEqual({
      platform: TrendPlatform.INSTAGRAM,
      sourceType: TrendSourceType.HASHTAG,
      query: "smallbusiness",
    });
    expect(normalizeTrendWatchlistInput(form({ platform: "TIKTOK", sourceType: "CREATOR", query: " @Creator.Name " }))).toEqual({
      platform: TrendPlatform.TIKTOK,
      sourceType: TrendSourceType.CREATOR,
      query: "creator.name",
    });
  });

  it("rejects unsupported or empty sources", () => {
    expect(normalizeTrendWatchlistInput(form({ platform: "FACEBOOK", sourceType: "HASHTAG", query: "video" }))).toBeNull();
    expect(normalizeTrendWatchlistInput(form({ platform: "YOUTUBE", sourceType: "KEYWORD", query: "   " }))).toBeNull();
  });
});
