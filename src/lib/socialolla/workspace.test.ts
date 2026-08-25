import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspace: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

import { getOrCreatePersonalWorkspace } from "./workspace";

const WORKSPACE = {
  id: "workspace-db-1",
  externalId: "wsp_personal-1",
  ownerUserId: "user-db-1",
  label: "Personal workspace",
  defaultLocale: "en-US",
  provider: "PERSONAL",
  createdAt: new Date("2026-08-25T00:00:00Z"),
};

describe("getOrCreatePersonalWorkspace", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates exactly once and then reuses the unique owner workspace", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(WORKSPACE);
    mocks.create.mockResolvedValue(WORKSPACE);

    const first = await getOrCreatePersonalWorkspace("user-db-1");
    const second = await getOrCreatePersonalWorkspace("user-db-1");

    expect(first.dbId).toBe("workspace-db-1");
    expect(second.dbId).toBe("workspace-db-1");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerUserId: "user-db-1", provider: "PERSONAL" }),
    }));
  });
});
