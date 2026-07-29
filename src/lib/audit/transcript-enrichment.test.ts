import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFindExisting = vi.fn();
const mockEnrichmentCreate = vi.fn();
const mockEnrichmentFindMany = vi.fn();
const mockEnrichmentUpdate = vi.fn();
const mockSocialVideoFindMany = vi.fn();
const mockSocialVideoUpdate = vi.fn();
const mockProviderLogCreate = vi.fn();
const mockTransaction = vi.fn();
const mockStartActor = vi.fn();
const mockGetRunStatus = vi.fn();
const mockGetDatasetItems = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    transcriptEnrichment: {
      findUnique: (...args: unknown[]) => mockFindExisting(...args),
      create: (...args: unknown[]) => mockEnrichmentCreate(...args),
      findMany: (...args: unknown[]) => mockEnrichmentFindMany(...args),
      update: (...args: unknown[]) => mockEnrichmentUpdate(...args),
    },
    socialVideo: {
      findMany: (...args: unknown[]) => mockSocialVideoFindMany(...args),
      update: (...args: unknown[]) => mockSocialVideoUpdate(...args),
    },
    providerCallLog: { create: (...args: unknown[]) => mockProviderLogCreate(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/providers/social/apify-client", () => ({
  startApifyActor: (...args: unknown[]) => mockStartActor(...args),
  getApifyRunStatus: (...args: unknown[]) => mockGetRunStatus(...args),
  getApifyDatasetItems: (...args: unknown[]) => mockGetDatasetItems(...args),
}));

describe("async transcript enrichment", () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = "test-token";
    process.env.APIFY_INSTAGRAM_TRANSCRIPT_ACTOR_ID = "crawlerbros/instagram-transcript-scraper";
    mockFindExisting.mockResolvedValue(null);
    mockEnrichmentCreate.mockResolvedValue({});
    mockEnrichmentFindMany.mockResolvedValue([]);
    mockEnrichmentUpdate.mockResolvedValue({});
    mockSocialVideoFindMany.mockResolvedValue([]);
    mockSocialVideoUpdate.mockResolvedValue({});
    mockProviderLogCreate.mockResolvedValue({});
    mockTransaction.mockResolvedValue([]);
    mockStartActor.mockResolvedValue({ runId: "run-1", datasetId: "dataset-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.APIFY_API_TOKEN;
    delete process.env.APIFY_INSTAGRAM_TRANSCRIPT_ACTOR_ID;
  });

  it("submits one actor run without waiting for transcript completion", async () => {
    const { enqueueTranscriptEnrichment } = await import("./transcript-enrichment");

    await enqueueTranscriptEnrichment({
      auditJobId: "audit-1",
      videos: [{ url: "https://www.instagram.com/p/ABC123/", transcriptIfAvailable: undefined } as never],
    });

    expect(mockStartActor).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "crawlerbros/instagram-transcript-scraper",
      input: expect.objectContaining({ videoUrls: ["https://www.instagram.com/p/ABC123/"] }),
    }));
    expect(mockEnrichmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ auditJobId: "audit-1", runId: "run-1", datasetId: "dataset-1", expectedVideos: 1 }),
    });
  });

  it("attaches only usable completed transcripts to matching reels", async () => {
    mockEnrichmentFindMany.mockResolvedValue([{
      auditJobId: "audit-1",
      actorId: "crawlerbros/instagram-transcript-scraper",
      runId: "run-1",
      datasetId: "dataset-1",
    }]);
    mockGetRunStatus.mockResolvedValue("SUCCEEDED");
    mockGetDatasetItems.mockResolvedValue([
      { postUrl: "https://www.instagram.com/p/ABC123/", fullText: "This is a useful spoken opening with enough context." },
      { postUrl: "https://www.instagram.com/p/SHORT/", fullText: "No." },
    ]);
    mockSocialVideoFindMany.mockResolvedValue([
      { id: "video-1", url: "https://www.instagram.com/p/ABC123/" },
      { id: "video-2", url: "https://www.instagram.com/p/SHORT/" },
    ]);

    const { processSubmittedTranscriptEnrichments } = await import("./transcript-enrichment");
    await processSubmittedTranscriptEnrichments();

    expect(mockSocialVideoUpdate).toHaveBeenCalledWith({
      where: { id: "video-1" },
      data: { transcriptIfAvailable: "This is a useful spoken opening with enough context." },
    });
    expect(mockSocialVideoUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "video-2" } }));
    expect(mockEnrichmentUpdate).toHaveBeenCalledWith({
      where: { auditJobId: "audit-1" },
      data: expect.objectContaining({ status: "COMPLETED", completedVideos: 1 }),
    });
  });
});
