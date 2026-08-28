import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { connectionProviderFromSubject, logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";
import { recordAuthSessionEstablished } from "@/lib/auth/session-audit";

function callbackClaims(session: { user?: unknown } | null): Record<string, unknown> | undefined {
  return session?.user as Record<string, unknown> | undefined;
}

function callbackStringClaim(claims: Record<string, unknown> | undefined, name: string): string | null {
  const value = claims?.[name];
  return typeof value === "string" && value.trim() ? value : null;
}

function callbackAuthTime(claims: Record<string, unknown> | undefined): string | number | null {
  const value = claims?.auth_time;
  return typeof value === "string" || typeof value === "number" ? value : null;
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
    const subject = callbackStringClaim(claims, "sub");
    const email = callbackStringClaim(claims, "email");

    logAuthSyncDiagnostic("callback", {
      subject,
      email,
      connectionProvider: connectionProviderFromSubject(subject),
      sessionPresent: true,
      emailVerified: claims?.email_verified === true,
      emailVerifiedClaimType: typeof claims?.email_verified,
      callbackResult: "session-input",
    });

    try {
      await recordAuthSessionEstablished({
        subject,
        emailVerified: claims?.email_verified === true,
        sid: callbackStringClaim(claims, "sid"),
        authTime: callbackAuthTime(claims),
      });
    } catch {
      // Session-audit persistence is observational. Never expose credentials or
      // rewrite the authentication decision because the audit store is down.
      console.error("AUTH_SESSION_AUDIT_WRITE_FAILED");
    }

    return session;
  },
});
