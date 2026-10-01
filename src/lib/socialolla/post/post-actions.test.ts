import { beforeEach, describe, expect, it, vi } from "vitest";

  const mocks = vi.hoisted(() => ({
    findFirstPost: vi.fn(),
    findFirstProfile: vi.fn(),
  workspace: vi.fn(),
  enqueue: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    postRequest: { findFirst: (...args: unknown[]) => mocks.findFirstPost(...args) },
    profile: { findFirst: (...args: unknown[]) => mocks.findFirstProfile(...args) },
  },
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
  const linkedVariant = variants[0];
  return {
    externalId: "post_1",
    variants: variants.map((variant) => ({ ...variant, platform: "instagram" })),
    destinations: [{
      externalId: "postdst_1",
      destination: { status: "CONNECTED" },
      variant: linkedVariant ? { ...linkedVariant, platform: "instagram" } : null,
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

  it("uses the exact linked approved variant instead of falling back to another final variant", async () => {
    mocks.findFirstPost.mockResolvedValue({
      ...postWithVariants([
      { id: "draft", isFinal: false, mediaAssetIds: ["asset_1", "asset_2"] },
      { id: "final", isFinal: true, mediaAssetIds: ["asset_3"] },
      ]),
      destinations: [{
        externalId: "postdst_1",
        destination: { status: "CONNECTED" },
        variant: { id: "final", isFinal: true, mediaAssetIds: ["asset_3"], platform: "instagram" },
        publishJobs: [],
      }],
    });

    await expect(publishPostNow({ authUserId: "user_1", postRequestExternalId: "post_1", confirmed: true }))
      .resolves.toMatchObject({ status: "PUBLISHED" });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledWith({ maxJobs: 1, jobIds: ["job_1"], workspaceId: "workspace_1" });
  });

  it("rejects when an unrelated final variant cannot approve the linked destination variant", async () => {
    mocks.findFirstPost.mockResolvedValue({
      ...postWithVariants([
        { id: "linked-draft", isFinal: false, mediaAssetIds: ["asset_1"] },
        { id: "unrelated-final", isFinal: true, mediaAssetIds: ["asset_2"] },
      ]),
      destinations: [{
        externalId: "postdst_1",
        destination: { status: "CONNECTED" },
        variant: { id: "linked-draft", isFinal: false, mediaAssetIds: ["asset_1"], platform: "instagram" },
        publishJobs: [],
      }],
    });

    await expect(publishPostNow({ authUserId: "user_1", postRequestExternalId: "post_1", confirmed: true }))
      .rejects.toThrow("No approved final variant for every selected destination");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("fans out only pending destinations and preserves independent outcomes", async () => {
    mocks.findFirstPost.mockResolvedValue({
      externalId: "post_1",
      variants: [{ id: "shared", isFinal: true, mediaAssetIds: [], platform: "facebook" }],
      destinations: [
        { externalId: "postdst_published", destination: { status: "CONNECTED" }, variant: { id: "v1", isFinal: true, mediaAssetIds: [], platform: "facebook" }, publishJobs: [{ id: "existing", status: "PUBLISHED" }] },
        { externalId: "postdst_retry", destination: { status: "CONNECTED" }, variant: { id: "v2", isFinal: true, mediaAssetIds: [], platform: "linkedin" }, publishJobs: [] },
        { externalId: "postdst_failed", destination: { status: "CONNECTED" }, variant: { id: "v3", isFinal: true, mediaAssetIds: [], platform: "reddit" }, publishJobs: [] },
      ],
    });
    mocks.enqueue.mockImplementation(async ({ postDestinationExternalId }: { postDestinationExternalId: string }) => ({ id: `job-${postDestinationExternalId}` }));
    mocks.process.mockResolvedValue([
      { status: "PUBLISHED", jobId: "job-postdst_retry", replayed: false },
      { status: "FAILED", jobId: "job-postdst_failed", retryScheduled: false, error: "permanent provider rejection" },
    ]);

    const result = await publishPostNow({ authUserId: "user_1", postRequestExternalId: "post_1", confirmed: true });

    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).not.toHaveBeenCalledWith(expect.objectContaining({ postDestinationExternalId: "postdst_published" }));
    expect(mocks.process).toHaveBeenCalledWith({ maxJobs: 2, jobIds: ["job-postdst_retry", "job-postdst_failed"], workspaceId: "workspace_1" });
    expect(result).toMatchObject({ status: "PUBLISHED", outcomes: [
      { status: "PUBLISHED", jobId: "job-postdst_retry" },
      { status: "FAILED", jobId: "job-postdst_failed" },
    ] });
  });
});
