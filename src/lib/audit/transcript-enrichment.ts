import { TranscriptEnrichmentStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getApifyDatasetItems, getApifyRunStatus, startApifyActor } from "@/lib/providers/social/apify-client";
import type { NormalizedSocialVideo } from "@/lib/providers/social/types";

const MIN_USABLE_TRANSCRIPT_CHARACTERS = 20;
const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length ? value.trim() : undefined;
}

function instagramVideoKey(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const videoIndex = parts.findIndex((part) => part === "reel" || part === "p" || part === "tv");
    return videoIndex >= 0 ? parts[videoIndex + 1] : undefined;
  } catch {
    return undefined;
  }
}

function transcriptFromActorItem(item: Record<string, unknown>): string | undefined {
  const fullText = asNonEmptyString(item.fullText);
  return fullText && fullText.length >= MIN_USABLE_TRANSCRIPT_CHARACTERS ? fullText : undefined;
}

function actorItemKey(item: Record<string, unknown>): string | undefined {
  return asNonEmptyString(item.shortCode) ?? instagramVideoKey(asNonEmptyString(item.postUrl));
}

async function createProviderLog(input: {
  auditJobId: string;
  actorId: string;
  status: string;
  errorMessage?: string;
}): Promise<void> {
  await prisma.providerCallLog.create({
    data: {
      auditJobId: input.auditJobId,
      provider: "apify",
      endpointOrActor: input.actorId,
      estimatedCost: 0,
      status: input.status,
      errorMessage: input.errorMessage,
    },
  });
}

/**
 * Starts the optional transcript actor without waiting for its long-running
 * transcription batch. The worker later attaches usable public transcripts to
 * the completed audit report.
 */
export async function enqueueTranscriptEnrichment(input: {
  auditJobId: string;
  videos: NormalizedSocialVideo[];
}): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_INSTAGRAM_TRANSCRIPT_ACTOR_ID;
  const videoUrls = input.videos
    .filter((video) => !video.transcriptIfAvailable && instagramVideoKey(video.url))
    .map((video) => video.url);

  if (!token || !actorId || !videoUrls.length) return;

  const existing = await prisma.transcriptEnrichment.findUnique({ where: { auditJobId: input.auditJobId } });
  if (existing) return;

  try {
    const run = await startApifyActor({
      token,
      actorId,
      input: {
        videoUrls,
        transcriptionMethod: "auto",
        includeSegments: false,
      },
    });

    await prisma.transcriptEnrichment.create({
      data: {
        auditJobId: input.auditJobId,
        actorId,
        runId: run.runId,
        datasetId: run.datasetId,
        expectedVideos: videoUrls.length,
      },
    });
    await createProviderLog({ auditJobId: input.auditJobId, actorId, status: "submitted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start optional transcript enrichment.";
    await createProviderLog({ auditJobId: input.auditJobId, actorId, status: "failed", errorMessage: message });
  }
}

async function processTranscriptEnrichment(enrichment: {
  auditJobId: string;
  actorId: string;
  runId: string;
  datasetId: string;
}): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return;

  try {
    const status = await getApifyRunStatus({ token, runId: enrichment.runId });
    if (status === "SUCCEEDED") {
      const items = await getApifyDatasetItems({ token, datasetId: enrichment.datasetId });
      const transcriptsByKey = new Map(
        items
          .map((item) => [actorItemKey(item), transcriptFromActorItem(item)] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
      );
      const videos = await prisma.socialVideo.findMany({
        where: { auditJobId: enrichment.auditJobId, transcriptIfAvailable: null },
        select: { id: true, url: true },
      });
      const updates = videos.flatMap((video) => {
        const transcript = transcriptsByKey.get(instagramVideoKey(video.url) ?? "");
        return transcript ? [prisma.socialVideo.update({ where: { id: video.id }, data: { transcriptIfAvailable: transcript } })] : [];
      });

      await prisma.$transaction([
        ...updates,
        prisma.transcriptEnrichment.update({
          where: { auditJobId: enrichment.auditJobId },
          data: {
            status: TranscriptEnrichmentStatus.COMPLETED,
            completedVideos: updates.length,
            completedAt: new Date(),
          },
        }),
      ]);
      await createProviderLog({ auditJobId: enrichment.auditJobId, actorId: enrichment.actorId, status: "success" });
      return;
    }

    if (TERMINAL_FAILURE_STATUSES.has(status)) {
      await prisma.transcriptEnrichment.update({
        where: { auditJobId: enrichment.auditJobId },
        data: {
          status: TranscriptEnrichmentStatus.FAILED,
          errorMessage: `Transcript provider ended with status ${status}.`,
          completedAt: new Date(),
        },
      });
      await createProviderLog({ auditJobId: enrichment.auditJobId, actorId: enrichment.actorId, status: "failed", errorMessage: `Actor status ${status}.` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcript worker failed.";
    await prisma.transcriptEnrichment.update({
      where: { auditJobId: enrichment.auditJobId },
      data: {
        status: TranscriptEnrichmentStatus.FAILED,
        errorMessage: "Transcript enrichment could not be completed.",
        completedAt: new Date(),
      },
    });
    await createProviderLog({ auditJobId: enrichment.auditJobId, actorId: enrichment.actorId, status: "failed", errorMessage: message });
  }
}

export async function processSubmittedTranscriptEnrichments(limit = 3): Promise<void> {
  const enrichments = await prisma.transcriptEnrichment.findMany({
    where: { status: TranscriptEnrichmentStatus.SUBMITTED },
    orderBy: { submittedAt: "asc" },
    take: limit,
    select: { auditJobId: true, actorId: true, runId: true, datasetId: true },
  });

  for (const enrichment of enrichments) {
    await processTranscriptEnrichment(enrichment);
  }
}
