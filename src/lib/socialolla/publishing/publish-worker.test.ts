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

  it("requires an exact production Post worker gate without coupling it to the provider gate", async () => {
    const { assertPostWorkerRuntime } = await import("./publish-worker");
    const production = { NODE_ENV: "production", SOCIALOLLA_ENV: "production" };

    expect(() => assertPostWorkerRuntime(production)).toThrow("SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED");
    expect(() => assertPostWorkerRuntime({
      ...production,
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: " true",
    })).toThrow("SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED");
    expect(() => assertPostWorkerRuntime({
      ...production,
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "true",
    })).not.toThrow();
    expect(() => assertPostWorkerRuntime({
      ...production,
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    })).not.toThrow();
    expect(() => assertPostWorkerRuntime({
      ...production,
      NODE_ENV: "Production",
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
    })).toThrow("staging-only");
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

  it("isolates destination failures and never republishes the successful destination", async () => {
    const makeClaim = (jobId: string, destination: string, platform: string) => ({
      job: {
        id: jobId,
        claimToken: `${jobId}-claim`,
        postDestinationId: `${jobId}-destination`,
        postRequestId: "post-1",
        attemptCount: 0,
        postDestination: {
          destination: { externalId: destination },
          variant: { id: `${jobId}-variant`, platform, title: "Title", caption: "Caption", cta: null, hashtags: [], mediaAssetIds: [] },
          postRequest: { workspaceId: "workspace-1" },
        },
      },
      attempt: { attemptNumber: 1 },
    });
    mocks.claim.mockReset().mockResolvedValueOnce(makeClaim("job-instagram", "destination-instagram", "instagram")).mockResolvedValueOnce(makeClaim("job-facebook", "destination-facebook", "facebook")).mockResolvedValueOnce(null);
    mocks.markStarted.mockResolvedValue(true);
    mocks.markSuccess.mockResolvedValue({ published: true, replayed: false });
    mocks.markFailure.mockResolvedValue({ accepted: true, replayed: false, retryScheduled: false });
    const successfulPublish = vi.fn(async (input: { onProviderRequestStart?: () => Promise<boolean> }) => {
      await input.onProviderRequestStart?.();
      return { provider: "instagram", externalId: "ig-1", publishedAt: new Date().toISOString() };
    });
    const failedPublish = vi.fn(async () => { throw new Error("facebook permanent failure"); });
    mocks.provider.mockReset().mockReturnValueOnce({ enabled: true, publish: successfulPublish }).mockReturnValueOnce({ enabled: true, publish: failedPublish });

    const { processDuePublishJobs } = await import("./publish-worker");
    const outcomes = await processDuePublishJobs({ maxJobs: 2, workerId: "worker-1" });

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["PUBLISHED", "FAILED"]);
    expect(successfulPublish).toHaveBeenCalledTimes(1);
    expect(failedPublish).toHaveBeenCalledTimes(1);
    expect(mocks.markSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.markFailure).toHaveBeenCalledTimes(1);
  });

  it("passes adapted title/text to each platform without losing the shared concept", async () => {
    const makeClaim = (jobId: string, platform: string, title: string) => ({
      job: {
        id: jobId,
        claimToken: `${jobId}-claim`,
        postDestinationId: `${jobId}-destination`,
        postRequestId: "post-1",
        attemptCount: 0,
        postDestination: {
          destination: { externalId: `${jobId}-destination` },
          variant: { id: `${jobId}-variant`, platform, title, caption: "Caption", cta: "CTA", hashtags: ["#tag"], mediaAssetIds: [] },
          postRequest: { workspaceId: "workspace-1" },
        },
      },
      attempt: { attemptNumber: 1 },
    });
    mocks.claim.mockReset().mockResolvedValueOnce(makeClaim("job-instagram", "instagram", "Instagram title")).mockResolvedValueOnce(makeClaim("job-youtube", "youtube", "YouTube title")).mockResolvedValueOnce(null);
    mocks.markStarted.mockResolvedValue(true);
    mocks.markSuccess.mockResolvedValue({ published: true, replayed: false });
    const inputs: Array<{ platform: string; variant: { content: { title?: string; text: string } } }> = [];
    mocks.provider.mockImplementation(() => ({
      enabled: true,
      publish: vi.fn(async (input: { platform: string; variant: { content: { title?: string; text: string }; }; onProviderRequestStart?: () => Promise<boolean> }) => {
        inputs.push(input);
        await input.onProviderRequestStart?.();
        return { provider: input.platform, externalId: `${input.platform}-1`, publishedAt: new Date().toISOString() };
      }),
    }));

    const { processDuePublishJobs } = await import("./publish-worker");
    await processDuePublishJobs({ maxJobs: 2, workerId: "worker-1" });

    expect(inputs[0]).toMatchObject({ platform: "instagram", variant: { content: { title: "", text: expect.stringContaining("Instagram title") } } });
    expect(inputs[1]).toMatchObject({ platform: "youtube", variant: { content: { title: "YouTube title", text: expect.not.stringContaining("YouTube title") } } });
  });
});
