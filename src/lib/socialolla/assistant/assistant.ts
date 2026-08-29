import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
  /** @deprecated The client-supplied expected token is never trusted. */
  confirmationToken?: string;
  providedToken: string;
  intent?: string;
  actorAuthUserId?: string;
}

const CONFIRMATION_PREFIX = "so-ok-";
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const PROCESS_FALLBACK_SECRET = randomBytes(32).toString("hex");

type ConfirmationContext = {
  domain?: AssistantDomain;
  intent?: string;
  actorAuthUserId?: string;
};

type ConfirmationClaims = ConfirmationContext & {
  version: 1;
  nonce: string;
  expiresAt: number;
};

function confirmationSecret(): string {
  // AUTH0_SECRET is already required by the authenticated server runtime. The
  // dedicated variable permits rotation without coupling this contract to
  // Auth0. A deployed staging/production runtime must fail closed when neither
  // secret is configured; the process fallback is only for isolated tests.
  const configured = process.env.SOCIALOLLA_ASSISTANT_CONFIRMATION_SECRET || process.env.AUTH0_SECRET;
  if (!configured && (process.env.NODE_ENV === "production" || process.env.SOCIALOLLA_ENV?.trim().toLowerCase() === "staging")) {
    throw new Error("Assistant confirmation secret is not configured.");
  }
  return configured || PROCESS_FALLBACK_SECRET;
}

function encodeClaims(claims: ConfirmationClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

function signClaims(encodedClaims: string): string {
  return createHmac("sha256", confirmationSecret()).update(encodedClaims).digest("base64url");
}

function verifyConfirmationToken(token: string): ConfirmationClaims | null {
  if (!token.startsWith(CONFIRMATION_PREFIX)) return null;
  const value = token.slice(CONFIRMATION_PREFIX.length);
  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;

  const encodedClaims = value.slice(0, separator);
  const providedSignature = Buffer.from(value.slice(separator + 1), "base64url");
  const expectedSignature = Buffer.from(signClaims(encodedClaims), "base64url");
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) return null;

  try {
    const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as Partial<ConfirmationClaims>;
    if (claims.version !== 1 || typeof claims.nonce !== "string" || typeof claims.expiresAt !== "number" || claims.expiresAt <= Date.now()) return null;
    if (claims.domain !== undefined && !assistantDomainSchema.safeParse(claims.domain).success) return null;
    if (claims.intent !== undefined && typeof claims.intent !== "string") return null;
    if (claims.actorAuthUserId !== undefined && typeof claims.actorAuthUserId !== "string") return null;
    return claims as ConfirmationClaims;
  } catch {
    return null;
  }
}

export function newConfirmationToken(context: ConfirmationContext = {}): string {
  const claims: ConfirmationClaims = {
    version: 1,
    nonce: randomBytes(12).toString("base64url"),
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    ...(context.domain ? { domain: context.domain } : {}),
    ...(context.intent !== undefined ? { intent: context.intent.trim() } : {}),
    ...(context.actorAuthUserId ? { actorAuthUserId: context.actorAuthUserId } : {}),
  };
  const encodedClaims = encodeClaims(claims);
  return `${CONFIRMATION_PREFIX}${encodedClaims}.${signClaims(encodedClaims)}`;
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
export function runAssistantStep(intent: string, domain: AssistantDomain, actorAuthUserId?: string): AssistantStepResult {
  const action = classifyIntent(intent, domain);
  const protectedAction = action === "Execute";
  const requiresConfirmation = protectedAction;
  const confirmationToken = protectedAction ? newConfirmationToken({ domain, intent, actorAuthUserId }) : undefined;
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

/** Protected actions must be re-confirmed with a server-signed, context-bound token. */
export function confirmExecute(input: ExecuteIntent): { ok: boolean; reason?: string } {
  if (input.action !== "Execute") return { ok: false, reason: "Not an Execute action" };
  if (input.preview.trim().length === 0) {
    return { ok: false, reason: "Exact preview is required" };
  }

  const claims = verifyConfirmationToken(input.providedToken);
  if (!claims || claims.domain !== input.domain) return { ok: false, reason: "Confirmation token mismatch" };
  if (input.intent !== undefined && claims.intent !== input.intent.trim()) return { ok: false, reason: "Confirmation context mismatch" };
  if (input.actorAuthUserId !== undefined && claims.actorAuthUserId !== input.actorAuthUserId) return { ok: false, reason: "Confirmation context mismatch" };

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
