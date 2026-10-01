import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  postRequestFindFirst: vi.fn(),
  variantFindFirst: vi.fn(),
  variantUpdate: vi.fn(),
  mediaFindMany: vi.fn(),
  transaction: vi.fn(),
  postRequestUpdate: vi.fn(),
  occurrenceUpdateMany: vi.fn(),
  slotFindFirst: vi.fn(),
  slotUpdate: vi.fn(),
  slotCreate: vi.fn(),
  enqueue: vi.fn(),
  process: vi.fn(),
  deleteOwnedMedia: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    postRequest: { findFirst: (...args: unknown[]) => mocks.postRequestFindFirst(...args) },
    postVariant: {
      findFirst: (...args: unknown[]) => mocks.variantFindFirst(...args),
      update: (...args: unknown[]) => mocks.variantUpdate(...args),
    },
    mediaAsset: { findMany: (...args: unknown[]) => mocks.mediaFindMany(...args) },
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

vi.mock("@/lib/socialolla/workspace", () => ({
  getOrCreatePersonalWorkspace: (...args: unknown[]) => mocks.workspace(...args),
}));
vi.mock("@/lib/socialolla/publishing/job-service", () => ({
  enqueuePublishJob: (...args: unknown[]) => mocks.enqueue(...args),
  reschedulePublishJob: vi.fn(),
  cancelPublishJob: vi.fn(),
}));
vi.mock("@/lib/socialolla/publishing/publish-worker", () => ({
  processDuePublishJobs: (...args: unknown[]) => mocks.process(...args),
}));
vi.mock("@/lib/socialolla/media/media-service", () => ({
  MEDIA_ATTACHED_TO_POST_ERROR: "Media is attached to a Post; replace it before deleting it.",
  deleteOwnedMedia: (...args: unknown[]) => mocks.deleteOwnedMedia(...args),
}));

import { approveAndSchedulePost, publishPostNow, replacePostMedia, updatePostVariant } from "./post-actions";

function linkedVariant(id: string, isFinal: boolean, mediaAssetIds: string[] = []) {
  return { id, isFinal, mediaAssetIds, platform: "facebook" };
}

function postWithDestinations(destinations: Array<{ externalId: string; variant: ReturnType<typeof linkedVariant> }>) {
  return {
    id: "post-db",
    externalId: "post_1",
    destinationRef: destinations[0]?.externalId ?? "dst_a",
    variants: destinations.map(({ variant }) => variant),
    destinations: destinations.map((destination) => ({
      externalId: destination.externalId,
      destination: { status: "CONNECTED" },
      variant: destination.variant,
      publishJobs: [],
    })),
  };
}

describe("exact destination-linked variant and media safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue({ id: "workspace-public", dbId: "workspace-db" });
    mocks.mediaFindMany.mockResolvedValue([]);
    mocks.variantUpdate.mockResolvedValue({ id: "variant-a" });
    mocks.enqueue.mockResolvedValue({ id: "job-1" });
    mocks.process.mockResolvedValue([{ status: "PUBLISHED", jobId: "job-1", replayed: false }]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      postRequest: { update: (...args: unknown[]) => mocks.postRequestUpdate(...args) },
      postOccurrence: { updateMany: (...args: unknown[]) => mocks.occurrenceUpdateMany(...args) },
      scheduleSlot: {
        findFirst: (...args: unknown[]) => mocks.slotFindFirst(...args),
        update: (...args: unknown[]) => mocks.slotUpdate(...args),
        create: (...args: unknown[]) => mocks.slotCreate(...args),
      },
    }));
    mocks.postRequestUpdate.mockResolvedValue({});
    mocks.occurrenceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.slotFindFirst.mockResolvedValue(null);
    mocks.slotCreate.mockResolvedValue({ id: "slot-1" });
  });

  it("updates only the explicitly linked variant and leaves sibling variants untouched", async () => {
    mocks.postRequestFindFirst.mockResolvedValue({ id: "post-db" });
    mocks.variantFindFirst.mockResolvedValue({ id: "variant-a", mediaAssetIds: [], destinations: [{ id: "postdst-a" }] });

    await updatePostVariant({
      authUserId: "user-1",
      postRequestExternalId: "post_1",
      variantId: "variant-a",
      title: "Updated A",
      caption: "Caption A",
      isFinal: true,
      mediaAssetIds: [],
    });

    expect(mocks.variantUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "variant-a" },
      data: expect.objectContaining({ title: "Updated A", isFinal: true }),
    }));
  });

  it("rejects immediate publishing when the linked variant is draft even if another variant is final", async () => {
    mocks.postRequestFindFirst.mockResolvedValue(postWithDestinations([
      { externalId: "dst_a", variant: linkedVariant("variant-a", false) },
      { externalId: "dst_b", variant: linkedVariant("variant-b", true) },
    ]));

    await expect(publishPostNow({ authUserId: "user-1", postRequestExternalId: "post_1", confirmed: true }))
      .rejects.toThrow("No approved final variant for every selected destination");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("accepts immediate publishing only when the linked variant is final", async () => {
    mocks.postRequestFindFirst.mockResolvedValue(postWithDestinations([
      { externalId: "dst_a", variant: linkedVariant("variant-a", true) },
    ]));

    await expect(publishPostNow({ authUserId: "user-1", postRequestExternalId: "post_1", confirmed: true }))
      .resolves.toMatchObject({ status: "PUBLISHED" });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ postDestinationExternalId: "dst_a" }));
  });

  it("rejects scheduled publishing when any exact linked variant is draft", async () => {
    mocks.postRequestFindFirst.mockResolvedValue(postWithDestinations([
      { externalId: "dst_a", variant: linkedVariant("variant-a", true) },
      { externalId: "dst_b", variant: linkedVariant("variant-b", false) },
    ]));

    await expect(approveAndSchedulePost({
      authUserId: "user-1",
      postRequestExternalId: "post_1",
      scheduleAt: new Date(Date.now() + 60_000),
      timezone: "UTC",
      confirmed: true,
    })).rejects.toThrow("No approved final variant for every selected destination");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("schedules when every exact linked variant is final", async () => {
    mocks.postRequestFindFirst.mockResolvedValue(postWithDestinations([
      { externalId: "dst_a", variant: linkedVariant("variant-a", true) },
      { externalId: "dst_b", variant: linkedVariant("variant-b", true) },
    ]));

    await expect(approveAndSchedulePost({
      authUserId: "user-1",
      postRequestExternalId: "post_1",
      scheduleAt: new Date(Date.now() + 60_000),
      timezone: "UTC",
      confirmed: true,
    })).resolves.toEqual({ status: "SCHEDULED" });
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });

  it("retains a shared media asset when another variant still references it", async () => {
    mocks.postRequestFindFirst.mockResolvedValue({ id: "post-db" });
    mocks.variantFindFirst.mockResolvedValue({ id: "variant-a", mediaAssetIds: ["asset-shared"], destinations: [{ id: "postdst-a" }] });
    mocks.mediaFindMany.mockResolvedValue([{ externalId: "asset-new" }]);
    mocks.deleteOwnedMedia.mockRejectedValue(new Error("Media is attached to a Post; replace it before deleting it."));

    const result = await replacePostMedia({ authUserId: "user-1", postRequestExternalId: "post_1", variantId: "variant-a", oldAssetId: "asset-shared", newAssetId: "asset-new" });

    expect(result).toMatchObject({ replaced: true, oldAssetDeleted: false, mediaAssetIds: ["asset-new"] });
    expect(mocks.variantUpdate).toHaveBeenCalledWith({ where: { id: "variant-a" }, data: { mediaAssetIds: ["asset-new"] } });
    expect(mocks.deleteOwnedMedia).toHaveBeenCalledWith({ authUserId: "user-1", assetId: "asset-shared" });
  });

  it("allows the old asset to be deleted after its final reference disappears", async () => {
    mocks.postRequestFindFirst.mockResolvedValue({ id: "post-db" });
    mocks.variantFindFirst.mockResolvedValue({ id: "variant-b", mediaAssetIds: ["asset-shared"], destinations: [{ id: "postdst-b" }] });
    mocks.mediaFindMany.mockResolvedValue([{ externalId: "asset-new" }]);
    mocks.deleteOwnedMedia.mockResolvedValue({ deleted: true });

    const result = await replacePostMedia({ authUserId: "user-1", postRequestExternalId: "post_1", variantId: "variant-b", oldAssetId: "asset-shared", newAssetId: "asset-new" });

    expect(result.oldAssetDeleted).toBe(true);
  });
});
