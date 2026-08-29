import { randomUUID } from "node:crypto";
import { createLocalPrivateMediaStorage } from "@/lib/socialolla/media/local-storage";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { claimDuePublishJob, markPublishFailure, markPublishProviderStarted, markPublishReconciliationRequired, markPublishSuccess } from "./job-service";
import { createPublishingProvider, PublishingProviderClaimLostError } from "./provider";
import { InstagramPublishError } from "@/lib/instagram-publishing/publish-client";
import type { PublishingPlatform } from "./platform-adaptation";
import type { PostVariant } from "./contracts";

export type PublishWorkerOutcome =
  | { status: "PUBLISHED"; jobId: string; replayed: boolean }
  | { status: "FAILED"; jobId: string; retryScheduled: boolean; error: string }
  | { status: "RECONCILIATION_REQUIRED"; jobId: string; error: string };

function message(error: unknown): string { return error instanceof Error ? error.message : "Publish attempt failed"; }

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

export async function processDuePublishJobs(input: { now?: Date; workerId?: string; maxJobs?: number; jobIds?: readonly string[]; workspaceId?: string } = {}): Promise<PublishWorkerOutcome[]> {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `publish-worker:${randomUUID()}`;
  const maxJobs = Math.max(1, Math.min(50, input.maxJobs ?? 10));
  const outcomes: PublishWorkerOutcome[] = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const claimed = await claimDuePublishJob({ now, workerId, jobIds: input.jobIds, workspaceId: input.workspaceId });
    if (!claimed) break;
    const destination = claimed.job.postDestination;
    const variant: PostVariant = { id: destination.variant.id, postId: destination.postRequestId, platform: destination.variant.platform, content: { text: [destination.variant.title, destination.variant.caption, destination.variant.cta, destination.variant.hashtags.join(" ")].filter(Boolean).join("\n\n"), mediaAssetIds: destination.variant.mediaAssetIds } };
    let providerCallStarted = false;
    let providerEnabled = false;
    try {
      const provider = createPublishingProvider(destination.platform as PublishingPlatform, { mediaStorage: createLocalPrivateMediaStorage() });
      providerEnabled = provider.enabled;
      const receipt = await provider.publish({
        workspaceId: destination.postRequest.workspaceId,
        destinationExternalId: destination.destination.externalId,
        platform: destination.platform as PublishingPlatform,
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
        !(error instanceof InstagramPublishError) || error.reconciliationRequired
      );
      if (reconciliationRequired) {
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
