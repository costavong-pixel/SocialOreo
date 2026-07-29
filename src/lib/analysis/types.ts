import { z } from "zod";

import type { CampaignBrief } from "@/lib/campaign-brief/types";
import type { NormalizedSocialAuditResult } from "@/lib/providers/social/types";

export const auditSubScoreSchema = z.object({
  hookScore: z.number().min(0).max(100),
  retentionSetup: z.number().min(0).max(100),
  captionScore: z.number().min(0).max(100),
  ctaScore: z.number().min(0).max(100),
  postingPattern: z.number().min(0).max(100),
  audienceFit: z.number().min(0).max(100),
  goalFit: z.number().min(0).max(100),
  viralAngleStrength: z.number().min(0).max(100),
  salesConversionStrength: z.number().min(0).max(100),
});

export const auditAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  subScores: auditSubScoreSchema,
  summary: z.object({
    headline: z.string(),
    diagnosis: z.string(),
  }),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  actionPlan: z.array(z.string()).length(7),
  angleRecommendations: z.array(
    z.object({
      angleName: z.string(),
      reason: z.string(),
      hook: z.string(),
    }),
  ),
  readyToPostHooks: z.array(z.string()).min(1),
  readyToPostScripts: z.array(z.string()).min(1),
  ctaOptions: z.array(z.string()).min(1),
  captionPack: z.array(z.string()).min(1),
  hashtagPack: z.array(z.string()).min(1),
  contentPrescription: z.array(z.object({
    title: z.string(),
    evidence: z.string(),
    topic: z.string(),
    hook: z.string(),
    first3Seconds: z.string(),
    shotsOrBeats: z.array(z.string()).min(2).max(5),
    captionDirection: z.string(),
    cta: z.string(),
    testSignal: z.string(),
  })).length(3).optional().default([]),
});

export type AuditAnalysisResult = z.infer<typeof auditAnalysisSchema>;

export type AnalyzeAuditInput = {
  campaignBrief: CampaignBrief;
  auditData: NormalizedSocialAuditResult;
  trustedAngles: TrustedAngleContext[];
};

export type TrustedAngleContext = {
  angleName: string;
  category: string;
  hookFormula: string;
  ctaFormula: string | null;
  goalFit: string[];
  nicheFit: string[];
  occasionFit: string[];
  tone: string[];
};
