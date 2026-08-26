import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveDbUserFromVerifiedSession: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/sync-user", () => ({
  resolveDbUserFromVerifiedSession: mocks.resolveDbUserFromVerifiedSession,
  hasDbSessionIdentityConflict: (resolution: unknown) => Boolean(resolution && typeof resolution === "object" && "status" in resolution && (resolution as { status?: string }).status === "identity-conflict"),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    auditJob: {
      findFirst: mocks.findFirst,
    },
    auditFeedback: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

import { GET, PUT } from "./route";

const context = (id = "audit-owned") => ({ params: Promise.resolve({ id }) });
const payload = {
  rating: "HELPFUL",
  usefulSections: ["Action plan", "Content pack"],
  comments: "The action plan was easy to use.",
};

describe("audit feedback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth0-user", email: "owner@example.com" });
  });

  it("requires authentication before reading feedback", async () => {
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/audits/audit-owned/feedback"), context());

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("does not expose feedback for an audit the signed-in user does not own", async () => {
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth0-user", email: "owner@example.com" });
    mocks.findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/audits/other/feedback"), context("other"));

    expect(response.status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "other",
        userId: "db-owner",
      },
      select: {
        id: true,
        status: true,
        auditReport: { select: { id: true } },
      },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("upserts one editable response for an audit the signed-in user owns", async () => {
    const updatedAt = new Date("2026-07-12T16:00:00.000Z");
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth0-user", email: "owner@example.com" });
    mocks.findFirst.mockResolvedValue({ id: "audit-owned", status: "COMPLETED", auditReport: { id: "report-owned" } });
    mocks.upsert.mockResolvedValue({ ...payload, auditJobId: "audit-owned", updatedAt });

    const response = await PUT(
      new Request("http://localhost/api/audits/audit-owned/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { auditJobId: "audit-owned" },
      create: {
        auditJobId: "audit-owned",
        rating: "HELPFUL",
        usefulSections: ["Action plan", "Content pack"],
        comments: "The action plan was easy to use.",
      },
      update: {
        rating: "HELPFUL",
        usefulSections: ["Action plan", "Content pack"],
        comments: "The action plan was easy to use.",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      feedback: {
        rating: "HELPFUL",
        usefulSections: ["Action plan", "Content pack"],
        comments: "The action plan was easy to use.",
      },
    });
  });

  it("does not collect feedback before an owned audit has a completed report", async () => {
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth0-user", email: "owner@example.com" });
    mocks.findFirst.mockResolvedValue({ id: "audit-owned", status: "RUNNING", auditReport: null });

    const response = await PUT(
      new Request("http://localhost/api/audits/audit-owned/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid feedback before writing", async () => {
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth0-user", email: "owner@example.com" });

    const response = await PUT(
      new Request("http://localhost/api/audits/audit-owned/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: "MAYBE", usefulSections: [] }),
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
