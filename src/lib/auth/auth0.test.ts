import { describe, expect, it, vi } from "vitest";

const { mockAuth0Client, mockDiagnostic } = vi.hoisted(() => ({
  mockAuth0Client: vi.fn(),
  mockDiagnostic: vi.fn(),
}));

vi.mock("@auth0/nextjs-auth0/server", () => ({ Auth0Client: mockAuth0Client }));
vi.mock("@/lib/auth/auth-sync-diagnostics", () => ({
  connectionProviderFromSubject: () => "google-oauth2",
  logAuthSyncDiagnostic: mockDiagnostic,
}));

import { auth0 } from "./auth0";

describe("Auth0 callback/session boundary", () => {
  it("observes the callback session claims without rewriting them", async () => {
    const options = mockAuth0Client.mock.calls[0]?.[0] as {
      beforeSessionSaved?: (session: { user?: Record<string, unknown> }, idToken: string | null) => Promise<unknown>;
    };
    const session = {
      user: {
        sub: "google-oauth2|private-subject",
        email: "private@example.com",
        email_verified: false,
      },
    };

    expect(options.beforeSessionSaved).toBeTypeOf("function");
    const saved = await options.beforeSessionSaved!(session, "id-token-is-never-logged");

    expect(saved).toBe(session);
    expect(mockDiagnostic).toHaveBeenCalledWith("callback", expect.objectContaining({
      subject: "google-oauth2|private-subject",
      email: "private@example.com",
      emailVerified: false,
      emailVerifiedClaimType: "boolean",
      callbackResult: "session-input",
      connectionProvider: "google-oauth2",
    }));
    expect(auth0).toBeDefined();
  });
});
