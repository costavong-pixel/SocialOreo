import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    publishJob: { updateMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    publishAttempt: { updateMany: vi.fn() },
    postDestination: { updateMany: vi.fn(), findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("publish job reconciliation state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => unknown) =>
        callback(mocks.prisma),
    );
    mocks.prisma.publishJob.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.publishJob.findMany.mockResolvedValue([]);
    mocks.prisma.publishJob.findFirst.mockResolvedValue({ attemptCount: 1 });
    mocks.prisma.publishAttempt.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.postDestination.updateMany.mockResolvedValue({ count: 1 });
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
