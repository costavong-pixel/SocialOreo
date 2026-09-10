import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  recordIncident: vi.fn(),
}));

vi.mock("@/lib/auth/sync-user", () => ({
  resolveDbUserFromVerifiedSession: mocks.resolveSession,
  hasDbSessionIdentityConflict: (resolution: unknown) => Boolean(
    resolution && typeof resolution === "object" && "status" in resolution &&
    (resolution as { status?: string }).status === "identity-conflict",
  ),
}));

vi.mock("@/lib/observability/customer-incident", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/customer-incident")>();
  return { ...actual, recordCustomerIncident: mocks.recordIncident };
});

import { POST } from "./route";

const validBody = {
  clientEventId: "9ed266a5-20e7-45f2-a808-8c5b52a7ff55",
  route: "/home",
};

function request(body: unknown) {
  return new Request("http://localhost/api/support/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("customer incident API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSession.mockResolvedValue({ dbId: "db-user-1", authUserId: "auth0|subject", email: "user@example.com" });
    mocks.recordIncident.mockResolvedValue({ status: "created", incidentReference: "INC-1234567890" });
  });

  it("requires an authenticated, resolved account", async () => {
    mocks.resolveSession.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(mocks.recordIncident).not.toHaveBeenCalled();
  });

  it("fails closed on an identity conflict", async () => {
    mocks.resolveSession.mockResolvedValue({ status: "identity-conflict" });

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    expect(mocks.recordIncident).not.toHaveBeenCalled();
  });

  it("rejects fields that could contain raw customer error content", async () => {
    const response = await POST(request({ ...validBody, message: "private stack or message" }));

    expect(response.status).toBe(400);
    expect(mocks.recordIncident).not.toHaveBeenCalled();
  });

  it("normalizes unknown customer paths into safe route labels before persistence", async () => {
    const response = await POST(request({ ...validBody, route: "/alice@example.com" }));

    expect(response.status).toBe(201);
    expect(mocks.recordIncident).toHaveBeenCalledWith(expect.objectContaining({
      route: "/unknown",
    }));
  });

  it("returns the durable support reference", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ incidentReference: "INC-1234567890" });
    expect(mocks.recordIncident).toHaveBeenCalledWith({
      dbUserId: "db-user-1",
      authUserId: "auth0|subject",
      clientEventId: validBody.clientEventId,
      route: "/home",
    });
  });

  it("rejects client-provided raw token strings in the request contract", async () => {
    const response = await POST(request({ ...validBody, digest: "eyJ0b2tlbi1zaGFwZS1kYXRh" }));

    expect(response.status).toBe(400);
    expect(mocks.recordIncident).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable response when persistence fails", async () => {
    mocks.recordIncident.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Incident reporting is temporarily unavailable." });
  });
});
