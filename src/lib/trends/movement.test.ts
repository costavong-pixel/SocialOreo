import { describe, expect, it } from "vitest";

import { buildTrendMovementReadiness } from "./movement";

describe("buildTrendMovementReadiness", () => {
  it("requires two completed captures before a source can be compared", () => {
    expect(buildTrendMovementReadiness([
      { completedAt: new Date("2026-07-01T12:00:00.000Z"), videos: [{ sourceUrl: "https://instagram.com/reel/one" }] },
    ])).toMatchObject({
      captureCount: 1,
      sourceReelCount: 1,
      repeatedSourceCount: 0,
      status: "NEEDS_SECOND_CAPTURE",
    });
  });

  it("does not claim movement when two captures have no repeated public source", () => {
    expect(buildTrendMovementReadiness([
      { completedAt: new Date("2026-07-01T12:00:00.000Z"), videos: [{ sourceUrl: "https://instagram.com/reel/one" }] },
      { completedAt: new Date("2026-07-08T12:00:00.000Z"), videos: [{ sourceUrl: "https://instagram.com/reel/two" }] },
    ])).toMatchObject({
      captureCount: 2,
      sourceReelCount: 2,
      repeatedSourceCount: 0,
      status: "NO_REPEATED_SOURCES",
    });
  });

  it("makes repeatable public evidence available only when a source recurs", () => {
    expect(buildTrendMovementReadiness([
      { completedAt: new Date("2026-07-01T12:00:00.000Z"), videos: [{ sourceUrl: "https://instagram.com/reel/one" }, { sourceUrl: "https://instagram.com/reel/two" }] },
      { completedAt: new Date("2026-07-08T12:00:00.000Z"), videos: [{ sourceUrl: "https://instagram.com/reel/one" }] },
    ])).toMatchObject({
      captureCount: 2,
      sourceReelCount: 2,
      repeatedSourceCount: 1,
      status: "READY_TO_COMPARE",
    });
  });
});
