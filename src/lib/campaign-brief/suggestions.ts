import OpenAI from "openai";
import { z } from "zod";

import { AiAuditProviderError, extractJsonObject } from "@/lib/analysis/extract-json";

export const campaignBriefSuggestionInputSchema = z.object({
  occasion: z.string().min(1),
  goal: z.string().min(1),
  niche: z.string().min(1),
  tone: z.string().min(1),
});

const campaignBriefSuggestionSchema = z.object({
  targetAudience: z.string().min(2).max(180),
  offerOrCta: z.string().min(2).max(180),
});

export type CampaignBriefSuggestionInput = z.infer<typeof campaignBriefSuggestionInputSchema>;
export type CampaignBriefSuggestion = z.infer<typeof campaignBriefSuggestionSchema>;

function getSuggestionClient(): { client: OpenAI; model: string } {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com" }),
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    };
  }

  throw new AiAuditProviderError("AI suggestions are not configured.");
}

export async function suggestCampaignBrief(input: CampaignBriefSuggestionInput): Promise<CampaignBriefSuggestion> {
  const { client, model } = getSuggestionClient();
  const response = await client.chat.completions.create({
    model,
    max_tokens: 160,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You help social-media creators fill two campaign-brief fields. Return JSON only with targetAudience and offerOrCta. Give one specific, short, editable suggestion for each. Do not claim to inspect a profile. Do not include quotes, markdown, or extra keys.",
      },
      {
        role: "user",
        content: `Occasion: ${input.occasion}\nGoal: ${input.goal}\nNiche: ${input.niche}\nTone: ${input.tone}`,
      },
    ],
  });
  const content = response.choices[0]?.message?.content;

  if (!content) throw new AiAuditProviderError("AI suggestion did not include text.");

  const parsed = campaignBriefSuggestionSchema.safeParse(JSON.parse(extractJsonObject(content)));
  if (!parsed.success) throw new AiAuditProviderError("AI suggestion did not match the expected format.");

  return parsed.data;
}
