import { z } from "zod";

/**
 * Provider-disabled conversational onboarding (Milestone 1 staging proof).
 *
 * The assistant is deterministic (no live LLM): it extracts a proposed
 * structured profile from ordinary-language text, flags meaningful gaps, and
 * sequences the approved onboarding steps. It must never invent prices, hours,
 * addresses, policies, credentials, or achievements — such fields are only
 * carried through if the user explicitly provided them, and are surfaced as
 * "needs user confirmation" rather than synthesized.
 */

export const profileFieldSchema = z.enum([
  "businessName",
  "niche",
  "tone",
  "targetAudience",
  "primaryPlatform",
  "contentTopics",
  "promotionalClaims",
]);

export const profileDraftSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  niche: z.string().trim().max(120).optional(),
  tone: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(240).optional(),
  primaryPlatform: z.string().trim().max(40).optional(),
  contentTopics: z.array(z.string().trim().max(120)).default([]),
  promotionalClaims: z.array(z.string().trim().max(160)).default([]),
  raw: z.string().default(""),
});

export type ProfileField = z.infer<typeof profileFieldSchema>;
export type ProfileDraft = z.infer<typeof profileDraftSchema>;

export interface Gap {
  field: ProfileField;
  reason: string;
}

export const destinationDraftSchema = z.object({
  platform: z.string().min(1),
  accountLabel: z.string().min(1),
  providerDisabled: z.literal(true),
});

export type DestinationDraft = z.infer<typeof destinationDraftSchema>;

export const accountMetadataProposalSchema = z.object({
  platform: z.string(),
  source: z.record(z.string(), z.unknown()),
  differences: z.array(
    z.object({
      field: z.string(),
      sourceValue: z.unknown(),
      proposedValue: z.unknown(),
    }),
  ),
});

export const firstPostDraftSchema = z.object({
  destinationRef: z.string(),
  language: z.string(),
  caption: z.string(),
  status: z.literal("review"),
  requiresPublishConfirmation: z.literal(true),
});

export type FirstPostDraft = z.infer<typeof firstPostDraftSchema>;

export const dayPlanItemSchema = z.object({
  day: z.number().int().min(1).max(7),
  topic: z.string(),
  status: z.enum(["idea", "light_draft"]),
});

export type DayPlanItem = z.infer<typeof dayPlanItemSchema>;
/**
 * Step 1 + 2: parse ordinary-language purpose into a proposed profile.
 * Extracts values only when the user text plausibly contains them; every field
 * it cannot substantiate is left undefined and reported as a gap.
 */
export function parsePurpose(purposeText: string): ProfileDraft {
  const text = purposeText.trim();
  const lower = text.toLowerCase();

  const topics = ["coffee", "baking", "fitness", "travel", "photography", "cooking", "design", "fashion", "music", "parenting", "gardening", "tech"]
    .filter((topic) => lower.includes(topic));

  const tone = lower.includes("fun") || lower.includes("playful") ? "playful"
    : lower.includes("professional") ? "professional"
    : lower.includes("minimal") ? "minimal" : undefined;

  const platform = ["instagram", "tiktok", "youtube"].find((p) => lower.includes(p));

  const nameFromHandle = text.match(/(?:my business is|i run|i have|my brand is|called)\s+([A-Za-z0-9&' -]{2,60})/i);
  const businessName = nameFromHandle?.[1]?.trim();

  const audience = lower.includes("local") ? "local community"
    : lower.includes("students") ? "students"
    : lower.includes("parents") ? "parents"
    : undefined;

  return profileDraftSchema.parse({
    businessName,
    niche: topics[0],
    tone,
    targetAudience: audience,
    primaryPlatform: platform,
    contentTopics: topics,
    promotionalClaims: [],
    raw: text,
  });
}

/** Step 3: identify meaningful gaps in the proposed profile. */
export function identifyGaps(draft: ProfileDraft): Gap[] {
  const gaps: Gap[] = [];
  if (!draft.businessName) gaps.push({ field: "businessName", reason: "Business name is not yet stated." });
  if (!draft.niche) gaps.push({ field: "niche", reason: "Niche or focus is not yet clear." });
  if (!draft.tone) gaps.push({ field: "tone", reason: "Voice or tone is not yet specified." });
  if (!draft.targetAudience) gaps.push({ field: "targetAudience", reason: "Target audience is not yet specified." });
  if (!draft.primaryPlatform) gaps.push({ field: "primaryPlatform", reason: "Primary platform is not yet selected." });
  if (draft.contentTopics.length === 0) gaps.push({ field: "contentTopics", reason: "At least one content topic is needed." });
  return gaps;
}

/** Step 4: keep only fields the user approved; unknown fields are dropped. */
export function approveProfile(draft: ProfileDraft, approvedFields: ProfileField[]): ProfileDraft {
  const allowed = new Set(approvedFields);
  const next = { ...draft };
  (["businessName", "niche", "tone", "targetAudience", "primaryPlatform"] as const).forEach((field) => {
    if (!allowed.has(field)) next[field] = undefined;
  });
  if (!allowed.has("contentTopics")) next.contentTopics = [];
  if (!allowed.has("promotionalClaims")) next.promotionalClaims = [];
  return profileDraftSchema.parse(next);
}

/** Step 5: select a provider-disabled/sandbox destination. */
export function selectProviderDisabledDestination(platform: string, accountLabel: string): DestinationDraft {
  return destinationDraftSchema.parse({ platform, accountLabel, providerDisabled: true });
}

/**
 * Step 6: propose connected-account metadata differences for approval.
 * Differences are surfaced from supplied source metadata; nothing is invented.
 */
export function proposeAccountMetadata(platform: string, source: Record<string, unknown>) {
  const differences = Object.entries(source)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([field, value]) => ({ field, sourceValue: value, proposedValue: value }));
  return accountMetadataProposalSchema.parse({ platform, source, differences });
}

/** Step 7: create one destination-specific first post (review, not published). */
export function createFirstPost(input: { destinationRef: string; language: string; businessName?: string; topic?: string }): FirstPostDraft {
  const subject = input.businessName || input.topic || "your account";
  const caption = `Welcome to ${subject}. ${input.topic ? `We'll be sharing about ${input.topic}. ` : ""}Follow along.`;
  return firstPostDraftSchema.parse({
    destinationRef: input.destinationRef,
    language: input.language,
    caption,
    status: "review",
    requiresPublishConfirmation: true,
  });
}

/** Step 8 + 9: seven-day plan; unapproved ideas stay light drafts by default. */
export function createSevenDayPlan(input: { destinationRef: string; language: string; contentTopics: string[] }): DayPlanItem[] {
  const topics = input.contentTopics.length > 0 ? input.contentTopics : ["introduction"];
  return Array.from({ length: 7 }).map((_, index) => {
    const topic = topics[index % topics.length];
    return {
      day: index + 1,
      topic,
      status: index === 0 ? "light_draft" : "idea",
    };
  });
}

/**
 * Guard: every recorded promotional claim must be substantiated in the raw
 * user-provided text. The assistant never synthesizes a claim.
 */
export function assertNoInventedClaims(draft: ProfileDraft): boolean {
  const lower = draft.raw.toLowerCase();
  return draft.promotionalClaims.every((claim) => lower.includes(claim.toLowerCase()));
}
