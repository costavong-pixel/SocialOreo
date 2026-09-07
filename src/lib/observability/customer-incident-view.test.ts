import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEvents: vi.fn(),
  findUsers: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditEvent: { findMany: mocks.findEvents },
    user: { findMany: mocks.findUsers },
  },
}));

import { listCustomerIncidentLog } from "./customer-incident-view";

describe("customer incident admin projection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows support-safe evidence without returning the raw identity", async () => {
    mocks.findEvents.mockResolvedValue([{
      id: "event-1",
      externalId: "evt_customer_incident_private",
      actorAuthUserId: "auth0|private-subject",
      occurredAt: new Date("2026-09-07T10:00:00.000Z"),
      payload: {
        incidentReference: "INC-1234567890",
        route: "/home",
        errorDigest: "digest-1",
        roleAtIncident: "ADMIN",
        environment: "staging",
        revision: "abc123",
      },
    }]);
    mocks.findUsers.mockResolvedValue([{
      id: "db-user-1",
      authUserId: "auth0|private-subject",
      email: "owner@example.com",
      role: "USER",
    }]);

    const rows = await listCustomerIncidentLog();

    expect(rows[0]).toMatchObject({
      incidentReference: "INC-1234567890",
      accountEmail: "owner@example.com",
      accountCurrentRole: "USER",
      roleAtIncident: "ADMIN",
      route: "/home",
      errorDigest: "digest-1",
      environment: "staging",
      revision: "abc123",
    });
    expect(JSON.stringify(rows[0])).not.toContain("private-subject");
  });
});
