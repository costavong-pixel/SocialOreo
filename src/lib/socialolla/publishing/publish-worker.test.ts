import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  markStarted: vi.fn(),
  markSuccess: vi.fn(),
  markFailure: vi.fn(),
  markReconciliation: vi.fn(),
  provider: vi.fn(),
  storage: vi.fn(),
}));

vi.mock("./job-service", () => ({
  claimDuePublishJob: (...args: unknown[]) => mocks.claim(...args),
  markPublishProviderStarted: (...args: unknown[]) => mocks.markStarted(...args),
  markPublishSuccess: (...args: unknown[]) => mocks.markSuccess(...args),
  markPublishFailure: (...args: unknown[]) => mocks.markFailure(...args),
  markPublishReconciliationRequired: (...args: unknown[]) => mocks.markReconciliation(...args),
}));

vi.mock("./provider", () => ({
  createPublishingProvider: (...args: unknown[]) => mocks.provider(...args),
  PublishingProviderClaimLostError: class PublishingProviderClaimLostError extends Error {},
}));

vi.mock("@/lib/socialolla/media/local-storage", () => ({
  createLocalPrivateMediaStorage: () => mocks.storage(),
}));

describe("publish worker ambiguity boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.mockReturnValue({});
    mocks.claim
      .mockResolvedValueOnce({
        job: {
          id: "job-1",
          claimToken: "claim-1",
          postDestinationId: "post-destination-1",
          postRequestId: "post-1",
          attemptCount: 1,
          postDestination: {
            destination: { externalId: "destination-1" },
            variant: { id: "variant-1", platform: "instagram", title: "Title", caption: "Caption", cta: null, hashtags: [], mediaAssetIds: ["asset-1"] },
            postRequest: { workspaceId: "workspace-1" },
          },
        },
        attempt: { attemptNumber: 2 },
      })
      .mockResolvedValue(null);
    mocks.provider.mockReturnValue({
      enabled: true,
      publish: vi.fn(async (input: { onProviderRequestStart?: () => Promise<boolean> }) => {
        await input.onProviderRequestStart?.();
        return { provider: "instagram", externalId: "media-1", publishedAt: new Date().toISOString() };
      }),
    });
    mocks.markStarted.mockResolvedValue(true);
    mocks.markSuccess.mockRejectedValue(new Error("local receipt persistence failed"));
    mocks.markFailure.mockResolvedValue({ accepted: true, replayed: false, retryScheduled: false });
    mocks.markReconciliation.mockResolvedValue({ accepted: true, replayed: false });
  });

  it("fails closed unless the worker is running in provider-disabled staging", async () => {
    const { assertPostWorkerStagingRuntime } = await import("./publish-worker");

    expect(() => assertPostWorkerStagingRuntime({ NODE_ENV: "staging", SOCIALOLLA_ENV: "staging", SOCIALOLLA_PROVIDER_DISABLED: "true" })).not.toThrow();
    expect(() => assertPostWorkerStagingRuntime({ NODE_ENV: "production", SOCIALOLLA_ENV: "staging", SOCIALOLLA_PROVIDER_DISABLED: "true" })).toThrow("staging-only");
    expect(() => assertPostWorkerStagingRuntime({ NODE_ENV: "staging", SOCIALOLLA_ENV: "production", SOCIALOLLA_PROVIDER_DISABLED: "true" })).toThrow("staging-only");
    expect(() => assertPostWorkerStagingRuntime({ NODE_ENV: "staging", SOCIALOLLA_ENV: "staging", SOCIALOLLA_PROVIDER_DISABLED: "false" })).toThrow("provider-disabled");
  });

  it("reconciles generic errors after an enabled provider boundary", async () => {
    const { processDuePublishJobs } = await import("./publish-worker");
    const outcomes = await processDuePublishJobs({ maxJobs: 1, workerId: "worker-1" });

    expect(outcomes).toEqual([{
      status: "RECONCILIATION_REQUIRED",
      jobId: "job-1",
      error: "local receipt persistence failed",
    }]);
    expect(mocks.markReconciliation).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      claimToken: "claim-1",
      attemptNumber: 2,
    }));
    expect(mocks.markFailure).not.toHaveBeenCalled();
  });

  it("keeps preflight failures definitive because no provider request started", async () => {
    mocks.provider.mockReturnValue({
      enabled: true,
      publish: vi.fn().mockRejectedValue(new Error("destination preflight failed")),
    });

    const { processDuePublishJobs } = await import("./publish-worker");
    const outcomes = await processDuePublishJobs({ maxJobs: 1, workerId: "worker-1" });

    expect(outcomes).toEqual([{
      status: "FAILED",
      jobId: "job-1",
      retryScheduled: false,
      error: "destination preflight failed",
    }]);
    expect(mocks.markStarted).not.toHaveBeenCalled();
    expect(mocks.markReconciliation).not.toHaveBeenCalled();
    expect(mocks.markFailure).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1", retryable: false }));
  });

  it("records provider-disabled processing as a safe failure without crossing the request boundary", async () => {
    const publish = vi.fn(async () => {
      throw new Error("Live publishing is disabled for instagram; no provider request was made.");
    });
    mocks.provider.mockReturnValue({
      enabled: false,
      publish,
    });

    const { processDuePublishJobs } = await import("./publish-worker");
    const outcomes = await processDuePublishJobs({ maxJobs: 1, workerId: "worker-1" });

    expect(outcomes).toEqual([{
      status: "FAILED",
      jobId: "job-1",
      retryScheduled: false,
      error: "Live publishing is disabled for instagram; no provider request was made.",
    }]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(mocks.markStarted).not.toHaveBeenCalled();
    expect(mocks.markSuccess).not.toHaveBeenCalled();
    expect(mocks.markReconciliation).not.toHaveBeenCalled();
    expect(mocks.markFailure).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      retryable: false,
    }));
  });
});
