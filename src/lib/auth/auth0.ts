import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { connectionProviderFromSubject, logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";

function callbackClaims(session: { user?: unknown } | null): Record<string, unknown> | undefined {
  return session?.user as Record<string, unknown> | undefined;
}

export const auth0 = new Auth0Client({
  // A successful login must enter the authenticated product shell. Protected
  // route requests may still provide an explicit returnTo value, but the
  // normal public sign-in flow must never fall back to the marketing page.
  signInReturnToPath: "/home",
  authorizationParameters: {
    scope: "openid profile email",
  },
  beforeSessionSaved: async (session) => {
    const claims = callbackClaims(session);
    const subject = typeof claims?.sub === "string" ? claims.sub : null;
    const email = typeof claims?.email === "string" ? claims.email : null;

    logAuthSyncDiagnostic("callback", {
      subject,
      email,
      connectionProvider: connectionProviderFromSubject(subject),
      sessionPresent: true,
      emailVerified: claims?.email_verified === true,
      emailVerifiedClaimType: typeof claims?.email_verified,
      callbackResult: "session-input",
    });

    return session;
  },
});
