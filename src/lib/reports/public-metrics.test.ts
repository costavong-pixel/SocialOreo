import { describe, expect, it } from "vitest";

import { buildPublicMetrics } from "./public-metrics";

describe("buildPublicMetrics", () => {
  it("builds public-only performance metrics and patterns", () => {
    const metrics = buildPublicMetrics(
      { username: "example", followerCount: 1000 },
      [
        { id: "one", url: "https://example.com/one", caption: "How to make dinner", hashtags: ["food"], viewCount: 1000, likeCount: 100, commentCount: 20, postedAt: new Date("2026-07-06T14:00:00Z"), durationSeconds: 12, audioName: "Kitchen beat", transcriptIfAvailable: "Start by showing the finished dish." },
        { id: "two", url: "https://example.com/two", caption: "Is this worth it?", hashtags: [], viewCount: 300, likeCount: 30, commentCount: 5, postedAt: new Date("2026-07-07T00:00:00Z"), durationSeconds: 30 },
      ],
    );

    expect(metrics.summary.totalViews).toBe(1300);
    expect(metrics.summary.medianViews).toBe(650);
    expect(metrics.summary.engagementPerView).toBeCloseTo(155 / 1300);
    expect(metrics.topReels[0]?.id).toBe("one");
    expect(metrics.bottomReels[0]?.id).toBe("two");
    expect(metrics.reelEvidence?.map((reel) => reel.recommendation)).toEqual(["KEEP", "STOP"]);
    expect(metrics.reelEvidence?.[0]?.evidence).toContain("1,000 public views versus a 650 typical reel");
    expect(metrics.reelEvidence?.[1]?.nextTest).toContain("Do not repeat this exact opening");
    expect(metrics.contentIntelligence?.transcriptCount).toBe(1);
    expect(metrics.contentIntelligence?.audioPatterns[0]).toMatchObject({ label: "Kitchen beat", sampleSize: 1, averageViews: 1000 });
    expect(metrics.contentIntelligence?.transcriptOpenings[0]?.opening).toBe("Start by showing the finished dish");
    expect(metrics.hookPatterns[0]?.label).toBe("How-to hooks");
    expect(metrics.postingWindows).toHaveLength(2);
    expect(metrics.postingWindows.some((window) => window.label === "Tue 00:00 UTC")).toBe(true);
    expect(metrics.viewDistribution.reduce((total, bin) => total + bin.count, 0)).toBe(2);
    expect(metrics.postingCalendar).toHaveLength(42);
    expect(metrics.postingCalendar.find((day) => day.isoDate === "2026-07-06")).toMatchObject({ count: 1, totalViews: 1000 });
    expect(metrics.postingHeatmap.find((cell) => cell.weekday === "Mon" && cell.hour === 14)).toMatchObject({ count: 1, averageViews: 1000 });
    expect(metrics.contentTypePatterns[0]?.label).toBe("Tutorial");
    expect(metrics.performanceMap).toMatchObject({ medianViews: 650, points: [{ id: "one", quadrant: "HIGH_REACH_HIGH_INTERACTION" }, { id: "two", quadrant: "LOWER_REACH_LOWER_INTERACTION" }] });
  });

  it("withholds metrics that are not present in public data", () => {
    const metrics = buildPublicMetrics(null, [{ id: "one", url: "https://example.com/one", hashtags: [] }]);

    expect(metrics.summary.totalViews).toBeUndefined();
    expect(metrics.summary.engagementPerView).toBeUndefined();
    expect(metrics.topReels).toEqual([]);
    expect(metrics.reelEvidence).toHaveLength(1);
    expect(metrics.reelEvidence?.[0]?.recommendation).toBe("CHANGE");
    expect(metrics.viewDistribution).toEqual([]);
    expect(metrics.postingCalendar).toEqual([]);
    expect(metrics.performanceMap).toBeUndefined();
  });
});
