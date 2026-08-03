"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { competitorLimitForPlan } from "@/lib/competitors/entitlements";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";
import { enablePublicSnapshotMonitor, pausePublicSnapshotMonitor } from "@/lib/snapshots/public-profile-snapshots";
import { normalizeWatchCadence, WATCH_MAX_COMPETITORS, watchProviderCostEstimate } from "@/lib/snapshots/watch-policy";
import { runInstagramTrendScan, runTikTokTrendScan, runYouTubeTrendScan } from "@/lib/trends/trend-scans";
import { normalizeTrendWatchlistInput } from "@/lib/trends/watchlist";

export async function addCompetitorToBoard(formData: FormData) {
  const auditJobId = String(formData.get("auditJobId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !auditJobId) return;

  const account = await prisma.user.findUnique({
    where: { authUserId: sessionUser.id },
    select: { id: true, accessPlan: true },
  });
  if (!account) return;

  const competitorLimit = competitorLimitForPlan(account.accessPlan);
  if (competitorLimit === 0) return;

  const audit = await prisma.auditJob.findFirst({
    where: { id: auditJobId, userId: account.id, status: "COMPLETED", auditReport: { isNot: null } },
    select: { id: true },
  });
  if (!audit) return;

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.competitorBoardEntry.findUnique({
      where: { userId_auditJobId: { userId: account.id, auditJobId: audit.id } },
      select: { id: true },
    });
    if (existing) return;

    const savedCompetitors = await transaction.competitorBoardEntry.count({ where: { userId: account.id } });
    if (savedCompetitors >= competitorLimit) return;

    await transaction.competitorBoardEntry.create({
      data: { userId: account.id, auditJobId: audit.id },
    });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/dashboard");
}

export async function removeCompetitorFromBoard(formData: FormData) {
  const auditJobId = String(formData.get("auditJobId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !auditJobId) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  const audit = await prisma.auditJob.findFirst({
    where: { id: auditJobId, userId: account.id },
    select: { profileUrl: true },
  });
  if (!audit) return;

  await prisma.$transaction(async (transaction) => {
    await transaction.competitorBoardEntry.deleteMany({ where: { userId: account.id, auditJobId } });
    await transaction.publicProfileMonitor.updateMany({
      where: { userId: account.id, profileUrl: audit.profileUrl },
      data: { enabled: false, nextCaptureAt: null },
    });
  });
  revalidatePath("/dashboard");
}

export async function startPublicSnapshotHistory(formData: FormData) {
  const auditJobId = String(formData.get("auditJobId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !auditJobId) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;
  await enablePublicSnapshotMonitor({ userId: account.id, auditJobId });
  revalidatePath("/dashboard");
}

export async function pausePublicSnapshotHistory(formData: FormData) {
  const monitorId = String(formData.get("monitorId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !monitorId) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;
  await pausePublicSnapshotMonitor({ userId: account.id, monitorId });
  revalidatePath("/dashboard");
}

export async function startCompetitorWatch(formData: FormData) {
  const auditJobId = String(formData.get("auditJobId") ?? "");
  const cadenceHours = normalizeWatchCadence(formData.get("cadenceHours"));
  const sessionUser = await getSessionUser();
  if (!sessionUser || !auditJobId || !cadenceHours) return;

  const account = await prisma.user.findUnique({
    where: { authUserId: sessionUser.id },
    select: { id: true, accessPlan: true },
  });
  if (!account) return;

  const competitorLimit = Math.min(WATCH_MAX_COMPETITORS, competitorLimitForPlan(account.accessPlan));
  if (competitorLimit === 0) return;

  const boardEntry = await prisma.competitorBoardEntry.findFirst({
    where: { userId: account.id, auditJobId, auditJob: { status: "COMPLETED" } },
    select: {
      auditJob: { select: { profileUrl: true, platform: true, provider: true, reelLimit: true } },
    },
  });
  if (!boardEntry) return;

  await prisma.$transaction(async (transaction) => {
    const saved = await transaction.competitorBoardEntry.findMany({
      where: { userId: account.id },
      select: { auditJob: { select: { profileUrl: true } } },
    });
    const profileUrls = saved.map((entry) => entry.auditJob.profileUrl);
    const watchedCount = profileUrls.length
      ? await transaction.publicProfileMonitor.count({ where: { userId: account.id, enabled: true, profileUrl: { in: profileUrls } } })
      : 0;
    const current = await transaction.publicProfileMonitor.findUnique({
      where: { userId_profileUrl: { userId: account.id, profileUrl: boardEntry.auditJob.profileUrl } },
      select: { id: true, enabled: true },
    });
    if (!current?.enabled && watchedCount >= competitorLimit) return;

    const providerCostEstimate = watchProviderCostEstimate(boardEntry.auditJob.platform, boardEntry.auditJob.reelLimit);
    await transaction.publicProfileMonitor.upsert({
      where: { userId_profileUrl: { userId: account.id, profileUrl: boardEntry.auditJob.profileUrl } },
      create: {
        userId: account.id,
        profileUrl: boardEntry.auditJob.profileUrl,
        platform: boardEntry.auditJob.platform,
        provider: boardEntry.auditJob.provider,
        reelLimit: boardEntry.auditJob.reelLimit,
        enabled: true,
        cadenceHours,
        providerCostEstimate: new Prisma.Decimal(providerCostEstimate),
        nextCaptureAt: new Date(),
      },
      update: {
        platform: boardEntry.auditJob.platform,
        provider: boardEntry.auditJob.provider,
        reelLimit: boardEntry.auditJob.reelLimit,
        enabled: true,
        cadenceHours,
        providerCostEstimate: new Prisma.Decimal(providerCostEstimate),
        nextCaptureAt: new Date(),
        lastError: null,
      },
    });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/dashboard");
}

export async function pauseCompetitorWatch(formData: FormData) {
  const monitorId = String(formData.get("monitorId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !monitorId) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  await prisma.publicProfileMonitor.updateMany({
    where: { id: monitorId, userId: account.id },
    data: { enabled: false, nextCaptureAt: null },
  });
  revalidatePath("/dashboard");
}

export async function addTrendWatchlist(formData: FormData) {
  const source = normalizeTrendWatchlistInput(formData);
  const sessionUser = await getSessionUser();
  if (!sessionUser || !source) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  await prisma.trendWatchlist.upsert({
    where: { userId_platform_sourceType_query: { userId: account.id, ...source } },
    create: { userId: account.id, ...source },
    update: {},
  });
  revalidatePath("/dashboard");
}

export async function removeTrendWatchlist(formData: FormData) {
  const watchlistId = String(formData.get("watchlistId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !watchlistId) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  await prisma.trendWatchlist.deleteMany({ where: { id: watchlistId, userId: account.id } });
  revalidatePath("/dashboard");
}

export async function startInstagramTrendScan(formData: FormData) {
  const watchlistId = String(formData.get("watchlistId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !watchlistId) return;
  if (!await requireAdminByAuthUserId(sessionUser.id)) return;

  const limit = checkRateLimit(`instagram-trend-pilot:${sessionUser.id}`, { maxRequests: 2, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  try {
    await runInstagramTrendScan({ userId: account.id, watchlistId });
  } catch {
    // The scan record keeps the operator-visible failure without exposing provider details to the form action.
  }
  revalidatePath("/dashboard");
}

export async function startTikTokTrendScan(formData: FormData) {
  const watchlistId = String(formData.get("watchlistId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !watchlistId) return;
  if (!await requireAdminByAuthUserId(sessionUser.id)) return;

  const limit = checkRateLimit(`tiktok-trend-pilot:${sessionUser.id}`, { maxRequests: 2, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  try {
    await runTikTokTrendScan({ userId: account.id, watchlistId });
  } catch {
    // The scan record keeps the operator-visible failure without exposing provider details to the form action.
  }
  revalidatePath("/dashboard");
}

export async function startYouTubeTrendScan(formData: FormData) {
  const watchlistId = String(formData.get("watchlistId") ?? "");
  const sessionUser = await getSessionUser();
  if (!sessionUser || !watchlistId) return;
  if (!await requireAdminByAuthUserId(sessionUser.id)) return;

  const limit = checkRateLimit(`youtube-trend-pilot:${sessionUser.id}`, { maxRequests: 2, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return;

  const account = await prisma.user.findUnique({ where: { authUserId: sessionUser.id }, select: { id: true } });
  if (!account) return;

  try {
    await runYouTubeTrendScan({ userId: account.id, watchlistId });
  } catch {
    // The scan record keeps the operator-visible failure without exposing provider details to the form action.
  }
  revalidatePath("/dashboard");
}
