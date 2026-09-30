import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destinationFindMany: vi.fn(),
  profileFindFirst: vi.fn(),
  mediaFindMany: vi.fn(),
  postFindUnique: vi.fn(),
  postCreate: vi.fn(),
  variantCreate: vi.fn(),
  destinationCreate: vi.fn(),
  occurrenceCreate: vi.fn(),
  transaction: vi.fn(),
  workspace: vi.fn(),
  intentKey: vi.fn(),
  preview: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: {
  destination: { findMany: mocks.destinationFindMany },
  profile: { findFirst: mocks.profileFindFirst },
  mediaAsset: { findMany: mocks.mediaFindMany },
  postRequest: { findUnique: mocks.postFindUnique },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: mocks.workspace }));
vi.mock("@/lib/socialolla/credits/batch-service", () => ({ intentKey: mocks.intentKey }));
vi.mock("@/lib/socialolla/content-factory/post-service", () => ({ createPostService: () => ({ preview: mocks.preview, execute: mocks.execute }) }));

import { createMultiDestinationPostRequest } from "./post-actions";

describe("multi-destination Post fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue({ id: "wsp_1", dbId: "ws_1" });
    mocks.destinationFindMany.mockResolvedValue([
      { id: "dst_ig", externalId: "dst_ig", platform: "instagram" },
      { id: "dst_linkedin", externalId: "dst_linkedin", platform: "linkedin" },
    ]);
    mocks.profileFindFirst.mockResolvedValue(null);
    mocks.mediaFindMany.mockResolvedValue([]);
    mocks.postFindUnique.mockResolvedValue(null);
    mocks.intentKey.mockReturnValue("intent_1");
    mocks.preview.mockResolvedValue({ batchAvailable: true });
    mocks.execute.mockResolvedValue({ id: "cf_1" });
    mocks.postCreate.mockResolvedValue({ id: "post_1", externalId: "post_1", cfRequestRef: "cf_1", status: "REVIEW" });
    let variantNumber = 0;
    mocks.variantCreate.mockImplementation(async () => ({ id: `variant_${++variantNumber}` }));
    mocks.destinationCreate.mockResolvedValue({});
    mocks.occurrenceCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      postRequest: { findUnique: mocks.postFindUnique, create: mocks.postCreate },
      postVariant: { create: mocks.variantCreate },
      postDestination: { create: mocks.destinationCreate },
      postOccurrence: { create: mocks.occurrenceCreate },
    }));
  });

  it("creates one request with independent platform variants and delivery targets", async () => {
    const result = await createMultiDestinationPostRequest({
      authUserId: "user_1",
      destinationExternalIds: ["dst_ig", "dst_linkedin", "dst_ig"],
      language: "en",
      requestedCount: 1,
      confirmed: true,
      contentIntent: "launch",
    });
    expect(result).toMatchObject({ postRequestId: "post_1", status: "REVIEW" });
    expect(mocks.postCreate).toHaveBeenCalledTimes(1);
    expect(mocks.variantCreate).toHaveBeenCalledTimes(2);
    expect(mocks.destinationCreate).toHaveBeenCalledTimes(2);
    expect(mocks.occurrenceCreate).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown platform before creating any request", async () => {
    mocks.destinationFindMany.mockResolvedValue([{ id: "dst_bad", externalId: "dst_bad", platform: "unknown" }]);
    await expect(createMultiDestinationPostRequest({ authUserId: "user_1", destinationExternalIds: ["dst_bad"], language: "en", requestedCount: 1, confirmed: true })).rejects.toThrow("Unsupported publishing platform");
    expect(mocks.postCreate).not.toHaveBeenCalled();
  });
});
