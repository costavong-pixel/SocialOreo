import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import {
  evaluateContentOutcome,
  type NextPlanRecommendation,
  type OutcomeEvaluationResult,
  type OutcomeMetricPoint,
} from "./outcome-evaluator";

const MAX_METRIC_VALUE = 2_147_483_647;

const PLATFORM_HOSTS: Record<string, ReadonlySet<string>> = {
  instagram: new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]),
  tiktok: new Set(["tiktok.com", "www.tiktok.com", "vm.tiktok.com"]),
  youtube: new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]),
};

export type FinalVariantSnapshot = {
  id: string;
  platform: string;
  title: string;
  caption: string | null;
  hashtags: string[];
  cta: string | null;
};

export type ManualMetricInput = {
  views: number | null | undefined;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
};

function newExternalId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function contentFingerprint(input: Omit<FinalVariantSnapshot, "id">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        platform: input.platform,
        title: input.title,
        caption: input.caption,
        hashtags: input.hashtags,
        cta: input.cta,
      }),
    )
    .digest("hex");
}

/** Builds the one-way snapshot inserted with the schedule transaction. */
export function createApprovedContentVersionData(input: {
  workspaceId: string;
  postRequestId: string;
  destinationRef: string;
  approvedAt: Date;
  variant: FinalVariantSnapshot;
}) {
  const snapshot = {
    platform: input.variant.platform.trim().toLowerCase(),
    title: input.variant.title,
    caption: input.variant.caption,
    hashtags: [...input.variant.hashtags],
    cta: input.variant.cta,
  };
  return {
    externalId: newExternalId("ocv"),
    workspaceId: input.workspaceId,
    postRequestId: input.postRequestId,
    sourceVariantId: input.variant.id,
    destinationRef: input.destinationRef,
    ...snapshot,
    versionHash: contentFingerprint(snapshot),
    approvedAt: input.approvedAt,
  };
}

function parseDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${label} must be a valid date.`);
  return value;
}

function parseMetric(value: number | null | undefined, label: string, required = false): number | null {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_METRIC_VALUE) {
    throw new Error(`${label} must be a whole number between 0 and ${MAX_METRIC_VALUE}.`);
  }
  return value;
}

function parseManualMetrics(input: ManualMetricInput) {
  const metrics = {
    views: parseMetric(input.views, "Views", true),
    likes: parseMetric(input.likes, "Likes"),
    comments: parseMetric(input.comments, "Comments"),
    shares: parseMetric(input.shares, "Shares"),
    saves: parseMetric(input.saves, "Saves"),
    reach: parseMetric(input.reach, "Reach"),
  };
  if ([metrics.likes, metrics.comments, metrics.shares, metrics.saves].every((value) => value === null)) {
    throw new Error("Record at least one visible interaction metric (likes, comments, shares, or saves).");
  }
  return metrics;
}

/**
 * Strict, exact-host manual URL validation. This protects the evidence chain
 * from arbitrary links and makes it clear V1 accepts direct platform posts,
 * not a generic redirect or analytics URL.
 */
export function canonicalPlatformPostUrl(platformInput: string, rawUrl: string): string {
  const platform = platformInput.trim().toLowerCase();
  const allowedHosts = PLATFORM_HOSTS[platform];
  if (!allowedHosts) throw new Error(`Outcome Loop v1 does not support ${platformInput || "this"} post URLs yet.`);

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("A valid direct platform post URL is required.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname)) {
    throw new Error(`Use an https direct ${platform} post URL on an approved platform hostname.`);
  }
  const path = url.pathname;
  const youtubeWatchId = platform === "youtube" && url.hostname !== "youtu.be" ? url.searchParams.get("v") : null;
  const validPath =
    (platform === "instagram" && /^\/(?:p|reel|tv)\/[^/]+/i.test(path)) ||
    (platform === "tiktok" && /^\/(?:@[^/]+\/video\/[^/]+|[^/]+)$/i.test(path)) ||
    (platform === "youtube" && (url.hostname === "youtu.be" ? /^\/[^/]+/.test(path) : (/^\/shorts\/[^/]+/i.test(path) || (path === "/watch" && Boolean(youtubeWatchId)))));
  if (!validPath) throw new Error(`Use a direct ${platform} post URL rather than a profile, redirect, or search URL.`);

  url.search = youtubeWatchId ? `?v=${encodeURIComponent(youtubeWatchId)}` : "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function toMetricPoint(snapshot: {
  capturedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}): OutcomeMetricPoint {
  return {
    capturedAt: snapshot.capturedAt,
    views: snapshot.views,
    likes: snapshot.likes,
    comments: snapshot.comments,
    shares: snapshot.shares,
    saves: snapshot.saves,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ownedContentVersion(authUserId: string, contentVersionExternalId: string) {
  const workspace = await getOrCreatePersonalWorkspace(authUserId);
  const contentVersion = await prisma.contentVersion.findFirst({
    where: { externalId: contentVersionExternalId, workspaceId: workspace.dbId },
    include: { publication: true },
  });
  if (!contentVersion) throw new Error("Approved content version not found.");
  return { workspace, contentVersion };
}

export async function confirmManualPublication(input: {
  authUserId: string;
  contentVersionExternalId: string;
  platformPostUrl: string;
  publishedAt: Date;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new Error("Publication confirmation is required.");
  const { contentVersion } = await ownedContentVersion(input.authUserId, input.contentVersionExternalId);
  if (contentVersion.publication) {
    return {
      publicationExternalId: contentVersion.publication.externalId,
      platformPostUrl: contentVersion.publication.platformPostUrl,
      reused: true,
    };
  }

  const publishedAt = parseDate(input.publishedAt, "Published time");
  const now = new Date();
  if (publishedAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new Error("Published time cannot be in the future.");
  const platformPostUrl = canonicalPlatformPostUrl(contentVersion.platform, input.platformPostUrl);
  const publication = await prisma.contentPublication.create({
    data: {
      externalId: newExternalId("ocp"),
      contentVersionId: contentVersion.id,
      platformPostUrl,
      publishedAt,
      confirmedAt: now,
      source: "MANUAL",
    },
  });
  return { publicationExternalId: publication.externalId, platformPostUrl: publication.platformPostUrl, reused: false };
}

async function ensureOutcomeEvaluation(input: {
  workspaceId: string;
  contentVersion: {
    id: string;
    externalId: string;
    destinationRef: string;
    platform: string;
    publication: { publishedAt: Date } | null;
  };
  metricSnapshot: { id: string; capturedAt: Date; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null };
}) {
  if (!input.contentVersion.publication) throw new Error("Confirm manual publication before evaluating outcomes.");

  const existing = await prisma.contentOutcomeEvaluation.findFirst({
    where: { contentVersionId: input.contentVersion.id, metricSnapshotId: input.metricSnapshot.id },
    include: { recommendation: true },
  });
  if (existing) return { evaluation: existing, recommendation: existing.recommendation, reused: true };

  const [currentSnapshots, comparableVersions] = await Promise.all([
    prisma.contentMetricSnapshot.findMany({
      where: { contentVersionId: input.contentVersion.id },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.contentVersion.findMany({
      where: {
        workspaceId: input.workspaceId,
        destinationRef: input.contentVersion.destinationRef,
        platform: input.contentVersion.platform,
        id: { not: input.contentVersion.id },
        metricSnapshots: { some: {} },
      },
      include: { metricSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    }),
  ]);

  const comparableFinalSnapshots = comparableVersions
    .map((version) => version.metricSnapshots[0])
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot))
    .map(toMetricPoint);
  const result = evaluateContentOutcome({
    publishedAt: input.contentVersion.publication.publishedAt,
    snapshots: currentSnapshots.map(toMetricPoint),
    comparableFinalSnapshots,
  });
  const evaluation = await prisma.contentOutcomeEvaluation.create({
    data: {
      contentVersionId: input.contentVersion.id,
      metricSnapshotId: input.metricSnapshot.id,
      status: result.status,
      decision: result.decision,
      confidence: result.confidence,
      summary: result.summary,
      evidenceJson: toJson(result.evidence),
    },
  });
  const recommendation =
    result.status === "READY" && result.nextPlan
      ? await prisma.outcomePlanRecommendation.create({
          data: {
            externalId: newExternalId("orp"),
            workspaceId: input.workspaceId,
            contentVersionId: input.contentVersion.id,
            evaluationId: evaluation.id,
            status: "PENDING_APPROVAL",
            recommendationJson: toJson(result.nextPlan),
          },
        })
      : null;
  return { evaluation, recommendation, reused: false, result };
}

export async function recordManualMetricSnapshot(input: {
  authUserId: string;
  contentVersionExternalId: string;
  capturedAt: Date;
  metrics: ManualMetricInput;
}) {
  const { workspace, contentVersion } = await ownedContentVersion(input.authUserId, input.contentVersionExternalId);
  if (!contentVersion.publication) throw new Error("Confirm manual publication before recording platform metrics.");
  const capturedAt = parseDate(input.capturedAt, "Captured time");
  const now = new Date();
  if (capturedAt.getTime() < contentVersion.publication.publishedAt.getTime()) throw new Error("Captured time cannot be before the confirmed published time.");
  if (capturedAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new Error("Captured time cannot be in the future.");
  const metrics = parseManualMetrics(input.metrics);

  const existing = await prisma.contentMetricSnapshot.findUnique({
    where: { contentVersionId_capturedAt: { contentVersionId: contentVersion.id, capturedAt } },
  });
  const metricSnapshot =
    existing ??
    (await prisma.contentMetricSnapshot.create({
      data: { contentVersionId: contentVersion.id, capturedAt, source: "MANUAL", ...metrics },
    }));
  const outcome = await ensureOutcomeEvaluation({ workspaceId: workspace.dbId, contentVersion, metricSnapshot });
  return {
    metricSnapshotId: metricSnapshot.id,
    snapshotReused: Boolean(existing),
    evaluation: {
      status: outcome.evaluation.status,
      decision: outcome.evaluation.decision,
      confidence: outcome.evaluation.confidence,
      summary: outcome.evaluation.summary,
      reused: outcome.reused,
    },
    recommendationExternalId: outcome.recommendation?.externalId ?? null,
  };
}

export async function decideOutcomePlanRecommendation(input: {
  authUserId: string;
  recommendationExternalId: string;
  decision: "APPROVED" | "REJECTED";
  confirmed: boolean;
}) {
  if (input.decision === "APPROVED" && !input.confirmed) throw new Error("Owner confirmation is required to approve a next-plan recommendation.");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const recommendation = await prisma.outcomePlanRecommendation.findFirst({
    where: { externalId: input.recommendationExternalId, workspaceId: workspace.dbId },
  });
  if (!recommendation) throw new Error("Outcome recommendation not found.");
  if (recommendation.status !== "PENDING_APPROVAL") {
    return { status: recommendation.status, reused: true, generated: false, scheduled: false, published: false };
  }
  const updated = await prisma.outcomePlanRecommendation.update({
    where: { id: recommendation.id },
    data: { status: input.decision, decidedAt: new Date() },
  });
  // This is intentionally just an approval record. The owner must initiate any
  // later draft or schedule through the separate existing provider-disabled UI.
  return { status: updated.status, reused: false, generated: false, scheduled: false, published: false };
}

export function recommendationPlan(value: unknown): NextPlanRecommendation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<NextPlanRecommendation>;
  if (
    typeof candidate.focus !== "string" ||
    !Array.isArray(candidate.preserve) ||
    typeof candidate.test !== "string" ||
    candidate.approvalBoundary !== "Owner approval is required before any separate draft or schedule action."
  ) {
    return null;
  }
  return {
    focus: candidate.focus,
    preserve: candidate.preserve.filter((item): item is string => typeof item === "string"),
    test: candidate.test,
    approvalBoundary: candidate.approvalBoundary,
  };
}

export function outcomeEvidence(value: unknown): OutcomeEvaluationResult["evidence"] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OutcomeEvaluationResult["evidence"]>;
  if (candidate.scope !== "manual-platform-metrics" || typeof candidate.caveat !== "string" || !candidate.current || !candidate.baseline || !Array.isArray(candidate.limitations)) return null;
  return candidate as OutcomeEvaluationResult["evidence"];
}
