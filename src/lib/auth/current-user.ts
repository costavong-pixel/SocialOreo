import { auth0 } from "@/lib/auth/auth0";
import { connectionProviderFromSubject, logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";
import { bootstrapStagingAcceptance } from "@/lib/auth/staging-acceptance";

export type SessionUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
};

export type VerifiedSessionUser = SessionUser & {
  email: string;
};

export type AcceptedSessionUser = VerifiedSessionUser & {
  acceptance: "provider-verified" | "staging-bootstrap";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth0.getSession();
  const claims = session?.user as Record<string, unknown> | undefined;
  const id = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const emailVerified = claims?.email_verified === true;

  logAuthSyncDiagnostic("session", {
    sessionPresent: Boolean(session),
    subject: id,
    email,
    connectionProvider: connectionProviderFromSubject(id),
    emailVerified,
    emailVerifiedClaimType: typeof claims?.email_verified,
  });

  if (!id) {
    return null;
  }

  return {
    id,
    email,
    emailVerified,
    displayName:
      (typeof claims?.name === "string" && claims.name.trim()) ||
      (typeof claims?.nickname === "string" && claims.nickname.trim()) ||
      null,
  };
}

export async function getVerifiedSessionUser(): Promise<VerifiedSessionUser | null> {
  const user = await getSessionUser();

  if (!user || !user.email || !user.emailVerified) {
    return null;
  }

  return { ...user, email: user.email };
}

/**
 * Application authorization boundary. Provider-verified sessions are accepted
 * normally. The only unverified exception is the explicit, auditable staging
 * acceptance cohort; production callers continue to use the strict helper.
 */
export async function getAcceptedSessionUser(): Promise<AcceptedSessionUser | null> {
  const user = await getSessionUser();
  if (!user || !user.email) return null;

  if (user.emailVerified) {
    return { ...user, email: user.email, acceptance: "provider-verified" };
  }

  const bootstrap = await bootstrapStagingAcceptance(user);
  if (bootstrap.status !== "accepted") {
    logAuthSyncDiagnostic("authorization", {
      subject: user.id,
      email: user.email,
      connectionProvider: connectionProviderFromSubject(user.id),
      emailVerified: false,
      redirectResult: "auth-login",
    });
    return null;
  }

  return { ...user, email: user.email, acceptance: bootstrap.acceptance };
}
