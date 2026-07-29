import { describe, expect, it } from "vitest";

import { renderAuditReportPdf } from "./render-audit-report-pdf";

describe("renderAuditReportPdf", () => {
  it("creates a downloadable PDF report", async () => {
    const pdf = await renderAuditReportPdf({
      profileUrl: "https://www.instagram.com/example/",
      videoCount: 7,
      overallScore: 68,
      summary: {
        headline: "A stronger opening can improve this campaign.",
        diagnosis: "The content has a clear opportunity to improve its first three seconds.",
      },
      actionPlan: ["Lead with a visible result."],
      contentPack: {
        strengths: ["The creator has a clear voice."],
        weaknesses: ["The opening is too slow."],
        readyToPostHooks: ["Show the result first."],
        readyToPostScripts: ["Open with the payoff, then explain the process."],
        ctaOptions: ["Save this for your next post."],
        captionPack: ["A clear opening helps viewers stay."],
        hashtagPack: ["#reels #contentcreator"],
      },
    });

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
