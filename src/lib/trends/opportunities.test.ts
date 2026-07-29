import { describe, expect, it } from "vitest";

import { buildCrossPlatformOpportunities } from "./opportunities";

const needsSecondCapture = {
  captureCount: 1,
  sourceReelCount: 20,
  repeatedSourceCount: 0,
  firstCapturedAt: new Date("2026-07-18T12:00:00.000Z"),
  latestCapturedAt: new Date("2026-07-18T12:00:00.000Z"),
  status: "NEEDS_SECOND_CAPTURE" as const,
};

const ready = { ...needsSecondCapture, captureCount: 2, repeatedSourceCount: 3, status: "READY_TO_COMPARE" as const };

describe("buildCrossPlatformOpportunities", () => {
  it("shows cross-platform coverage without calling one capture a trend", () => {
    expect(buildCrossPlatformOpportunities([
      { platform: "TIKTOK", sourceType: "HASHTAG", query: "#SmallBusiness", readiness: needsSecondCapture },
      { platform: "YOUTUBE", sourceType: "HASHTAG", query: "smallbusiness", readiness: needsSecondCapture },
    ])).toEqual([expect.objectContaining({ query: "#SmallBusiness", platforms: ["TIKTOK", "YOUTUBE"], readyPlatforms: [], status: "NEEDS_MOVEMENT_EVIDENCE" })]);
  });

  it("makes a source eligible only after every participating platform has recurring public evidence", () => {
    expect(buildCrossPlatformOpportunities([
      { platform: "INSTAGRAM", sourceType: "KEYWORD", query: "product demos", readiness: ready },
      { platform: "TIKTOK", sourceType: "KEYWORD", query: "Product demos", readiness: ready },
    ])[0]).toMatchObject({ status: "READY_TO_ADAPT", readyPlatforms: ["INSTAGRAM", "TIKTOK"] });
  });
});
