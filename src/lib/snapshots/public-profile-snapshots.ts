import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import type { NormalizedSocialAuditResult, SocialPlatform, SocialProvider } from "@/lib/providers/social/types";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";
import { normalizeWatchCadence, sanitizedWatchError, watchCaptureKey, watchProviderCostEstimate } from "./watch-policy";

type SnapshotMetrics = {
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  reelsCollected: number;
  totalViews?: number;
  medianViews?: number;
  visibleInteractions?: number;
  visibleInteractionRate?: number;
};

type AuditSnapshotInput = {
  userId: string;
  auditJobId: string;
  profileUrl: string;
  platform: string;
  provider: string;
  reelLimit: number;
  capturedAt: Date;
  auditData: NormalizedSocialAuditResult;
};

function finiteInteger(value: number | undefined | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function snapshotMetrics(auditData: NormalizedSocialAuditResult): SnapshotMetrics {
  const videos = auditData.videos.map((video, index) => ({
    id: video.providerVideoId ?? `${video.url}-${index}`,
    url: video.url,
    caption: video.caption,
    hashtags: video.hashtags,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    saveCount: video.saveCount,
    postedAt: video.postedAt ? new Date(video.postedAt) : undefined,
    thumbnailUrl: video.thumbnailUrl,
    audioName: video.audioName,
    transcriptIfAvailable: video.transcriptIfAvailable,
  }));
  const metrics = buildPublicMetrics(auditData.profile, videos);
  const visibleInteractionValues = videos.flatMap((video) => [video.likeCount, video.commentCount, video.shareCount, video.saveCount]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0));
  const visibleInteractions = visibleInteractionValues.reduce((sum, value) => sum + value, 0);

  return {
    followerCount: finiteInteger(auditData.profile.followerCount),
    followingCount: finiteInteger(auditData.profile.followingCount),
    postCount: finiteInteger(auditData.profile.postCount),
    reelsCollected: videos.length,
    totalViews: finiteInteger(metrics.summary.totalViews),
    medianViews: finiteInteger(metrics.summary.medianViews),
    visibleInteractions: visibleInteractionValues.length ? visibleInteractions : undefined,
    visibleInteractionRate: metrics.summary.engagementPerView,
  };
}

function nextCaptureAt(from: Date, cadenceHours: number) {
  return new Date(from.getTime() + Math.max(1, cadenceHours) * 60 * 60 * 1000);
}

function asPlatform(value: string): SocialPlatform {
  if (value === "instagram" || value === "tiktok" || value === "youtube") return value;
  throw new Error(`Unsupported stored social platform: ${value}`);
}

function asProvider(value: string): SocialProvider {
  if (value === "apify" || value === "data365" || value === "youtube") return value;
  throw new Error(`Unsupported stored social provider: ${value}`);
}

export async function recordAuditPublicSnapshot(input: AuditSnapshotInput) {
  const monitor = await prisma.publicProfileMonitor.upsert({
    where: { userId_profileUrl: { userId: input.userId, profileUrl: input.profileUrl } },
    create: {
      userId: input.userId,
      profileUrl: input.profileUrl,
      platform: input.platform,
      provider: input.provider,
      reelLimit: input.reelLimit,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, input.reelLimit)),
    },
    update: {
      platform: input.platform,
      provider: input.provider,
      reelLimit: input.reelLimit,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, input.reelLimit)),
    },
  });
  const metrics = snapshotMetrics(input.auditData);
  const sourceUrls = input.auditData.videos.map((video) => video.url).filter(Boolean);
  await prisma.publicProfileSnapshot.upsert({
    where: { sourceAuditJobId: input.auditJobId },
    create: {
      monitorId: monitor.id,
      sourceAuditJobId: input.auditJobId,
      captureKey: `audit:${input.auditJobId}`,
      capturedAt: input.capturedAt,
      provider: input.auditData.profile.provider,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, input.reelLimit)),
      sourceUrls,
      ...metrics,
    },
    update: {
      captureKey: `audit:${input.auditJobId}`,
      capturedAt: input.capturedAt,
      provider: input.auditData.profile.provider,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, input.reelLimit)),
      sourceUrls,
      ...metrics,
    },
  });
  return prisma.publicProfileMonitor.update({
    where: { id: monitor.id },
    data: {
      lastCapturedAt: input.capturedAt,
      nextCaptureAt: monitor.enabled ? nextCaptureAt(input.capturedAt, monitor.cadenceHours) : null,
      lastError: null,
    },
  });
}

export async function backfillPublicSnapshotsForProfile(input: { userId: string; auditJobId: string }) {
  const audit = await prisma.auditJob.findFirst({
    where: { id: input.auditJobId, userId: input.userId, status: "COMPLETED" },
    include: { socialProfiles: true, socialVideos: true },
  });
  if (!audit) return null;

  const matchingAudits = await prisma.auditJob.findMany({
    where: { userId: input.userId, status: "COMPLETED", profileUrl: audit.profileUrl },
    orderBy: { completedAt: "asc" },
    include: { socialProfiles: true, socialVideos: true },
  });

  let monitor = null;
  for (const source of matchingAudits) {
    const profile = source.socialProfiles[0];
    if (!profile) continue;
    monitor = await recordAuditPublicSnapshot({
      userId: input.userId,
      auditJobId: source.id,
      profileUrl: source.profileUrl,
      platform: source.platform,
      provider: source.provider,
      reelLimit: source.reelLimit,
      capturedAt: source.completedAt ?? source.createdAt,
      auditData: {
        profile: {
          platform: asPlatform(profile.platform),
          provider: asProvider(profile.provider),
          username: profile.username ?? undefined,
          displayName: profile.displayName ?? undefined,
          profileUrl: profile.profileUrl,
          bio: profile.bio ?? undefined,
          followerCount: profile.followerCount ?? undefined,
          followingCount: profile.followingCount ?? undefined,
          postCount: profile.postCount ?? undefined,
          profileImageUrl: profile.profileImageUrl ?? undefined,
          rawProviderPayload: profile.rawProviderPayload,
        },
        videos: source.socialVideos.map((video) => ({
          platform: asPlatform(video.platform),
          provider: asProvider(video.provider),
          providerVideoId: video.providerVideoId ?? undefined,
          url: video.url,
          caption: video.caption ?? undefined,
          hashtags: video.hashtags,
          mentions: video.mentions,
          audioName: video.audioName ?? undefined,
          durationSeconds: video.durationSeconds ?? undefined,
          viewCount: video.viewCount ?? undefined,
          likeCount: video.likeCount ?? undefined,
          commentCount: video.commentCount ?? undefined,
          shareCount: video.shareCount ?? undefined,
          saveCount: video.saveCount ?? undefined,
          postedAt: video.postedAt?.toISOString(),
          thumbnailUrl: video.thumbnailUrl ?? undefined,
          videoUrlIfAvailable: video.videoUrlIfAvailable ?? undefined,
          transcriptIfAvailable: video.transcriptIfAvailable ?? undefined,
          rawProviderPayload: video.rawProviderPayload,
        })),
      },
    });
  }
  return monitor;
}

export async function enablePublicSnapshotMonitor(input: { userId: string; auditJobId: string }) {
  const monitor = await backfillPublicSnapshotsForProfile(input);
  if (!monitor) return null;
  return prisma.publicProfileMonitor.update({
    where: { id: monitor.id },
    data: { enabled: true, lastError: null, nextCaptureAt: new Date() },
  });
}

export async function pausePublicSnapshotMonitor(input: { userId: string; monitorId: string }) {
  await prisma.publicProfileMonitor.updateMany({
    where: { id: input.monitorId, userId: input.userId },
    data: { enabled: false, nextCaptureAt: null },
  });
}

export async function processDuePublicProfileSnapshots(now = new Date()) {
  const monitors = await prisma.publicProfileMonitor.findMany({
    where: { enabled: true, nextCaptureAt: { lte: now } },
    orderBy: { nextCaptureAt: "asc" },
    take: 10,
  });

  for (const monitor of monitors) {
    const cadenceHours = normalizeWatchCadence(monitor.cadenceHours) ?? 168;
    const captureKey = watchCaptureKey(monitor.id, now, cadenceHours);
    try {
      const existingCapture = await prisma.publicProfileSnapshot.findUnique({
        where: { captureKey },
        select: { id: true },
      });
      if (existingCapture) {
        continue;
      }

      const currentMonitor = await prisma.publicProfileMonitor.findFirst({
        where: { id: monitor.id, enabled: true },
        select: { id: true },
      });
      if (!currentMonitor) continue;

      const auditData = await fetchSocialAudit(monitor.platform as SocialPlatform, {
        url: monitor.profileUrl,
        limit: monitor.reelLimit,
      });
      const metrics = snapshotMetrics(auditData);
      const sourceUrls = auditData.videos.map((video) => video.url).filter(Boolean);
      const providerCostEstimate = watchProviderCostEstimate(monitor.platform, monitor.reelLimit);

      const stillEnabled = await prisma.publicProfileMonitor.findFirst({
        where: { id: monitor.id, enabled: true },
        select: { id: true },
      });
      if (!stillEnabled) continue;

      await prisma.$transaction([
        prisma.publicProfileSnapshot.upsert({
          where: { captureKey },
          create: {
            monitorId: monitor.id,
            captureKey,
            capturedAt: now,
            provider: auditData.profile.provider,
            providerCostEstimate: new Prisma.Decimal(providerCostEstimate),
            sourceUrls,
            ...metrics,
          },
          update: {
            capturedAt: now,
            provider: auditData.profile.provider,
            providerCostEstimate: new Prisma.Decimal(providerCostEstimate),
            sourceUrls,
            ...metrics,
          },
        }),
        prisma.publicProfileMonitor.update({
          where: { id: monitor.id },
          data: {
            providerCostEstimate: new Prisma.Decimal(providerCostEstimate),
            provider: auditData.profile.provider,
            lastCapturedAt: now,
            nextCaptureAt: nextCaptureAt(now, cadenceHours),
            lastError: null,
          },
        }),
      ]);
    } catch (error) {
      const lastError = sanitizedWatchError(error);
      await prisma.publicProfileMonitor.update({
        where: { id: monitor.id },
        data: { lastError, nextCaptureAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      });
    }
  }

  return monitors.length;
}

export function buildPublicSnapshotMetrics(auditData: NormalizedSocialAuditResult) {
  return snapshotMetrics(auditData);
}
