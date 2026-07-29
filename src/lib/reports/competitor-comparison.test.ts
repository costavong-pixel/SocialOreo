import { describe, expect, it } from "vitest";

import { buildCompetitorComparison } from "./competitor-comparison";

const metrics = (medianViews: number, engagementPerView: number) => ({
  summary: { reelsWithViews: 7, medianViews, engagementPerView },
  topReels: [{ id: "reel-1", url: "https://instagram.com/reel/1", caption: "How to make your next reel clearer.", views: medianViews, reason: "Highest public views in this audit." }],
  bottomReels: [],
  viewDistribution: [],
  postingCalendar: [],
  postingHeatmap: [],
  postingWindows: [{ label: "Tue 20:00 UTC", sampleSize: 1, averageViews: medianViews }],
  durationPatterns: [{ label: "0â€“15 seconds", sampleSize: 2, averageViews: medianViews }],
  captionPatterns: [{ label: "13â€“40 words", sampleSize: 2, averageViews: medianViews }],
  hashtagPatterns: [],
  hookPatterns: [{ label: "How-to hooks", sampleSize: 2, averageViews: medianViews }],
  contentTypePatterns: [],
});

describe("buildCompetitorComparison", () => {
  it("uses only saved public metrics and frames ideas as tests", () => {
    const comparison = buildCompetitorComparison(
      { id: "mine", label: "Your report", score: 52, campaignGoal: "followers", publicMetrics: metrics(800, 0.04) },
      { id: "theirs", label: "@competitor", score: 68, campaignGoal: "followers", publicMetrics: metrics(1200, 0.06) },
    );

    expect(comparison.metrics).toHaveLength(4);
    expect(comparison.scoreIsComparable).toBe(true);
    expect(comparison.contentGaps).toHaveLength(3);
    expect(comparison.hookExtractions[0]).toMatchObject({
      pattern: "How-to hooks",
      sourceHook: "How to make your next reel clearer.",
      testHook: expect.stringContaining("clear outcome"),
    });
    expect(comparison.metrics[0]).toEqual({ label: "Campaign score", yours: "52/100", competitor: "68/100" });
    expect(comparison.studyIdeas.join(" ")).toContain("test it in one of your next reels");
  });

  it("keeps the suggested next step focused on the observed hook pattern", () => {
    const comparison = buildCompetitorComparison(
      { id: "mine", label: "Your report", score: 52, campaignGoal: "followers", targetAudience: "first-time homeowners", offerOrCta: "book a design consult", publicMetrics: metrics(800, 0.04) },
      { id: "theirs", label: "@competitor", score: 68, campaignGoal: "followers", publicMetrics: metrics(1200, 0.06) },
    );

    expect(comparison.hookExtractions[0]?.testHook).toContain("clear outcome");
  });

  it("does not treat scores as a ranking when the campaign goals differ", () => {
    const comparison = buildCompetitorComparison(
      { id: "mine", label: "Your report", score: 52, campaignGoal: "followers", publicMetrics: metrics(800, 0.04) },
      { id: "theirs", label: "@competitor", score: 68, campaignGoal: "lead_generation", publicMetrics: metrics(1200, 0.06) },
    );

    expect(comparison.scoreIsComparable).toBe(false);
    expect(comparison.studyIdeas[0]).toContain("winner and loser");
  });

  it("turns different competitor patterns into bounded tests", () => {
    const comparison = buildCompetitorComparison(
      { id: "mine", label: "Your report", score: 52, campaignGoal: "followers", publicMetrics: metrics(800, 0.04) },
      {
        id: "theirs",
        label: "@competitor",
        score: 68,
        campaignGoal: "followers",
        publicMetrics: {
          ...metrics(1200, 0.06),
          hookPatterns: [{ label: "Question hooks", sampleSize: 3, averageViews: 1200 }],
          durationPatterns: [{ label: "46+ seconds", sampleSize: 2, averageViews: 900 }],
          captionPatterns: [{ label: "41+ words", sampleSize: 2, averageViews: 900 }],
        },
      },
    );

    expect(comparison.contentGaps.map((gap) => gap.category)).toEqual(["Hook format", "Reel length", "Caption style"]);
    expect(comparison.contentGaps[0]).toMatchObject({ title: "Test question hooks", test: expect.stringContaining("question") });
    expect(comparison.contentGaps[0].evidence).toContain("saved sample");
  });
});
