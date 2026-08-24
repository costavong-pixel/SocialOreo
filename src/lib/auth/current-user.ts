import { auth0 } from "@/lib/auth/auth0";
import { logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";

export type SessionUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
};

export type VerifiedSessionUser = SessionUser & {
  email: string;
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
  };
}

export async function getVerifiedSessionUser(): Promise<VerifiedSessionUser | null> {
  const user = await getSessionUser();

  if (!user || !user.email || !user.emailVerified) {
    return null;
  }

  return { ...user, email: user.email };
}
