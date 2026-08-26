import { randomUUID } from "node:crypto";
import { createLocalPrivateMediaStorage } from "@/lib/socialolla/media/local-storage";
import { claimDuePublishJob, markPublishFailure, markPublishProviderStarted, markPublishReconciliationRequired, markPublishSuccess } from "./job-service";
import { createPublishingProvider } from "./provider";
import { InstagramPublishError } from "@/lib/instagram-publishing/publish-client";
import type { PublishingPlatform } from "./platform-adaptation";
import type { PostVariant } from "./contracts";

export type PublishWorkerOutcome =
  | { status: "PUBLISHED"; jobId: string; replayed: boolean }
  | { status: "FAILED"; jobId: string; retryScheduled: boolean; error: string }
  | { status: "RECONCILIATION_REQUIRED"; jobId: string; error: string };

function message(error: unknown): string { return error instanceof Error ? error.message : "Publish attempt failed"; }

export async function processDuePublishJobs(input: { now?: Date; workerId?: string; maxJobs?: number } = {}): Promise<PublishWorkerOutcome[]> {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `publish-worker:${randomUUID()}`;
  const maxJobs = Math.max(1, Math.min(50, input.maxJobs ?? 10));
  const outcomes: PublishWorkerOutcome[] = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const claimed = await claimDuePublishJob({ now, workerId });
    if (!claimed) break;
    const destination = claimed.job.postDestination;
    const variant: PostVariant = { id: destination.variant.id, postId: destination.postRequestId, platform: destination.variant.platform, content: { text: [destination.variant.title, destination.variant.caption, destination.variant.cta, destination.variant.hashtags.join(" ")].filter(Boolean).join("\n\n"), mediaAssetIds: destination.variant.mediaAssetIds } };
    let providerCallStarted = false;
    let providerEnabled = false;
    try {
      const provider = createPublishingProvider(destination.platform as PublishingPlatform, { mediaStorage: createLocalPrivateMediaStorage() });
      providerEnabled = provider.enabled;
      providerCallStarted = await markPublishProviderStarted({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, startedAt: now });
      if (!providerCallStarted) continue;
      const receipt = await provider.publish({ workspaceId: destination.postRequest.workspaceId, destinationExternalId: destination.destination.externalId, platform: destination.platform as PublishingPlatform, variant });
      const result = await markPublishSuccess({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, receipt });
      outcomes.push(result.published ? { status: "PUBLISHED", jobId: claimed.job.id, replayed: result.replayed } : { status: "RECONCILIATION_REQUIRED", jobId: claimed.job.id, error: "Provider receipt was returned but the job was no longer owned." });
    } catch (error) {
      const errorText = message(error);
      if (providerCallStarted && providerEnabled && error instanceof InstagramPublishError && error.reconciliationRequired) {
        await markPublishReconciliationRequired({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, now, error });
        outcomes.push({ status: "RECONCILIATION_REQUIRED", jobId: claimed.job.id, error: errorText });
        continue;
      }
      const result = await markPublishFailure({ jobId: claimed.job.id, claimToken: claimed.job.claimToken, postDestinationId: claimed.job.postDestinationId, attemptNumber: claimed.attempt.attemptNumber, now, error, retryable: error instanceof InstagramPublishError && error.retryable });
      if (result.accepted) outcomes.push({ status: "FAILED", jobId: claimed.job.id, retryScheduled: result.retryScheduled, error: errorText });
    }
  }
  return outcomes;
}
