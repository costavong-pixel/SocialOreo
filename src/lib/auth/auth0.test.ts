import { describe, expect, it, vi } from "vitest";

const { mockAuth0Client, mockDiagnostic, mockSessionAudit } = vi.hoisted(() => ({
  mockAuth0Client: vi.fn(),
  mockDiagnostic: vi.fn(),
  mockSessionAudit: vi.fn(),
}));

vi.mock("@auth0/nextjs-auth0/server", () => ({ Auth0Client: mockAuth0Client }));
vi.mock("@/lib/auth/auth-sync-diagnostics", () => ({
  connectionProviderFromSubject: () => "google-oauth2",
  logAuthSyncDiagnostic: mockDiagnostic,
}));
vi.mock("@/lib/auth/session-audit", () => ({
  recordAuthSessionEstablished: mockSessionAudit,
}));

import { auth0 } from "./auth0";

type BeforeSessionSaved = (
  session: { user?: Record<string, unknown> },
  idToken: string | null,
) => Promise<unknown>;

function beforeSessionSaved(): BeforeSessionSaved {
  const options = mockAuth0Client.mock.calls[0]?.[0] as {
    beforeSessionSaved?: BeforeSessionSaved;
  };
  expect(options.beforeSessionSaved).toBeTypeOf("function");
  return options.beforeSessionSaved!;
}

describe("Auth0 callback/session boundary", () => {
  it("observes callback claims, persists privacy-minimized session evidence, and returns the session unchanged", async () => {
    mockSessionAudit.mockResolvedValueOnce({ status: "created", externalId: "evt_auth_session_test" });
    const session = {
      user: {
        sub: "google-oauth2|private-subject",
        email: "private@example.com",
        email_verified: false,
        sid: "raw-provider-session-id",
        auth_time: 1_787_800_000,
      },
    };

    const saved = await beforeSessionSaved()(session, "id-token-is-never-logged");

    expect(saved).toBe(session);
    expect(mockDiagnostic).toHaveBeenCalledWith("callback", expect.objectContaining({
      subject: "google-oauth2|private-subject",
      email: "private@example.com",
      emailVerified: false,
      emailVerifiedClaimType: "boolean",
      callbackResult: "session-input",
      connectionProvider: "google-oauth2",
    }));
    expect(mockSessionAudit).toHaveBeenCalledWith({
      subject: "google-oauth2|private-subject",
      emailVerified: false,
      sid: "raw-provider-session-id",
      authTime: 1_787_800_000,
    });
    expect(JSON.stringify(mockSessionAudit.mock.calls)).not.toContain("id-token-is-never-logged");
    expect(auth0).toBeDefined();
  });

  it("does not change the authentication result when audit persistence fails", async () => {
    mockSessionAudit.mockRejectedValueOnce(new Error("audit database unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const session = {
      user: {
        sub: "google-oauth2|private-subject",
        email: "private@example.com",
        email_verified: true,
        sid: "provider-session",
      },
    };

    try {
      await expect(beforeSessionSaved()(session, "private-id-token")).resolves.toBe(session);
      expect(errorSpy).toHaveBeenCalledWith("AUTH_SESSION_AUDIT_WRITE_FAILED");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
