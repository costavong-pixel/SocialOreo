import { analyzeAuditWithDeepSeek } from "./deepseek-audit-provider";
import { AiAuditProviderError } from "./extract-json";
import { analyzeAuditWithOpenAI } from "./openai-audit-provider";
import type { AnalyzeAuditInput, AuditAnalysisResult } from "./types";

type AiProviderName = "deepseek" | "openai";

function normalizeProviderName(value: string | undefined): AiProviderName | null {
  if (value === "deepseek" || value === "openai") {
    return value;
  }

  return null;
}

function providerChain(): AiProviderName[] {
  const primary = normalizeProviderName(process.env.AI_PROVIDER_PRIMARY) ?? "deepseek";
  const backup = normalizeProviderName(process.env.AI_PROVIDER_BACKUP) ?? "openai";

  return [...new Set([primary, backup])];
}

export async function analyzeAuditWithAi(input: AnalyzeAuditInput): Promise<AuditAnalysisResult> {
  const errors: string[] = [];

  for (const provider of providerChain()) {
    try {
      if (provider === "deepseek") {
        return await analyzeAuditWithDeepSeek(input);
      }

      return await analyzeAuditWithOpenAI(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI provider error.";
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new AiAuditProviderError(
    errors.length > 0 ? errors.join(" | ") : "No AI provider is configured.",
  );
}

export type { AnalyzeAuditInput } from "./types";
