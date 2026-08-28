import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuditCreate } = vi.hoisted(() => ({
  mockAuditCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: {
      create: mockAuditCreate,
    },
  },
}));

vi.mock("@/lib/auth/auth-sync-diagnostics", () => ({
  connectionProviderFromSubject: (subject: string | null | undefined) =>
    subject?.startsWith("google-oauth2|") ? "google-oauth2" : null,
}));

import {
  AUTH_SESSION_ESTABLISHED_EVENT,
  buildAuthSessionAuditEvent,
  deriveAuthSessionReference,
  recordAuthSessionEstablished,
} from "./session-audit";

describe("session security audit", () => {
  beforeEach(() => {
    mockAuditCreate.mockReset();
    mockAuditCreate.mockResolvedValue({ id: "audit-row" });
  });

  it("derives a stable one-way reference without retaining the raw provider sid", () => {
    const input = {
      subject: "google-oauth2|private-subject",
      emailVerified: true,
      sid: "raw-provider-session-id",
    };

    const first = deriveAuthSessionReference(input);
    const second = deriveAuthSessionReference(input);

    expect(first).toEqual(second);
    expect(first?.source).toBe("sid");
    expect(first?.deterministic).toBe(true);
    expect(first?.value).toMatch(/^[a-f0-9]{32}$/);
    expect(first?.value).not.toContain("raw-provider-session-id");
  });

  it("builds an allow-listed event without raw sid or email payload data", () => {
    const event = buildAuthSessionAuditEvent(
      {
        subject: "google-oauth2|private-subject",
        emailVerified: false,
        sid: "raw-provider-session-id",
      },
      {
        SOCIALOLLA_ENV: "staging",
        SOCIALOLLA_REVISION: "abc123",
      },
    );

    expect(event).not.toBeNull();
    if (!event) throw new Error("Expected session audit event");

    expect(event.actorAuthUserId).toBe("google-oauth2|private-subject");
    expect(event.eventType).toBe(AUTH_SESSION_ESTABLISHED_EVENT);
    expect(event.payload).toMatchObject({
      provider: "Auth0",
      connectionProvider: "google-oauth2",
      providerEmailVerified: false,
      sessionRefSource: "sid",
      environment: "staging",
      revision: "abc123",
    });

    const persistedJson = JSON.stringify(event.payload);
    expect(persistedJson).not.toContain("raw-provider-session-id");
    expect(persistedJson).not.toContain("private-subject");
    expect(persistedJson).not.toContain("private@example.com");
    expect(persistedJson).not.toMatch(/access[_-]?token|refresh[_-]?token|id[_-]?token|cookie/i);
  });

  it("persists the event without requiring a workspace at the Auth0 callback boundary", async () => {
    const result = await recordAuthSessionEstablished(
      {
        subject: "google-oauth2|private-subject",
        emailVerified: true,
        authTime: 1_787_800_000,
      },
      { SOCIALOLLA_ENV: "staging" },
    );

    expect(result.status).toBe("created");
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAuthUserId: "google-oauth2|private-subject",
        eventType: AUTH_SESSION_ESTABLISHED_EVENT,
      }),
    });
    expect(mockAuditCreate.mock.calls[0]?.[0]?.data).not.toHaveProperty("workspaceId");
  });

  it("treats a deterministic duplicate session reference as the same audit event", async () => {
    mockAuditCreate.mockRejectedValueOnce({ code: "P2002" });

    const result = await recordAuthSessionEstablished({
      subject: "google-oauth2|private-subject",
      emailVerified: true,
      sid: "same-provider-session",
    });

    expect(result.status).toBe("existing");
  });

  it("skips malformed sessions that do not contain a subject", async () => {
    const result = await recordAuthSessionEstablished({
      subject: null,
      emailVerified: false,
    });

    expect(result).toEqual({ status: "skipped", reason: "missing-subject" });
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
