import OpenAI from "openai";

import { buildAuditPromptMessages } from "./build-audit-prompt";
import { AiAuditProviderError, extractJsonObject } from "./extract-json";
import { normalizeAuditAnalysisCandidate } from "./normalize-audit-analysis";
import { auditAnalysisSchema, type AuditAnalysisResult } from "./types";
import type { AnalyzeAuditInput } from "./types";

async function runChatCompletion(client: OpenAI, model: string, input: AnalyzeAuditInput): Promise<AuditAnalysisResult> {
  const prompt = buildAuditPromptMessages({
    campaignBrief: input.campaignBrief,
    auditData: input.auditData,
    trustedAngles: input.trustedAngles,
  });

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new AiAuditProviderError("AI response did not include text content.");
  }

  const parsed = normalizeAuditAnalysisCandidate(JSON.parse(extractJsonObject(content)));
  const validated = auditAnalysisSchema.safeParse(parsed);

  if (!validated.success) {
    throw new AiAuditProviderError("AI response JSON did not match the audit schema.");
  }

  return validated.data;
}

export async function analyzeAuditWithDeepSeek(input: AnalyzeAuditInput): Promise<AuditAnalysisResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

  if (!apiKey) {
    throw new AiAuditProviderError("Missing DeepSeek API configuration.");
  }

  const client = new OpenAI({ apiKey, baseURL });
  return runChatCompletion(client, model, input);
}
