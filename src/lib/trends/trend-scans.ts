import { Prisma, TrendPlatform, TrendScanStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { NormalizedSocialVideo } from "@/lib/providers/social/types";
import { fetchInstagramTrendVideos, INSTAGRAM_TREND_ESTIMATED_COST_USD } from "./instagram-trend-provider";
import { fetchTikTokTrendVideos, TIKTOK_TREND_ESTIMATED_COST_USD } from "./tiktok-trend-provider";
import { fetchYouTubeTrendVideos } from "./youtube-trend-provider";

function visibleInteractionRate(video: { viewCount?: number; likeCount?: number; commentCount?: number; shareCount?: number; saveCount?: number }) {
  if (!video.viewCount || video.viewCount <= 0) return undefined;
  const interactions = [video.likeCount, video.commentCount, video.shareCount, video.saveCount]
    .filter((value): value is number => typeof value === "number" && value >= 0)
    .reduce((sum, value) => sum + value, 0);
  return interactions / video.viewCount;
}

export class TrendScanUnavailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function creatorHandleFromVideo(video: { rawProviderPayload?: unknown }) {
  const raw = video.rawProviderPayload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const ownerUsername = typeof item.ownerUsername === "string" ? item.ownerUsername : undefined;
  const author = item.authorMeta ?? item.author;
  const authorRecord = author && typeof author === "object" && !Array.isArray(author) ? author as Record<string, unknown> : undefined;
  const snippet = item.snippet && typeof item.snippet === "object" && !Array.isArray(item.snippet) ? item.snippet as Record<string, unknown> : undefined;
  const handle = ownerUsername ?? (typeof authorRecord?.name === "string" ? authorRecord.name : undefined) ?? (typeof authorRecord?.uniqueId === "string" ? authorRecord.uniqueId : undefined) ?? (typeof snippet?.channelTitle === "string" ? snippet.channelTitle : undefined);
  return handle?.replace(/^@/, "") || null;
}

function trendVideoData(scanId: string, video: NormalizedSocialVideo) {
  return {
    scanId,
    sourceUrl: video.url,
    providerVideoId: video.providerVideoId,
    creatorHandle: creatorHandleFromVideo(video),
    caption: video.caption,
    hashtags: video.hashtags,
    postedAt: video.postedAt ? new Date(video.postedAt) : null,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    saveCount: video.saveCount,
    visibleInteractionRate: visibleInteractionRate(video),
    thumbnailUrl: video.thumbnailUrl,
    transcriptIfAvailable: video.transcriptIfAvailable,
    rawProviderPayload: video.rawProviderPayload as Prisma.InputJsonValue,
  };
}

export async function runInstagramTrendScan(input: { userId: string; watchlistId: string }) {
  const watchlist = await prisma.trendWatchlist.findFirst({
    where: { id: input.watchlistId, userId: input.userId, platform: TrendPlatform.INSTAGRAM },
  });
  if (!watchlist) throw new TrendScanUnavailableError("This Instagram trend source is unavailable.");

  const running = await prisma.trendScan.findFirst({
    where: { watchlistId: watchlist.id, status: TrendScanStatus.RUNNING },
    select: { id: true },
  });
  if (running) throw new TrendScanUnavailableError("This source is already scanning.");

  const scan = await prisma.trendScan.create({
    data: {
      watchlistId: watchlist.id,
      platform: watchlist.platform,
      sourceType: watchlist.sourceType,
      query: watchlist.query,
      provider: "apify",
      status: TrendScanStatus.RUNNING,
      estimatedCost: new Prisma.Decimal(INSTAGRAM_TREND_ESTIMATED_COST_USD),
    },
  });

  try {
    const videos = await fetchInstagramTrendVideos(watchlist);
    await prisma.$transaction([
      prisma.trendVideo.createMany({
        data: videos.map((video) => trendVideoData(scan.id, video)),
        skipDuplicates: true,
      }),
      prisma.trendScan.update({
        where: { id: scan.id },
        data: { status: TrendScanStatus.COMPLETED, resultCount: videos.length, completedAt: new Date() },
      }),
    ]);
    return { scanId: scan.id, resultCount: videos.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Instagram trend scan failed.";
    await prisma.trendScan.update({
      where: { id: scan.id },
      data: { status: TrendScanStatus.FAILED, errorMessage, completedAt: new Date() },
    });
    throw error;
  }
}

export async function runTikTokTrendScan(input: { userId: string; watchlistId: string }) {
  const watchlist = await prisma.trendWatchlist.findFirst({
    where: { id: input.watchlistId, userId: input.userId, platform: TrendPlatform.TIKTOK },
  });
  if (!watchlist) throw new TrendScanUnavailableError("This TikTok trend source is unavailable.");

  const running = await prisma.trendScan.findFirst({
    where: { watchlistId: watchlist.id, status: TrendScanStatus.RUNNING },
    select: { id: true },
  });
  if (running) throw new TrendScanUnavailableError("This source is already scanning.");

  const scan = await prisma.trendScan.create({
    data: {
      watchlistId: watchlist.id,
      platform: watchlist.platform,
      sourceType: watchlist.sourceType,
      query: watchlist.query,
      provider: "apify",
      status: TrendScanStatus.RUNNING,
      estimatedCost: new Prisma.Decimal(TIKTOK_TREND_ESTIMATED_COST_USD),
    },
  });

  try {
    const videos = await fetchTikTokTrendVideos(watchlist);
    await prisma.$transaction([
      prisma.trendVideo.createMany({
        data: videos.map((video) => trendVideoData(scan.id, video)),
        skipDuplicates: true,
      }),
      prisma.trendScan.update({
        where: { id: scan.id },
        data: { status: TrendScanStatus.COMPLETED, resultCount: videos.length, completedAt: new Date() },
      }),
    ]);
    return { scanId: scan.id, resultCount: videos.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "TikTok trend scan failed.";
    await prisma.trendScan.update({
      where: { id: scan.id },
      data: { status: TrendScanStatus.FAILED, errorMessage, completedAt: new Date() },
    });
    throw error;
  }
}

export async function runYouTubeTrendScan(input: { userId: string; watchlistId: string }) {
  const watchlist = await prisma.trendWatchlist.findFirst({
    where: { id: input.watchlistId, userId: input.userId, platform: TrendPlatform.YOUTUBE },
  });
  if (!watchlist) throw new TrendScanUnavailableError("This YouTube trend source is unavailable.");

  const running = await prisma.trendScan.findFirst({
    where: { watchlistId: watchlist.id, status: TrendScanStatus.RUNNING },
    select: { id: true },
  });
  if (running) throw new TrendScanUnavailableError("This source is already scanning.");

  const scan = await prisma.trendScan.create({
    data: {
      watchlistId: watchlist.id,
      platform: watchlist.platform,
      sourceType: watchlist.sourceType,
      query: watchlist.query,
      provider: "youtube-data-api",
      status: TrendScanStatus.RUNNING,
    },
  });

  try {
    const videos = await fetchYouTubeTrendVideos(watchlist);
    await prisma.$transaction([
      prisma.trendVideo.createMany({
        data: videos.map((video) => trendVideoData(scan.id, video)),
        skipDuplicates: true,
      }),
      prisma.trendScan.update({
        where: { id: scan.id },
        data: { status: TrendScanStatus.COMPLETED, resultCount: videos.length, completedAt: new Date() },
      }),
    ]);
    return { scanId: scan.id, resultCount: videos.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "YouTube trend scan failed.";
    await prisma.trendScan.update({
      where: { id: scan.id },
      data: { status: TrendScanStatus.FAILED, errorMessage, completedAt: new Date() },
    });
    throw error;
  }
}
