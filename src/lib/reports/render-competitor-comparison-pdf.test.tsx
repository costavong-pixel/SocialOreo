import { describe, expect, it } from "vitest";

import { renderCompetitorComparisonPdf } from "./render-competitor-comparison-pdf";

describe("renderCompetitorComparisonPdf", () => {
  it("creates a downloadable client comparison PDF", async () => {
    const pdf = await renderCompetitorComparisonPdf({
      yourLabel: "@yourbrand",
      competitorLabel: "@competitor",
      yourGoal: "More followers",
      competitorGoal: "More followers",
      comparison: {
        scoreIsComparable: true,
        metrics: [{ label: "Campaign score", yours: "62/100", competitor: "71/100" }],
        contentGaps: [{ category: "Hook format", title: "Test question hooks", evidence: "Saved public sample.", test: "Ask a specific question." }],
        hookExtractions: [{ sourceHook: "What would you change first?", pattern: "Question hooks", evidence: "2.4K public views.", testHook: "What should homeowners do first?", sourceUrl: "https://instagram.com/reel/example" }],
        studyIdeas: ["Run one small test."],
      },
    });

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
