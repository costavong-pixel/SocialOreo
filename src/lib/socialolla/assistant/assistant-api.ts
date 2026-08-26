import { runAssistantStep, confirmExecute, sanitizeTranscript, type AssistantDomain } from "./assistant";

/**
 * Slice G — unified assistant API boundary.
 * Guests are structurally limited to Explain/Draft/ProposeAction (no Execute);
 * authenticated users may Execute protected actions with exact preview +
 * confirmation. Transcripts are sanitized before they leave the server.
 */
export function assistantRespond(input: {
  intent: string;
  domain: AssistantDomain;
  authenticated: boolean;
  /** Derived by the authenticated server action; never accepted from browser input. */
  actorAuthUserId?: string;
  providedToken?: string;
  /** @deprecated Kept for wire compatibility; confirmExecute ignores it. */
  expectedToken?: string;
  preview?: string;
}) {
  const step = runAssistantStep(input.intent, input.domain, input.actorAuthUserId);
  const sanitizedIntent = sanitizeTranscript(input.intent);

  if (step.action === "Execute") {
    if (!input.authenticated) {
      return {
        action: step.action,
        summary: "Protected actions require an authenticated account.",
        blocked: true,
        transcript: sanitizedIntent,
      };
    }
    if (!input.providedToken || !input.preview) {
      return {
        action: step.action,
        summary: "Exact preview and confirmation are required.",
        requiresConfirmation: true,
        confirmationToken: step.confirmationToken,
        transcript: sanitizedIntent,
      };
    }
    const verdict = confirmExecute({
      domain: input.domain,
      action: "Execute",
      preview: input.preview,
      confirmationToken: input.expectedToken,
      providedToken: input.providedToken,
      intent: input.intent,
      actorAuthUserId: input.actorAuthUserId,
    });
    return {
      action: step.action,
      summary: verdict.ok ? "Execute confirmed." : verdict.reason,
      blocked: !verdict.ok,
      transcript: sanitizeTranscript(`${sanitizedIntent} ${input.preview}`),
    };
  }

  return {
    action: step.action,
    summary: step.summary,
    requiresConfirmation: false,
    transcript: sanitizeTranscript(`${sanitizedIntent} ${step.summary}`),
  };
}
