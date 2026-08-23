import { describe, expect, it } from "vitest";

import { buildPublicMetrics } from "./public-metrics";
import { renderAuditReportHtml } from "./render-audit-report-html";

describe("renderAuditReportHtml", () => {
  it("renders score, action plan, and ready-to-post sections", () => {
    const html = renderAuditReportHtml({
      profileUrl: "https://www.instagram.com/example/",
      videoCount: 12,
      transcriptEnrichmentStatus: "SUBMITTED",
      publicMetrics: buildPublicMetrics(
        { username: "example" },
        [{ id: "reel-1", url: "https://www.instagram.com/p/ABC123/", hashtags: [], viewCount: 1000, thumbnailUrl: "https://cdn.example/thumb.jpg", audioName: "Original audio", transcriptIfAvailable: "Start with the final result." }],
      ),
      overallScore: 78,
      subScores: { hookScore: 62, goalFit: 53 },
      summary: {
        headline: "Strong reach, weak conversion",
        diagnosis: "Hooks attract views but CTAs are missing.",
      },
      actionPlan: ["Fix hook", "Add CTA", "Test offer", "Post earlier", "Use local angle", "Reply to comments", "Track DMs"],
      contentPack: {
        strengths: ["Consistent posting"],
        weaknesses: ["Weak CTA"],
        angleRecommendations: [
          {
            angleName: "Local proof",
            reason: "It makes the offer feel more credible to nearby customers.",
            hook: "Austin, here is what changes when you try this.",
          },
        ],
        readyToPostHooks: ["Austin, stop scrolling."],
        readyToPostScripts: ["Open on the problem. Show the offer. End with CTA."],
        ctaOptions: ["DM MENU"],
        captionPack: ["Tonight only — show this at the door."],
        hashtagPack: ["#austin", "#foodie"],
        contentPrescription: [{
          title: "The before-and-after table reveal",
          evidence: "The saved public sample performs well with short visual demonstrations.",
          topic: "A one-table makeover for local diners.",
          hook: "This one table change makes the whole room feel different.",
          first3Seconds: "Show the before table, then cut to the finished setting.",
          shotsOrBeats: ["Before table", "Set the table", "Show the finished room"],
          captionDirection: "Explain the one change and invite a booking.",
          cta: "DM TABLE for the menu.",
          testSignal: "Compare public views and comments against the next standard post.",
        }, {
          title: "The menu myth", evidence: "Question and how-to hooks appear in the public sample.", topic: "How to choose a shared starter.", hook: "Ordering this first makes the rest of the table easier.", first3Seconds: "Point at the starter, then show it arriving.", shotsOrBeats: ["Point to the menu", "Starter arrives"], captionDirection: "Give one practical ordering tip.", cta: "Save this for your next visit.", testSignal: "Compare saves and comments where public counts are available.",
        }, {
          title: "The local night-out plan", evidence: "The account uses local-food framing in the sample.", topic: "A simple weeknight dinner plan.", hook: "Austin, this is your easy dinner plan for tonight.", first3Seconds: "Show the finished dish before the restaurant exterior.", shotsOrBeats: ["Dish close-up", "Exterior", "Table reaction"], captionDirection: "Make the booking reason clear.", cta: "Book this week.", testSignal: "Compare views to the account median in the next audit.",
        }],
      },
    });

    expect(html).toContain("78/100");
    expect(html).toContain("Strong reach, weak conversion");
    expect(html).toContain("SocialOlla expert campaign brief");
    expect(html).toContain("Expert diagnosis");
    expect(html).toContain("Next moves");
    expect(html).toContain("Austin, stop scrolling.");
    expect(html).toContain("5 repeatable reel structures");
    expect(html).toContain("Local proof");
    expect(html).toContain("Keep, change, or stop");
    expect(html).toContain("Spoken-hook evidence");
    expect(html).toContain("Start with the final result");
    expect(html).toContain("Transcripts are being collected in the background");
    expect(html).toContain("Three posts to make next");
    expect(html).toContain("The before-and-after table reveal");
    expect(html).toContain("CHANGE");
    expect(html).toContain('src="https://cdn.example/thumb.jpg"');
    expect(html).not.toContain("undefined");
  });

  it("creates reel structures from ready-to-post hooks when no tailored angle is saved", () => {
    const html = renderAuditReportHtml({
      profileUrl: "https://www.instagram.com/example/",
      videoCount: 7,
      overallScore: 70,
      subScores: {},
      summary: {},
      actionPlan: [],
      contentPack: {
        readyToPostHooks: ["Start here"],
      },
    });

    expect(html).toContain("5 repeatable reel structures");
    expect(html).toContain("Problem to payoff");
    expect(html).toContain("Start here");
  });
});
