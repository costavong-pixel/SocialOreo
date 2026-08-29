import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuditFindMany, mockUserFindMany } = vi.hoisted(() => ({
  mockAuditFindMany: vi.fn(),
  mockUserFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: { findMany: mockAuditFindMany },
    user: { findMany: mockUserFindMany },
  },
}));

import { listAuthSessionLog } from "./session-audit-view";

describe("session audit admin view", () => {
  beforeEach(() => {
    mockAuditFindMany.mockReset();
    mockUserFindMany.mockReset();
  });

  it("shows account email, current role, and provider email_verified without exposing the Auth0 subject", async () => {
    mockAuditFindMany.mockResolvedValue([
      {
        id: "evt-1",
        externalId: "evt_auth_session_abc",
        actorAuthUserId: "google-oauth2|private-subject",
        occurredAt: new Date("2026-08-27T12:00:00.000Z"),
        payload: {
          providerEmailVerified: false,
          connectionProvider: "google-oauth2",
          environment: "staging",
          revision: "abc123",
          sessionRef: "0123456789abcdef0123456789abcdef",
          sessionRefSource: "sid",
        },
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      {
        id: "db-user-1",
        authUserId: "google-oauth2|private-subject",
        email: "user@example.com",
        role: "USER",
      },
    ]);

    const rows = await listAuthSessionLog();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountEmail: "user@example.com",
      accountRole: "USER",
      providerEmailVerified: false,
      connectionProvider: "google-oauth2",
      environment: "staging",
      revision: "abc123",
      sessionRefSource: "sid",
    });
    expect(JSON.stringify(rows[0])).not.toContain("private-subject");
  });

  it("can identify an ADMIN account without copying role or email into the original audit payload", async () => {
    mockAuditFindMany.mockResolvedValue([
      {
        id: "evt-admin",
        externalId: "evt_auth_session_admin",
        actorAuthUserId: "auth0|admin-subject",
        occurredAt: new Date("2026-08-27T13:00:00.000Z"),
        payload: { providerEmailVerified: true },
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      {
        id: "db-admin-1",
        authUserId: "auth0|admin-subject",
        email: "admin@example.com",
        role: "ADMIN",
      },
    ]);

    const rows = await listAuthSessionLog(25);

    expect(rows[0]?.accountEmail).toBe("admin@example.com");
    expect(rows[0]?.accountRole).toBe("ADMIN");
    expect(rows[0]?.providerEmailVerified).toBe(true);
  });

  it("uses a support-safe reference when a session identity has no canonical User row yet", async () => {
    mockAuditFindMany.mockResolvedValue([
      {
        id: "evt-unresolved",
        externalId: "evt_auth_session_unresolved",
        actorAuthUserId: "google-oauth2|unknown-subject",
        occurredAt: new Date("2026-08-27T14:00:00.000Z"),
        payload: { providerEmailVerified: false },
      },
    ]);
    mockUserFindMany.mockResolvedValue([]);

    const rows = await listAuthSessionLog();

    expect(rows[0]?.accountEmail).toBeNull();
    expect(rows[0]?.accountRole).toBeNull();
    expect(rows[0]?.accountReference).toBeTruthy();
    expect(rows[0]?.accountReference).not.toContain("unknown-subject");
  });
});
