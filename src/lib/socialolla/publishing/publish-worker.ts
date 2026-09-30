import { randomUUID } from "node:crypto";
import { createLocalPrivateMediaStorage } from "@/lib/socialolla/media/local-storage";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { claimDuePublishJob, markPublishFailure, markPublishProviderStarted, markPublishReconciliationRequired, markPublishSuccess } from "./job-service";
import { createPublishingProvider, PublishingProviderClaimLostError } from "./provider";
import { InstagramPublishError } from "@/lib/instagram-publishing/publish-client";
import { adaptPostContent, isPublishingPlatform } from "./platform-adaptation";
import type { PostVariant } from "./contracts";

export type PublishWorkerOutcome =
  | { status: "PUBLISHED"; jobId: string; replayed: boolean }
  | { status: "FAILED"; jobId: string; retryScheduled: boolean; error: string }
  | { status: "RECONCILIATION_REQUIRED"; jobId: string; error: string };

function message(error: unknown): string { return error instanceof Error ? error.message : "Publish attempt failed"; }

function isPublishingProviderRequestError(error: unknown): error is { retryable: boolean; reconciliationRequired: boolean } {
  return Boolean(error && typeof error === "object" && "retryable" in error && "reconciliationRequired" in error);
}

export function assertPostWorkerStagingRuntime(env: Record<string, string | undefined> = process.env): void {
  const nodeEnvironment = (env.NODE_ENV ?? "").trim().toLowerCase();
  const appEnvironment = (env.SOCIALOLLA_ENV ?? "").trim().toLowerCase();
  if (nodeEnvironment !== "staging" || appEnvironment !== "staging") {
    throw new Error("The Post worker is staging-only.");
  }
  if (!providerDisabledEnabled(env)) {
    throw new Error("The Post worker requires provider-disabled mode.");
  }
}

export function assertPostWorkerRuntime(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV === "production" && env.SOCIALOLLA_ENV === "production") {
    if (env.SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED !== "true") {
      throw new Error("SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED=true is required to run the production Post worker.");
    }
    return;
  }

  assertPostWorkerStagingRuntime(env);
}

export async function processDuePublishJobs(input: { now?: Date; workerId?: string; maxJobs?: number; jobIds?: readonly string[]; workspaceId?: string } = {}): Promise<PublishWorkerOutcome[]> {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `publish-worker:${randomUUID()}`;
  const maxJobs = Math.max(1, Math.min(50, input.maxJobs ?? 10));
  const outcomes: PublishWorkerOutcome[] = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const claimed = await claimDuePublishJob({ now, workerId, jobIds: input.jobIds, workspaceId: input.workspaceId });
    if (!claimed) break;
    const destination = claimed.job.postDestination;
    const platform = destination.variant.platform;
    let providerCallStarted = false;
    let providerEnabled = false;
    try {
      const publishingPlatform = isPublishingPlatform(platform) ? platform : null;
      if (!publishingPlatform) throw new Error(`Unsupported publishing platform: ${platform}`);
      const adapted = adaptPostContent(publishingPlatform, {
        title: destination.variant.title,
        text: destination.variant.caption ?? "",
        hashtags: destination.variant.hashtags,
        cta: destination.variant.cta ?? undefined,
        mediaAssetIds: destination.variant.mediaAssetIds,
      });
      const variant: PostVariant = {
        id: destination.variant.id,
        postId: destination.postRequestId,
        platform: publishingPlatform,
        content: {
          title: adapted.title,
          text: adapted.text,
          mediaAssetIds: [...adapted.mediaAssetIds],
        },
      };
      const provider = createPublishingProvider(publishingPlatform, { mediaStorage: createLocalPrivateMediaStorage() });
      providerEnabled = provider.enabled;
      const receipt = await provider.publish({
        workspaceId: destination.postRequest.workspaceId,
        destinationExternalId: destination.destination.externalId,
        platform: publishingPlatform,
        variant,
        onProviderRequestStart: async () => {
          providerCallStarted = await markPublishProviderStarted({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, startedAt: now });
          return providerCallStarted;
        },
      });
      const result = await markPublishSuccess({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, receipt });
      outcomes.push(result.published ? { status: "PUBLISHED", jobId: claimed.job.id, replayed: result.replayed } : { status: "RECONCILIATION_REQUIRED", jobId: claimed.job.id, error: "Provider receipt was returned but the job was no longer owned." });
    } catch (error) {
      const errorText = message(error);
      if (error instanceof PublishingProviderClaimLostError) continue;
      // Once an enabled provider call has crossed the request boundary, a
      // generic exception is ambiguous too: it may be a malformed provider
      // response or a local persistence failure after the provider accepted
      // the operation. Never downgrade that state to definitive FAILED.
      const reconciliationRequired = providerCallStarted && providerEnabled && (
        isPublishingProviderRequestError(error) ? error.reconciliationRequired : !(error instanceof InstagramPublishError) || error.reconciliationRequired
      );
      if (reconciliationRequired) {
        await markPublishReconciliationRequired({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, now, error });
        outcomes.push({ status: "RECONCILIATION_REQUIRED", jobId: claimed.job.id, error: errorText });
        continue;
      }
      const result = await markPublishFailure({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, now, error, retryable: (error instanceof InstagramPublishError && error.retryable) || (isPublishingProviderRequestError(error) && error.retryable) });
      if (result.accepted) outcomes.push({ status: "FAILED", jobId: claimed.job.id, retryScheduled: result.retryScheduled, error: errorText });
    }
  }
  return outcomes;
}
