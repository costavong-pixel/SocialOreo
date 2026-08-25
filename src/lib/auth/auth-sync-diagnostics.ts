import { createHash } from "node:crypto";

export type AuthSyncDiagnosticEvent = "callback" | "session" | "sync" | "workspace" | "authorization";

export type AuthSyncDiagnosticInput = {
  subject?: string | null;
  email?: string | null;
  dbUserId?: string | null;
  connectionProvider?: string | null;
  sessionPresent?: boolean;
  emailVerified?: boolean;
  emailVerifiedClaimType?: string;
  callbackResult?: "session-input" | "session-absent";
  syncResult?: "created" | "existing" | "conflict" | "failed" | "skipped-unverified";
  workspaceResult?: "created" | "existing" | "raced-existing" | "failed";
  redirectResult?: "shell-allowed" | "auth-login" | "account-conflict";
  errorKind?: string;
};

function fingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function safeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(trimmed) ? trimmed : "invalid";
}

export function authSyncDiagnosticsEnabled(): boolean {
  return process.env.SOCIALOLLA_ENV === "staging" && process.env.AUTH_SYNC_DIAGNOSTICS === "true";
}

export function connectionProviderFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const separator = subject.indexOf("|");
  return safeLabel(separator > 0 ? subject.slice(0, separator) : null);
}

/**
 * Staging-only auth trace. The payload is deliberately allow-listed so neither
 * Auth0 tokens/cookies nor raw identity values can reach application logs.
 */
export function logAuthSyncDiagnostic(event: AuthSyncDiagnosticEvent, input: AuthSyncDiagnosticInput = {}): void {
  if (!authSyncDiagnosticsEnabled()) return;

  try {
    console.info(`AUTH_SYNC_DIAGNOSTIC ${JSON.stringify({
      event,
      subjectFingerprint: fingerprint(input.subject),
      emailFingerprint: fingerprint(input.email),
      dbUserFingerprint: fingerprint(input.dbUserId),
      connectionProvider: safeLabel(input.connectionProvider),
      sessionPresent: input.sessionPresent ?? null,
      emailVerified: input.emailVerified ?? null,
      emailVerifiedClaimType: safeLabel(input.emailVerifiedClaimType),
      callbackResult: safeLabel(input.callbackResult),
      syncResult: safeLabel(input.syncResult),
      workspaceResult: safeLabel(input.workspaceResult),
      redirectResult: safeLabel(input.redirectResult),
      errorKind: safeLabel(input.errorKind),
    })}`);
  } catch {
    // Observability must never alter an authentication decision or its error path.
  }
}
