import { describe, expect, it } from "vitest";

import { normalizeAuditAnalysisCandidate } from "./normalize-audit-analysis";
import { auditAnalysisSchema } from "./types";

const baseAnalysis = {
  overallScore: 72,
  subScores: {
    hookScore: 70,
    retentionSetup: 70,
    captionScore: 70,
    ctaScore: 70,
    postingPattern: 70,
    audienceFit: 70,
    goalFit: 70,
    viralAngleStrength: 70,
    salesConversionStrength: 70,
  },
  summary: { headline: "Strong profile", diagnosis: "Good fit for the campaign." },
  strengths: ["Strong hooks"],
  weaknesses: ["CTA can improve"],
  actionPlan: ["a", "b", "c", "d", "e", "f", "g"],
  angleRecommendations: [{ angleName: "Hot take", reason: "Fits", hook: "Try this" }],
  readyToPostHooks: ["Hook"],
  readyToPostScripts: [{ title: "Script 1", script: "Open with the room reveal, then tie it to the offer." }],
  ctaOptions: ["CTA"],
  captionPack: [
    { caption: "Caption one", rationale: "Uses direct CTA" },
    { text: "Caption two" },
  ],
  hashtagPack: {
    niche: ["interiordesign", "vacationrental"],
    local: [{ hashtag: "hgtv" }],
  },
};

describe("normalizeAuditAnalysisCandidate", () => {
  it("coerces common model object variants into string arrays", () => {
    const normalized = normalizeAuditAnalysisCandidate(baseAnalysis);

    expect(normalized).toMatchObject({
      readyToPostScripts: ["Open with the room reveal, then tie it to the offer."],
      captionPack: ["Caption one", "Caption two"],
      hashtagPack: ["interiordesign", "vacationrental", "hgtv"],
    });
    expect(auditAnalysisSchema.safeParse(normalized).success).toBe(true);
  });

  it("leaves non-object candidates unchanged", () => {
    expect(normalizeAuditAnalysisCandidate(null)).toBeNull();
  });
});
