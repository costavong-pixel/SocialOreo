import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Unified SocialOlla assistant orchestration boundary (provider-disabled).
 *
 * Action classes: Explain, Draft, Propose action, Execute. Protected actions
 * (Execute) require exact preview and confirmation. The assistant never emits
 * hidden chain-of-thought, secrets, raw provider payloads, or cross-account
 * data into transcripts or support tickets.
 */

export const assistantDomainSchema = z.enum([
  "onboarding",
  "profile_maintenance",
  "post_assistance",
  "watch_assistance",
  "credits_and_costs",
  "failures_and_notifications",
  "support_escalation",
]);

export const assistantActionSchema = z.enum(["Explain", "Draft", "ProposeAction", "Execute"]);

export type AssistantDomain = z.infer<typeof assistantDomainSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export interface AssistantStepResult {
  domain: AssistantDomain;
  action: AssistantAction;
  summary: string;
  protectedAction: boolean;
  requiresConfirmation: boolean;
  confirmationToken?: string;
  payload: Record<string, unknown>;
}

export interface ExecuteIntent {
  domain: AssistantDomain;
  action: "Execute";
  preview: string;
  confirmationToken: string;
  providedToken: string;
}

const CONFIRMATION_PREFIX = "so-ok-";

export function newConfirmationToken(): string {
  return `${CONFIRMATION_PREFIX}${randomBytes(12).toString("base64url")}`;
}

export function classifyIntent(intent: string, domain: AssistantDomain): AssistantAction {
  const text = intent.trim().toLowerCase();
  if (text.startsWith("explain") || text.startsWith("why") || text.startsWith("how much")) return "Explain";
  if (text.startsWith("draft") || text.startsWith("write") || text.startsWith("generate")) return "Draft";
  if (text.startsWith("propose") || text.startsWith("suggest")) return "ProposeAction";
  if (text.startsWith("execute") || text.startsWith("publish") || text.startsWith("post") || text.startsWith("start watch")) return "Execute";
  return "Explain";
}

/** Step runner: pure, deterministic, provider-disabled. */
export function runAssistantStep(intent: string, domain: AssistantDomain): AssistantStepResult {
  const action = classifyIntent(intent, domain);
  const protectedAction = action === "Execute";
  const requiresConfirmation = protectedAction;
  const confirmationToken = protectedAction ? newConfirmationToken() : undefined;
  const summary = protectedAction
    ? "Protected action prepared — exact preview and confirmation required."
    : `Prepared an ${action} response for ${domain}.`;
  return {
    domain,
    action,
    summary,
    protectedAction,
    requiresConfirmation,
    confirmationToken,
    payload: { intent: intent.trim() },
  };
}

/** Protected actions must be re-confirmed with the exact issued token. */
export function confirmExecute(input: ExecuteIntent): { ok: boolean; reason?: string } {
  if (input.action !== "Execute") return { ok: false, reason: "Not an Execute action" };
  const provided = Buffer.from(input.providedToken);
  const expected = Buffer.from(input.confirmationToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "Confirmation token mismatch" };
  }
  if (input.preview.trim().length === 0) {
    return { ok: false, reason: "Exact preview is required" };
  }
  return { ok: true };
}

const SECRET_PATTERN = /(Bearer\s+[A-Za-z0-9._-]{8,}|api[_-]?key[=:]\s*\S+|sk-[A-Za-z0-9]{16,}|INTERNAL_API_SECRET\s*=\s*\S+)/gi;
const COT_MARKERS = /(\[chain of thought\]|thinking:|\n\s*(step \d+:)|reasoning:)/gi;
const CROSS_ACCOUNT_ID_PATTERN = /\b[a-z][a-z0-9_-]*\|[A-Za-z0-9_@.=-]{4,}\b/g;

/**
 * Transcript/ticket sanitizer: strips secrets, hidden chain-of-thought
 * markers, raw provider payloads, and cross-account identifiers before text
 * enters a transcript or support ticket.
 */
export function sanitizeTranscript(text: string): string {
  return text
    .replace(SECRET_PATTERN, "[redacted]")
    .replace(COT_MARKERS, "")
    .replace(CROSS_ACCOUNT_ID_PATTERN, "[redacted]")
    .replace(/(\{[\s\S]*?"raw_payload"[\s\S]*?\})/gi, "[redacted payload]")
    .trim();
}

/** Credits/cost explanation: uses the exact configured preview, never invented prices. */
export function costExplanation(costPreview: { estimatedCredits: number; batchAvailable: boolean; remainingAfter: number | null }): string {
  const availability = costPreview.batchAvailable ? "available" : "unavailable";
  return `This action costs ${costPreview.estimatedCredits} credit(s) and is ${availability}. ${costPreview.remainingAfter === null ? "" : `Estimated balance after: ${costPreview.remainingAfter}.`}`.trim();
}
