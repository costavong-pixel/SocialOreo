import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    auditEvent: { create: mocks.createEvent },
  },
}));

import {
  CUSTOMER_ERROR_EVENT,
  CustomerIncidentIdentityError,
  customerIncidentRequestSchema,
  normalizeCustomerIncidentRoute,
  recordCustomerIncident,
} from "./customer-incident";

const input = {
  dbUserId: "db-user-1",
  authUserId: "auth0|private-subject",
  clientEventId: "9ed266a5-20e7-45f2-a808-8c5b52a7ff55",
  route: "/home",
  digest: "next-safe-digest",
};

describe("customer incident recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({
      id: "db-user-1",
      authUserId: "auth0|private-subject",
      role: "ADMIN",
      workspaces: [{ id: "workspace-1" }],
    });
    mocks.createEvent.mockResolvedValue({ id: "event-1" });
  });

  it("records an idempotent, privacy-minimized incident with server-derived role", async () => {
    const result = await recordCustomerIncident(input, {
      NODE_ENV: "test",
      SOCIALOLLA_ENV: "staging",
      SOCIALOLLA_REVISION: "abc123",
    });

    expect(result).toMatchObject({ status: "created", incidentReference: expect.stringMatching(/^INC-[A-F0-9]{10}$/) });
    expect(mocks.findUser).toHaveBeenCalledWith({
      where: { id: "db-user-1" },
      select: {
        id: true,
        authUserId: true,
        role: true,
        workspaces: { select: { id: true }, take: 1 },
      },
    });
    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorAuthUserId: "auth0|private-subject",
        workspaceId: "workspace-1",
        eventType: CUSTOMER_ERROR_EVENT,
        payload: {
          incidentReference: result.incidentReference,
          route: "/home",
          roleAtIncident: "ADMIN",
          environment: "staging",
          revision: "abc123",
        },
      }),
    });

    const persisted = JSON.stringify(mocks.createEvent.mock.calls[0]?.[0]);
    expect(persisted).not.toContain("password");
    expect(persisted).not.toContain("cookie");
    expect(persisted).not.toContain("stack");
    expect(persisted).not.toContain("email");
  });

  it("treats a repeated client event as the same incident", async () => {
    mocks.createEvent.mockRejectedValueOnce({ code: "P2002" });

    const result = await recordCustomerIncident(input);

    expect(result.status).toBe("existing");
    expect(result.incidentReference).toMatch(/^INC-[A-F0-9]{10}$/);
  });

  it("fails closed when the canonical database identity does not match the session", async () => {
    mocks.findUser.mockResolvedValue({
      id: "db-user-1",
      authUserId: "auth0|another-subject",
      role: "USER",
      workspaces: [],
    });

    await expect(recordCustomerIncident(input)).rejects.toBeInstanceOf(CustomerIncidentIdentityError);
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("rejects extra customer content and unsafe routes", () => {
    expect(customerIncidentRequestSchema.safeParse({
      clientEventId: input.clientEventId,
      route: "/home",
      digest: "safe",
      message: "raw customer error",
    }).success).toBe(false);
    expect(customerIncidentRequestSchema.safeParse({
      clientEventId: input.clientEventId,
      route: "home",
    }).success).toBe(false);
  });

  it("never persists client-provided digest", async () => {
    await recordCustomerIncident({ ...input, digest: "next-safe-digest" });

    const payload = mocks.createEvent.mock.calls[0]?.[0].data.payload;
    expect(payload).not.toHaveProperty("errorDigest");
  });

  it("normalizes known and suspicious routes", () => {
    expect(normalizeCustomerIncidentRoute("/analysis/new")).toBe("/analysis");
    expect(normalizeCustomerIncidentRoute("/dashboard")).toBe("/dashboard");
    expect(normalizeCustomerIncidentRoute("/alice@example.com")).toBe("/unknown");
    expect(normalizeCustomerIncidentRoute("/%61lice%40example.com")).toBe("/unknown");
    expect(normalizeCustomerIncidentRoute("/admin/incidents")).toBe("/unknown");
  });
});
