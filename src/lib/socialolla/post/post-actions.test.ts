import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstPost: vi.fn(),
  workspace: vi.fn(),
  enqueue: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { postRequest: { findFirst: (...args: unknown[]) => mocks.findFirstPost(...args) } },
}));

vi.mock("@/lib/socialolla/workspace", () => ({
  getOrCreatePersonalWorkspace: (...args: unknown[]) => mocks.workspace(...args),
}));

vi.mock("@/lib/socialolla/content-factory/post-service", () => ({ createPostService: vi.fn() }));
vi.mock("@/lib/socialolla/credits/batch-service", () => ({ intentKey: vi.fn() }));
vi.mock("@/lib/socialolla/publishing/job-service", () => ({
  enqueuePublishJob: (...args: unknown[]) => mocks.enqueue(...args),
  reschedulePublishJob: vi.fn(),
  cancelPublishJob: vi.fn(),
}));
vi.mock("@/lib/socialolla/publishing/publish-worker", () => ({
  processDuePublishJobs: (...args: unknown[]) => mocks.process(...args),
}));
vi.mock("@/lib/socialolla/media/media-service", () => ({ deleteOwnedMedia: vi.fn() }));

import { publishPostNow } from "./post-actions";

function postWithVariants(variants: Array<{ id: string; isFinal: boolean; mediaAssetIds: string[] }>) {
  return {
    externalId: "post_1",
    variants: variants.map((variant) => ({ ...variant, platform: "instagram" })),
    destinations: [{
      externalId: "postdst_1",
      destination: { status: "CONNECTED" },
      publishJobs: [],
    }],
  };
}

describe("Publish now approval boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue({ id: "wsp_public", dbId: "workspace_1" });
    mocks.enqueue.mockResolvedValue({ id: "job_1" });
    mocks.process.mockResolvedValue([{ status: "PUBLISHED", jobId: "job_1", replayed: false }]);
  });

  it("fails closed when no final variant has been approved", async () => {
    mocks.findFirstPost.mockResolvedValue(postWithVariants([{ id: "draft", isFinal: false, mediaAssetIds: ["asset_1"] }]));

    await expect(publishPostNow({ authUserId: "user_1", postRequestExternalId: "post_1", confirmed: true }))
      .rejects.toThrow("No approved final variant");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("uses the approved final variant instead of falling back to the first draft", async () => {
    mocks.findFirstPost.mockResolvedValue(postWithVariants([
      { id: "draft", isFinal: false, mediaAssetIds: ["asset_1", "asset_2"] },
      { id: "final", isFinal: true, mediaAssetIds: ["asset_3"] },
    ]));

    await expect(publishPostNow({ authUserId: "user_1", postRequestExternalId: "post_1", confirmed: true }))
      .resolves.toMatchObject({ status: "PUBLISHED" });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledWith({ maxJobs: 1 });
  });
});
