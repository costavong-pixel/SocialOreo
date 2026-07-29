"use server";

import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { competitorLimitForPlan } from "@/lib/competitors/entitlements";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";
import { enablePublicSnapshotMonitor, pausePublicSnapshotMonitor } from "@/lib/snapshots/public-profile-snapshots";
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

  await prisma.competitorBoardEntry.deleteMany({ where: { userId: account.id, auditJobId } });
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
