import { createHash } from "node:crypto";

type AuthSyncDiagnosticEvent = "session" | "sync" | "workspace" | "authorization";

type AuthSyncDiagnosticInput = {
  subject?: string | null;
  email?: string | null;
  dbUserId?: string | null;
  sessionPresent?: boolean;
  emailVerified?: boolean;
  emailVerifiedClaimType?: string;
  syncResult?: "created" | "existing" | "conflict" | "failed" | "skipped-unverified";
  workspaceResult?: "created" | "existing" | "raced-existing" | "failed";
  redirectResult?: "shell-allowed" | "auth-login" | "account-conflict";
  errorKind?: string;
};

function fingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function authSyncDiagnosticsEnabled(): boolean {
  return process.env.SOCIALOLLA_ENV === "staging" && process.env.AUTH_SYNC_DIAGNOSTICS === "true";
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
      sessionPresent: input.sessionPresent ?? null,
      emailVerified: input.emailVerified ?? null,
      emailVerifiedClaimType: input.emailVerifiedClaimType ?? null,
      syncResult: input.syncResult ?? null,
      workspaceResult: input.workspaceResult ?? null,
      redirectResult: input.redirectResult ?? null,
      errorKind: input.errorKind ?? null,
    })}`);
  } catch {
    // Observability must never alter an authentication decision or its error path.
  }
}
