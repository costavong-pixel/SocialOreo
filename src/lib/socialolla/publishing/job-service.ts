import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { derivePublishIdempotencyKey, sanitizeProviderReceipt, type ProviderReceipt } from "./contracts";

export const MAX_PUBLISH_ATTEMPTS = 3;

export function publishRetryAt(now: Date, attemptNumber: number): Date {
  const bounded = Math.max(1, Math.min(MAX_PUBLISH_ATTEMPTS, attemptNumber));
  return new Date(now.getTime() + 2 ** (bounded - 1) * 60 * 1000);
}

function jobExternalId(): string { return `pub_${randomUUID().replace(/-/g, "")}`; }

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Publish attempt failed";
  return message.slice(0, 500).replace(/(?:bearer\s+|token|secret|password|api[_-]?key)[^\s]*/gi, "[redacted]");
}

export async function enqueuePublishJob(input: { authUserId: string; postRequestExternalId: string; postDestinationExternalId: string; mode: "NOW" | "SCHEDULED"; scheduledFor?: Date; timezone?: string }) {
  if (input.mode === "SCHEDULED" && (!input.scheduledFor || Number.isNaN(input.scheduledFor.getTime()))) throw new Error("Scheduled publish requires a valid time");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const target = await prisma.postDestination.findFirst({ where: { externalId: input.postDestinationExternalId, postRequest: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId }, destination: { workspaceId: workspace.dbId } }, select: { id: true, postRequestId: true, destinationId: true, variantId: true } });
  if (!target) throw new Error("Post destination not found for this workspace");
  const idempotencyKey = derivePublishIdempotencyKey({ workspaceId: workspace.id, postId: target.postRequestId, destinationId: target.destinationId, variantId: target.variantId });
  const existing = await prisma.publishJob.findUnique({ where: { idempotencyKey }, select: { id: true, externalId: true, idempotencyKey: true, status: true } });
  if (existing) {
    if (existing.status === "QUEUED") await prisma.$transaction([
      prisma.publishJob.update({ where: { id: existing.id }, data: { mode: input.mode, scheduledFor: input.scheduledFor, nextAttemptAt: input.mode === "NOW" ? new Date() : input.scheduledFor } }),
      prisma.postDestination.update({ where: { id: target.id }, data: { status: "QUEUED", publishAt: input.scheduledFor, timezone: input.timezone ?? "UTC" } }),
    ]);
    return { id: existing.id, externalId: existing.externalId, idempotencyKey: existing.idempotencyKey, replayed: true };
  }
  return prisma.$transaction(async (tx) => {
    const replay = await tx.publishJob.findUnique({ where: { idempotencyKey }, select: { id: true, externalId: true, idempotencyKey: true } });
    if (replay) return { ...replay, replayed: true };
    const job = await tx.publishJob.create({ data: { externalId: jobExternalId(), postDestinationId: target.id, mode: input.mode, status: "QUEUED", idempotencyKey, scheduledFor: input.scheduledFor, nextAttemptAt: input.mode === "NOW" ? new Date() : input.scheduledFor }, select: { id: true, externalId: true, idempotencyKey: true } });
    await tx.postDestination.update({ where: { id: target.id }, data: { status: "QUEUED", publishAt: input.scheduledFor, timezone: input.timezone ?? "UTC" } });
    return { ...job, replayed: false };
  });
}

export async function claimDuePublishJob(input: { now: Date; workerId: string; jobIds?: readonly string[]; workspaceId?: string }) {
  if (input.jobIds && input.jobIds.length === 0) return null;
  const scope: Prisma.PublishJobWhereInput = {};
  if (input.jobIds) scope.id = { in: [...input.jobIds] };
  if (input.workspaceId) scope.postDestination = { postRequest: { workspaceId: input.workspaceId } };
  return prisma.$transaction(async (tx) => {
    const staleBefore = new Date(input.now.getTime() - 15 * 60 * 1000);
    const staleJobs = await tx.publishJob.findMany({ where: { ...scope, status: "PROCESSING", claimedAt: { lt: staleBefore } }, select: { id: true, postDestinationId: true, providerCallStartedAt: true } });
    for (const stale of staleJobs) {
      const recoveredStatus = stale.providerCallStartedAt ? "RECONCILIATION_REQUIRED" as const : "QUEUED" as const;
      const message = stale.providerCallStartedAt ? "Provider call began before the publish lease expired; manual reconciliation is required." : "Previous publish lease expired before provider call.";
      const recovered = await tx.publishJob.updateMany({ where: { id: stale.id, status: "PROCESSING", claimedAt: { lt: staleBefore } }, data: { status: recoveredStatus, claimToken: null, claimedAt: null, providerCallStartedAt: null, nextAttemptAt: recoveredStatus === "QUEUED" ? input.now : null, lastError: message } });
      if (recovered.count === 1) {
        await tx.publishAttempt.updateMany({ where: { publishJobId: stale.id, status: "PROCESSING" }, data: { status: "FAILED", finishedAt: input.now, error: message } });
        await tx.postDestination.updateMany({ where: { id: stale.postDestinationId, status: "PROCESSING" }, data: { status: recoveredStatus } });
      }
    }
    const candidate = await tx.publishJob.findFirst({
      where: { ...scope, status: "QUEUED", AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }] }, { OR: [{ scheduledFor: null }, { scheduledFor: { lte: input.now } }] }] },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      include: { postDestination: { include: { destination: true, variant: true, postRequest: true } } },
    });
    if (!candidate) return null;
    const claimToken = `${input.workerId}:${randomUUID()}`;
    const claimed = await tx.publishJob.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "PROCESSING", claimToken, claimedAt: input.now, attemptCount: { increment: 1 }, lastError: null } });
    if (claimed.count !== 1) return null;
    const attemptNumber = candidate.attemptCount + 1;
    const attempt = await tx.publishAttempt.create({ data: { publishJobId: candidate.id, attemptNumber, status: "PROCESSING", startedAt: input.now } });
    await tx.postDestination.updateMany({ where: { id: candidate.postDestinationId, status: { in: ["PENDING", "QUEUED"] } }, data: { status: "PROCESSING" } });
    return { job: { ...candidate, claimToken, attemptCount: attemptNumber }, attempt };
  });
}

export async function markPublishProviderStarted(input: { jobId: string; claimToken: string; startedAt: Date }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.publishJob.updateMany({ where: { id: input.jobId, status: "PROCESSING", claimToken: input.claimToken }, data: { providerCallStartedAt: input.startedAt } });
    if (updated.count !== 1) return false;
    const job = await tx.publishJob.findUnique({ where: { id: input.jobId }, select: { externalId: true, postDestination: { select: { destination: { select: { externalId: true } }, postRequest: { select: { workspaceId: true } } } } } });
    if (job) await tx.auditEvent.create({ data: { externalId: `evt_${randomUUID().replace(/-/g, "")}`, workspaceId: job.postDestination.postRequest.workspaceId, eventType: "post.publish.provider_request", payload: { jobId: job.externalId, destinationId: job.postDestination.destination.externalId, startedAt: input.startedAt.toISOString() } } });
    return true;
  });
}

export async function markPublishSuccess(input: { jobId: string; claimToken: string; postDestinationId: string; attemptNumber: number; receipt: ProviderReceipt }) {
  const receipt = sanitizeProviderReceipt(input.receipt);
  const metadata = receipt.metadata ? JSON.parse(JSON.stringify(receipt.metadata)) as Prisma.InputJsonValue : undefined;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.publishJob.updateMany({ where: { id: input.jobId, status: "PROCESSING", claimToken: input.claimToken }, data: { status: "PUBLISHED", nextAttemptAt: null, claimedAt: null, claimToken: null, providerCallStartedAt: null, lastError: null } });
    if (claimed.count !== 1) {
      const current = await tx.publishJob.findUnique({ where: { id: input.jobId }, select: { status: true } });
      return { published: current?.status === "PUBLISHED", replayed: true };
    }
    const now = receipt.publishedAt ? new Date(receipt.publishedAt) : new Date();
    await tx.publishAttempt.updateMany({ where: { publishJobId: input.jobId, attemptNumber: input.attemptNumber, status: "PROCESSING" }, data: { status: "SUCCEEDED", finishedAt: now } });
    await tx.postDestination.updateMany({ where: { id: input.postDestinationId, status: "PROCESSING" }, data: { status: "PUBLISHED" } });
    await tx.postOccurrence.updateMany({ where: { postRequest: { destinations: { some: { id: input.postDestinationId } } }, kind: "FIRST" }, data: { status: "DELIVERED", evidenceJson: { provider: receipt.provider, providerObjectId: receipt.externalId, publishedAt: now.toISOString() } } });
    await tx.providerReceipt.upsert({ where: { publishJobId: input.jobId }, create: { publishJobId: input.jobId, provider: receipt.provider, providerObjectId: receipt.externalId, url: receipt.url, publishedAt: now, metadata }, update: { provider: receipt.provider, providerObjectId: receipt.externalId, url: receipt.url, publishedAt: now, metadata } });
    await tx.auditEvent.create({ data: { externalId: `evt_${randomUUID().replace(/-/g, "")}`, workspaceId: (await tx.postDestination.findUnique({ where: { id: input.postDestinationId }, select: { postRequest: { select: { workspaceId: true } } } }))?.postRequest.workspaceId, eventType: "post.publish.provider_success", payload: { jobId: input.jobId, provider: receipt.provider, providerObjectId: receipt.externalId, publishedAt: now.toISOString() } } });
    return { published: true, replayed: false };
  });
}

export async function markPublishFailure(input: { jobId: string; claimToken: string; postDestinationId: string; attemptNumber: number; now: Date; error: unknown; retryable: boolean }) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.publishJob.findFirst({ where: { id: input.jobId, status: "PROCESSING", claimToken: input.claimToken }, select: { attemptCount: true } });
    if (!job) return { accepted: false, replayed: true, retryScheduled: false };
    const retryScheduled = input.retryable && job.attemptCount < MAX_PUBLISH_ATTEMPTS;
    const error = safeError(input.error);
    const claimed = await tx.publishJob.updateMany({ where: { id: input.jobId, status: "PROCESSING", claimToken: input.claimToken }, data: { status: retryScheduled ? "QUEUED" : "FAILED", claimToken: null, claimedAt: null, providerCallStartedAt: null, nextAttemptAt: retryScheduled ? publishRetryAt(input.now, job.attemptCount) : null, lastError: error } });
    if (claimed.count !== 1) return { accepted: false, replayed: true, retryScheduled: false };
    await tx.publishAttempt.updateMany({ where: { publishJobId: input.jobId, attemptNumber: input.attemptNumber, status: "PROCESSING" }, data: { status: "FAILED", finishedAt: input.now, error } });
    await tx.postDestination.updateMany({ where: { id: input.postDestinationId, status: "PROCESSING" }, data: { status: retryScheduled ? "QUEUED" : "FAILED" } });
    const destination = await tx.postDestination.findUnique({ where: { id: input.postDestinationId }, select: { postRequest: { select: { workspaceId: true } } } });
    if (destination) await tx.auditEvent.create({ data: { externalId: `evt_${randomUUID().replace(/-/g, "")}`, workspaceId: destination.postRequest.workspaceId, eventType: "post.publish.provider_failure", payload: { jobId: input.jobId, retryScheduled, error } } });
    return { accepted: true, replayed: false, retryScheduled };
  });
}

/**
 * A provider transport error after the request boundary is ambiguous. Persist
 * that state immediately while the worker still owns the lease; leaving the
 * job PROCESSING would make the worker outcome disagree with durable state and
 * delay reconciliation until stale-lease recovery.
 */
export async function markPublishReconciliationRequired(input: { jobId: string; claimToken: string; postDestinationId: string; attemptNumber: number; now: Date; error: unknown }) {
  return prisma.$transaction(async (tx) => {
    const error = safeError(input.error);
    const updated = await tx.publishJob.updateMany({ where: { id: input.jobId, status: "PROCESSING", claimToken: input.claimToken }, data: { status: "RECONCILIATION_REQUIRED", claimToken: null, claimedAt: null, providerCallStartedAt: null, nextAttemptAt: null, lastError: error } });
    if (updated.count !== 1) return { accepted: false, replayed: true };
    await tx.publishAttempt.updateMany({ where: { publishJobId: input.jobId, attemptNumber: input.attemptNumber, status: "PROCESSING" }, data: { status: "FAILED", finishedAt: input.now, error } });
    await tx.postDestination.updateMany({ where: { id: input.postDestinationId, status: "PROCESSING" }, data: { status: "RECONCILIATION_REQUIRED" } });
    const destination = await tx.postDestination.findUnique({ where: { id: input.postDestinationId }, select: { postRequest: { select: { workspaceId: true } } } });
    if (destination) await tx.auditEvent.create({ data: { externalId: `evt_${randomUUID().replace(/-/g, "")}`, workspaceId: destination.postRequest.workspaceId, eventType: "post.publish.reconciliation_required", payload: { jobId: input.jobId, error } } });
    return { accepted: true, replayed: false };
  });
}

export async function cancelPublishJob(input: { authUserId: string; jobId: string }): Promise<boolean> {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const job = await prisma.publishJob.findFirst({ where: { id: input.jobId, status: "QUEUED", postDestination: { postRequest: { workspaceId: workspace.dbId } } }, select: { id: true, postDestinationId: true } });
  if (!job) return false;
  const updated = await prisma.publishJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "CANCELED", claimToken: null, claimedAt: null, nextAttemptAt: null } });
  if (updated.count === 1) await prisma.postDestination.updateMany({ where: { id: job.postDestinationId, status: "QUEUED" }, data: { status: "CANCELED" } });
  return updated.count === 1;
}

export async function reschedulePublishJob(input: { authUserId: string; jobId: string; scheduledFor: Date; timezone: string }) {
  if (Number.isNaN(input.scheduledFor.getTime())) throw new Error("A valid schedule time is required");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const job = await prisma.publishJob.findFirst({ where: { id: input.jobId, status: { in: ["FAILED", "CANCELED"] }, postDestination: { postRequest: { workspaceId: workspace.dbId } } }, select: { id: true, postDestinationId: true } });
  if (!job) throw new Error("Only a failed or canceled Post can be rescheduled");
  await prisma.$transaction([
    prisma.publishJob.update({ where: { id: job.id }, data: { status: "QUEUED", mode: "SCHEDULED", scheduledFor: input.scheduledFor, nextAttemptAt: input.scheduledFor, attemptCount: 0, claimToken: null, claimedAt: null, providerCallStartedAt: null, lastError: null } }),
    prisma.postDestination.update({ where: { id: job.postDestinationId }, data: { status: "QUEUED", publishAt: input.scheduledFor, timezone: input.timezone } }),
  ]);
  return { status: "SCHEDULED" as const };
}

export async function reconcilePublishJob(input: { authUserId: string; jobId: string; receipt: ProviderReceipt; confirmed: boolean }) {
  if (!input.confirmed) throw new Error("Provider receipt reconciliation requires exact confirmation");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const receipt = sanitizeProviderReceipt(input.receipt);
  const metadata = receipt.metadata ? JSON.parse(JSON.stringify(receipt.metadata)) as Prisma.InputJsonValue : undefined;
  return prisma.$transaction(async (tx) => {
    const job = await tx.publishJob.findFirst({ where: { id: input.jobId, status: "RECONCILIATION_REQUIRED", postDestination: { postRequest: { workspaceId: workspace.dbId } } }, select: { id: true, postDestinationId: true } });
    if (!job) return { reconciled: false, replayed: true };
    const updated = await tx.publishJob.updateMany({ where: { id: job.id, status: "RECONCILIATION_REQUIRED" }, data: { status: "PUBLISHED", claimToken: null, claimedAt: null, providerCallStartedAt: null, nextAttemptAt: null, lastError: null } });
    if (updated.count !== 1) return { reconciled: false, replayed: true };
    await tx.publishAttempt.updateMany({ where: { publishJobId: job.id, status: { in: ["PROCESSING", "FAILED"] } }, data: { status: "SUCCEEDED", finishedAt: new Date(), error: null } });
    await tx.postDestination.updateMany({ where: { id: job.postDestinationId, status: "RECONCILIATION_REQUIRED" }, data: { status: "PUBLISHED" } });
    await tx.providerReceipt.upsert({ where: { publishJobId: job.id }, create: { publishJobId: job.id, provider: receipt.provider, providerObjectId: receipt.externalId, url: receipt.url, publishedAt: receipt.publishedAt ? new Date(receipt.publishedAt) : new Date(), metadata }, update: { provider: receipt.provider, providerObjectId: receipt.externalId, url: receipt.url, publishedAt: receipt.publishedAt ? new Date(receipt.publishedAt) : new Date(), metadata } });
    return { reconciled: true, replayed: false };
  });
}
