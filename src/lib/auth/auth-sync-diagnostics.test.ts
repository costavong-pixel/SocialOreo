import { afterEach, describe, expect, it, vi } from "vitest";

import { authSyncDiagnosticsEnabled, logAuthSyncDiagnostic } from "./auth-sync-diagnostics";

describe("auth sync diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is disabled outside explicitly enabled staging", () => {
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("AUTH_SYNC_DIAGNOSTICS", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logAuthSyncDiagnostic("session", { subject: "auth0|private", email: "private@example.com" });

    expect(authSyncDiagnosticsEnabled()).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it("logs only hashes and allow-listed auth state in staging", () => {
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("AUTH_SYNC_DIAGNOSTICS", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logAuthSyncDiagnostic("sync", {
      subject: "auth0|private-subject",
      email: "private@example.com",
      dbUserId: "db-private-id",
      sessionPresent: true,
      emailVerified: false,
      emailVerifiedClaimType: "boolean",
      syncResult: "skipped-unverified",
    });

    expect(authSyncDiagnosticsEnabled()).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
    const output = String(info.mock.calls[0][0]);
    expect(output).toContain("AUTH_SYNC_DIAGNOSTIC");
    expect(output).toContain('"syncResult":"skipped-unverified"');
    expect(output).toContain('"emailVerified":false');
    expect(output).not.toContain("auth0|private-subject");
    expect(output).not.toContain("private@example.com");
    expect(output).not.toContain("db-private-id");
  });
});
