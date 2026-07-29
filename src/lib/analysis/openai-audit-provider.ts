import OpenAI from "openai";

import { buildAuditPromptMessages } from "./build-audit-prompt";
import { AiAuditProviderError, extractJsonObject } from "./extract-json";
import { normalizeAuditAnalysisCandidate } from "./normalize-audit-analysis";
import { auditAnalysisSchema, type AuditAnalysisResult } from "./types";
import type { AnalyzeAuditInput } from "./types";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

function isMissingModelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("model") && (message.includes("does not exist") || message.includes("do not have access"));
}

export async function analyzeAuditWithOpenAI(input: AnalyzeAuditInput): Promise<AuditAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const configuredModel = process.env.OPENAI_MODEL;
  const model = configuredModel ?? DEFAULT_OPENAI_MODEL;

  if (!apiKey) {
    throw new AiAuditProviderError("Missing OpenAI API configuration.");
  }

  const prompt = buildAuditPromptMessages({
    campaignBrief: input.campaignBrief,
    auditData: input.auditData,
    trustedAngles: input.trustedAngles,
  });

  const client = new OpenAI({ apiKey });

  const createCompletion = (selectedModel: string) =>
    client.chat.completions.create({
      model: selectedModel,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: { type: "json_object" },
    });

  const response = await (async () => {
    try {
      return await createCompletion(model);
    } catch (error) {
      if (!configuredModel || model === DEFAULT_OPENAI_MODEL || !isMissingModelError(error)) {
        throw error;
      }

      return createCompletion(DEFAULT_OPENAI_MODEL);
    }
  })();

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
