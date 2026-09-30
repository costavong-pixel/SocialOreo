import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  destinations: vi.fn(),
  profile: vi.fn(),
  media: vi.fn(),
  requestFindUnique: vi.fn(),
  requestCreate: vi.fn(),
  variantCreate: vi.fn(),
  occurrenceCreate: vi.fn(),
  destinationCreate: vi.fn(),
  preview: vi.fn(),
  execute: vi.fn(),
  intentKey: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    destination: { findMany: (...args: unknown[]) => mocks.destinations(...args) },
    profile: { findFirst: (...args: unknown[]) => mocks.profile(...args) },
    mediaAsset: { findMany: (...args: unknown[]) => mocks.media(...args) },
    postRequest: {
      findUnique: (...args: unknown[]) => mocks.requestFindUnique(...args),
      create: (...args: unknown[]) => mocks.requestCreate(...args),
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      postRequest: { findUnique: (...args: unknown[]) => mocks.requestFindUnique(...args), create: (...args: unknown[]) => mocks.requestCreate(...args) },
      postVariant: { create: (...args: unknown[]) => mocks.variantCreate(...args) },
      postOccurrence: { create: (...args: unknown[]) => mocks.occurrenceCreate(...args) },
      postDestination: { create: (...args: unknown[]) => mocks.destinationCreate(...args) },
    }),
  },
}));

vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: (...args: unknown[]) => mocks.workspace(...args) }));
vi.mock("@/lib/socialolla/content-factory/post-service", () => ({ createPostService: () => ({ preview: (...args: unknown[]) => mocks.preview(...args), execute: (...args: unknown[]) => mocks.execute(...args) }) }));
vi.mock("@/lib/socialolla/credits/batch-service", () => ({ intentKey: (...args: unknown[]) => mocks.intentKey(...args) }));
vi.mock("@/lib/socialolla/publishing/job-service", () => ({ enqueuePublishJob: vi.fn(), reschedulePublishJob: vi.fn(), cancelPublishJob: vi.fn() }));
vi.mock("@/lib/socialolla/publishing/publish-worker", () => ({ processDuePublishJobs: vi.fn() }));
vi.mock("@/lib/socialolla/media/media-service", () => ({ deleteOwnedMedia: vi.fn() }));

import { createMultiDestinationPostRequest } from "./post-actions";

describe("multi-destination Post creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue({ id: "workspace-external", dbId: "workspace-db" });
    mocks.destinations.mockResolvedValue([
      { id: "destination-b", externalId: "dst_b", platform: "linkedin" },
      { id: "destination-a", externalId: "dst_a", platform: "facebook" },
      { id: "destination-c", externalId: "dst_c", platform: "reddit" },
    ]);
    mocks.profile.mockResolvedValue(null);
    mocks.media.mockResolvedValue([]);
    mocks.requestFindUnique.mockResolvedValue(null);
    mocks.requestCreate.mockResolvedValue({ id: "post-db", externalId: "post_1", cfRequestRef: "cf_1", status: "REVIEW" });
    mocks.variantCreate.mockImplementation(async ({ data }: { data: { platform: string } }) => ({ id: `variant-${data.platform}` }));
    mocks.occurrenceCreate.mockResolvedValue({ id: "occurrence" });
    mocks.destinationCreate.mockResolvedValue({ id: "post-destination" });
    mocks.preview.mockResolvedValue({ batchAvailable: true });
    mocks.execute.mockResolvedValue({ id: "cf_1" });
    mocks.intentKey.mockImplementation((_workspace: string, destinationRef: string, intent: string) => `${destinationRef}:${intent}`);
  });

  it("charges once and persists one request with one variant and destination per platform", async () => {
    const result = await createMultiDestinationPostRequest({
      authUserId: "user-db",
      destinationExternalIds: ["dst_c", "dst_a", "dst_b", "dst_a"],
      language: "en",
      requestedCount: 1,
      contentIntent: "launch",
      confirmed: true,
    });

    expect(result).toMatchObject({ postRequestId: "post_1", status: "REVIEW" });
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ destinationExternalId: "dst_a", contentIntent: expect.stringContaining("destinations:dst_a,dst_b,dst_c") }));
    expect(mocks.variantCreate).toHaveBeenCalledTimes(3);
    expect(mocks.occurrenceCreate).toHaveBeenCalledTimes(3);
    expect(mocks.destinationCreate).toHaveBeenCalledTimes(3);
    expect(mocks.destinationCreate.mock.calls.map(([input]) => input.data.platform)).toEqual(["facebook", "linkedin", "reddit"]);
  });
});
