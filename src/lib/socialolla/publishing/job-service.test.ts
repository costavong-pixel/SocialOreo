import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    publishJob: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    publishAttempt: { updateMany: vi.fn() },
    postDestination: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    providerReceipt: { upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/socialolla/workspace", () => ({
  getOrCreatePersonalWorkspace: vi.fn().mockResolvedValue({ dbId: "workspace-db-1" }),
}));

describe("publish job reconciliation state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => unknown) =>
        callback(mocks.prisma),
    );
    mocks.prisma.publishJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.publishJob.update.mockResolvedValue({ id: "job-1" });
    mocks.prisma.publishJob.findMany.mockResolvedValue([]);
    mocks.prisma.publishJob.findFirst.mockResolvedValue({ attemptCount: 1 });
    mocks.prisma.publishAttempt.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.postDestination.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.postDestination.update.mockResolvedValue({ id: "post-destination-1" });
    mocks.prisma.postDestination.findUnique.mockResolvedValue({
      postRequest: { workspaceId: "workspace-db-1" },
    });
    mocks.prisma.auditEvent.create.mockResolvedValue({ id: "audit-1" });
  });

  it("persists an ambiguous provider result before returning reconciliation", async () => {
    const { markPublishReconciliationRequired } = await import("./job-service");
    const now = new Date("2026-08-26T10:00:00.000Z");

    await expect(
      markPublishReconciliationRequired({
        jobId: "job-1",
        claimToken: "worker-1:claim-1",
        postDestinationId: "post-destination-1",
        attemptNumber: 1,
        now,
        error: new Error("Bearer secret-token transport failed"),
      }),
    ).resolves.toEqual({ accepted: true, replayed: false });

    expect(mocks.prisma.publishJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-1",
          status: "PROCESSING",
          claimToken: "worker-1:claim-1",
        },
        data: expect.objectContaining({
          status: "RECONCILIATION_REQUIRED",
          nextAttemptAt: null,
          lastError: "[redacted] transport failed",
        }),
      }),
    );
    expect(mocks.prisma.publishAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publishJobId: "job-1",
          attemptNumber: 1,
          status: "PROCESSING",
        },
        data: expect.objectContaining({ status: "FAILED", finishedAt: now }),
      }),
    );
    expect(mocks.prisma.postDestination.updateMany).toHaveBeenCalledWith({
      where: { id: "post-destination-1", status: "PROCESSING" },
      data: { status: "RECONCILIATION_REQUIRED" },
    });
    expect(mocks.prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-db-1",
          eventType: "post.publish.reconciliation_required",
        }),
      }),
    );
  });

  it("does not overwrite a job whose claim was lost", async () => {
    mocks.prisma.publishJob.updateMany.mockResolvedValueOnce({ count: 0 });
    const { markPublishReconciliationRequired } = await import("./job-service");

    await expect(
      markPublishReconciliationRequired({
        jobId: "job-1",
        claimToken: "stale-claim",
        postDestinationId: "post-destination-1",
        attemptNumber: 1,
        now: new Date(),
        error: new Error("ambiguous"),
      }),
    ).resolves.toEqual({ accepted: false, replayed: true });
    expect(mocks.prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("scopes a user-triggered claim to the requested jobs and workspace", async () => {
    const { claimDuePublishJob } = await import("./job-service");
    const now = new Date("2026-08-26T10:00:00.000Z");
    mocks.prisma.publishJob.findFirst.mockResolvedValueOnce(null);

    await expect(claimDuePublishJob({
      now,
      workerId: "manual-worker",
      jobIds: ["job-owned"],
      workspaceId: "workspace-owned",
    })).resolves.toBeNull();

    expect(mocks.prisma.publishJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["job-owned"] },
        postDestination: { postRequest: { workspaceId: "workspace-owned" } },
      }),
    }));
    expect(mocks.prisma.publishJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ["job-owned"] },
        postDestination: { postRequest: { workspaceId: "workspace-owned" } },
      }),
    }));
  });

  it("does not drain the global queue when a scoped claim has no job ids", async () => {
    const { claimDuePublishJob } = await import("./job-service");
    await expect(claimDuePublishJob({ now: new Date(), workerId: "manual-worker", jobIds: [] })).resolves.toBeNull();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("keeps a publish failure transition claim-bound", async () => {
    const { markPublishFailure } = await import("./job-service");
    const now = new Date("2026-08-26T10:00:00.000Z");

    await expect(markPublishFailure({
      jobId: "job-1",
      claimToken: "worker-1:claim-1",
      postDestinationId: "post-destination-1",
      attemptNumber: 1,
      now,
      error: new Error("provider failed"),
      retryable: true,
    })).resolves.toEqual({ accepted: true, replayed: false, retryScheduled: true });

    expect(mocks.prisma.publishJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", status: "PROCESSING", claimToken: "worker-1:claim-1" },
      data: expect.objectContaining({ status: "QUEUED", claimToken: null, lastError: "provider failed" }),
    }));
    expect(mocks.prisma.publishAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { publishJobId: "job-1", attemptNumber: 1, status: "PROCESSING" },
      data: expect.objectContaining({ status: "FAILED", finishedAt: now }),
    }));
  });

  it("persists provider-disabled failure as an actionable, non-published state", async () => {
    const { markPublishFailure } = await import("./job-service");
    const now = new Date("2026-08-26T10:00:00.000Z");

    await expect(markPublishFailure({
      jobId: "job-1",
      claimToken: "worker-1:claim-1",
      postDestinationId: "post-destination-1",
      attemptNumber: 1,
      now,
      error: new Error("Live publishing is disabled for instagram; no provider request was made."),
      retryable: false,
    })).resolves.toEqual({ accepted: true, replayed: false, retryScheduled: false });

    expect(mocks.prisma.publishJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", status: "PROCESSING", claimToken: "worker-1:claim-1" },
      data: expect.objectContaining({
        status: "FAILED",
        claimToken: null,
        claimedAt: null,
        providerCallStartedAt: null,
        nextAttemptAt: null,
        lastError: "Live publishing is disabled for instagram; no provider request was made.",
      }),
    }));
    expect(mocks.prisma.publishAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { publishJobId: "job-1", attemptNumber: 1, status: "PROCESSING" },
      data: expect.objectContaining({ status: "FAILED", finishedAt: now }),
    }));
    expect(mocks.prisma.postDestination.updateMany).toHaveBeenCalledWith({
      where: { id: "post-destination-1", status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    expect(mocks.prisma.providerReceipt.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "post.publish.provider_failure",
        payload: expect.objectContaining({ retryScheduled: false }),
      }),
    }));
  });

  it("reschedules the same failed job without creating a duplicate execution", async () => {
    const { reschedulePublishJob } = await import("./job-service");
    const scheduledFor = new Date("2026-08-27T10:00:00.000Z");
    mocks.prisma.publishJob.findFirst.mockResolvedValueOnce({ id: "job-1", postDestinationId: "post-destination-1" });
    mocks.prisma.$transaction.mockImplementationOnce(async (operations: unknown) => Promise.all(operations as Promise<unknown>[]));

    await expect(reschedulePublishJob({
      authUserId: "auth-user-1",
      jobId: "job-1",
      scheduledFor,
      timezone: "America/Los_Angeles",
    })).resolves.toEqual({ status: "SCHEDULED" });

    expect(mocks.prisma.publishJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "QUEUED",
        mode: "SCHEDULED",
        scheduledFor,
        nextAttemptAt: scheduledFor,
        attemptCount: 0,
        claimToken: null,
        claimedAt: null,
        providerCallStartedAt: null,
        lastError: null,
      },
    });
    expect(mocks.prisma.postDestination.update).toHaveBeenCalledWith({
      where: { id: "post-destination-1" },
      data: { status: "QUEUED", publishAt: scheduledFor, timezone: "America/Los_Angeles" },
    });
    expect(mocks.prisma.publishJob.create).not.toHaveBeenCalled();
  });

  it("does not finalize attempts when the claim is lost after the initial read", async () => {
    mocks.prisma.publishJob.updateMany.mockResolvedValueOnce({ count: 0 });
    const { markPublishFailure } = await import("./job-service");

    await expect(markPublishFailure({
      jobId: "job-1",
      claimToken: "stale-claim",
      postDestinationId: "post-destination-1",
      attemptNumber: 1,
      now: new Date(),
      error: new Error("provider failed"),
      retryable: true,
    })).resolves.toEqual({ accepted: false, replayed: true, retryScheduled: false });
    expect(mocks.prisma.publishAttempt.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.postDestination.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
