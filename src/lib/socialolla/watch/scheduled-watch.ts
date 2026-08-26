import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import { socialProviderForPlatform } from "@/lib/providers/social/audit-provider-config";
import type { NormalizedSocialAuditResult, SocialPlatform } from "@/lib/providers/social/types";
import { intentKey, holdCredits, finalizeCredits, refundCredits } from "@/lib/socialolla/credits/batch-service";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { buildPublicSnapshotMetrics } from "@/lib/snapshots/public-profile-snapshots";
import { normalizeWatchCadence, sanitizedWatchError, watchCaptureKey, watchProviderCostEstimate, type WatchCadenceHours } from "@/lib/snapshots/watch-policy";
import { validateSocialUrl } from "@/lib/validators/social-url";

export const WATCH_MAX_CAPTURE_ATTEMPTS = 3;
export const WATCH_CLAIM_LEASE_MS = 10 * 60 * 1000;
export const WATCH_SETTLEMENT_RECOVERY_MS = 60 * 60 * 1000;

const RETRY_BASE_MS = 5 * 60 * 1000;
const TERMINAL_RETRY_MS = 24 * 60 * 60 * 1000;

type WatchPlatform = "instagram" | "tiktok";

type WatchMonitorRow = {
  id: string;
  userId: string;
  profileUrl: string;
  platform: string;
  provider: string;
  reelLimit: number;
  enabled: boolean;
  cadenceHours: number;
  providerCostEstimate: unknown;
  lastCapturedAt: Date | null;
  nextCaptureAt: Date | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
  retryCount: number;
};

type WatchReportRow = {
  id: string;
  externalId: string;
  intentKey: string | null;
  monitorId: string | null;
  captureKey: string | null;
  workspaceId: string;
  profileUrl: string;
  platform: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  reportJson: unknown;
  deltaJson: unknown;
  evidenceJson: unknown;
  provider: string;
  creditCost: number;
  attemptCount: number;
  nextAttemptAt: Date | null;
  claimToken: string | null;
  claimedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

type SnapshotMetrics = ReturnType<typeof buildPublicSnapshotMetrics>;
type SnapshotMetricSource = Partial<{ [K in keyof SnapshotMetrics]: number | null }>;

type WatchDelta = {
  baselineCapturedAt: string;
  capturedAt: string;
  metrics: Record<string, { previous: number | null; current: number | null; delta: number | null }>;
} | null;

type WatchEvidence = {
  type: "WATCH_CAPTURE";
  captureKey: string;
  capturedAt: string;
  profileUrl: string;
  platform: string;
  provider: string;
  sourceUrls: string[];
  metrics: SnapshotMetrics;
  baselineCapturedAt: string | null;
};

export type WatchMonitorView = {
  profileUrl: string;
  platform: string;
  provider: string;
  cadenceHours: WatchCadenceHours;
  enabled: boolean;
  nextCaptureAt: string | null;
  lastCapturedAt: string | null;
  lastError: string | null;
  retryCount: number;
  reportCount: number;
};

export type ScheduledWatchResult =
  | { status: "COMPLETED"; reportExternalId: string; captureKey: string; provider: string; delta: WatchDelta }
  | { status: "RETRY_SCHEDULED"; reportExternalId: string; captureKey: string; nextAttemptAt: string; reason: string }
  | { status: "FAILED"; reportExternalId: string; captureKey: string; refunded: boolean; reason: string }
  | { status: "SKIPPED"; reportExternalId: string; captureKey: string; reason: string };

export type ScheduledWatchSummary = {
  inspected: number;
  completed: number;
  retried: number;
  failed: number;
  skipped: number;
};

export function assertWatchWorkerStagingRuntime(env: Record<string, string | undefined> = process.env): void {
  const nodeEnvironment = (env.NODE_ENV ?? "").trim().toLowerCase();
  const appEnvironment = (env.SOCIALOLLA_ENV ?? "").trim().toLowerCase();
  if (nodeEnvironment === "production" || appEnvironment !== "staging") {
    throw new Error("The Watch worker is staging-only.");
  }
}

function externalId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function nextCaptureAt(from: Date, cadenceHours: number): Date {
  return new Date(from.getTime() + Math.max(1, cadenceHours) * 60 * 60 * 1000);
}

export function watchRetryDelayMs(attemptCount: number): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  return Math.min(TERMINAL_RETRY_MS, RETRY_BASE_MS * (2 ** (attempt - 1)));
}

function platform(value: string): WatchPlatform {
  if (value === "instagram" || value === "tiktok") return value;
  throw new Error("Unsupported Watch platform");
}

function profileInput(profileUrl: string, expectedPlatform: WatchPlatform) {
  const parsed = validateSocialUrl(profileUrl);
  if (!parsed.ok || parsed.kind !== "profile") {
    throw new Error(parsed.ok ? "Watch requires a public profile URL" : parsed.error);
  }
  if (parsed.platform !== expectedPlatform) throw new Error("Profile URL platform does not match the selected platform");
  return parsed.normalizedUrl;
}

function monitorView(monitor: WatchMonitorRow & { _count?: { watchReports?: number } }): WatchMonitorView {
  return {
    profileUrl: monitor.profileUrl,
    platform: monitor.platform,
    provider: monitor.provider,
    cadenceHours: normalizeWatchCadence(monitor.cadenceHours) ?? 168,
    enabled: monitor.enabled,
    nextCaptureAt: monitor.nextCaptureAt?.toISOString() ?? null,
    lastCapturedAt: monitor.lastCapturedAt?.toISOString() ?? null,
    lastError: monitor.lastError,
    retryCount: monitor.retryCount,
    reportCount: monitor._count?.watchReports ?? 0,
  };
}

export async function configureWatchMonitor(input: {
  userId: string;
  profileUrl: string;
  platform: WatchPlatform;
  cadenceHours: number;
  confirmed: boolean;
}): Promise<WatchMonitorView> {
  if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
  const cadenceHours = normalizeWatchCadence(input.cadenceHours);
  if (!cadenceHours) throw new Error("Choose a weekly or fortnightly cadence");
  const normalizedUrl = profileInput(input.profileUrl, input.platform);
  await getOrCreatePersonalWorkspace(input.userId);

  const monitor = await prisma.publicProfileMonitor.upsert({
    where: { userId_profileUrl: { userId: input.userId, profileUrl: normalizedUrl } },
    create: {
      userId: input.userId,
      profileUrl: normalizedUrl,
      platform: input.platform,
      provider: socialProviderForPlatform(input.platform),
      reelLimit: 30,
      enabled: true,
      cadenceHours,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, 30)),
      nextCaptureAt: new Date(),
      retryCount: 0,
      lastError: null,
    },
    update: {
      platform: input.platform,
      provider: socialProviderForPlatform(input.platform),
      enabled: true,
      cadenceHours,
      providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, 30)),
      nextCaptureAt: new Date(),
      lastError: null,
      retryCount: 0,
    },
  });
  return monitorView(monitor as WatchMonitorRow);
}

export async function listWatchMonitors(userId: string): Promise<WatchMonitorView[]> {
  const monitors = await prisma.publicProfileMonitor.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { watchReports: true } } },
  });
  return monitors.map((monitor) => monitorView(monitor as WatchMonitorRow & { _count: { watchReports: number } }));
}

export async function pauseWatchMonitor(input: { userId: string; profileUrl: string }): Promise<{ paused: boolean }> {
  const parsed = validateSocialUrl(input.profileUrl);
  if (!parsed.ok || parsed.kind !== "profile") return { paused: false };
  const result = await prisma.publicProfileMonitor.updateMany({
    where: { userId: input.userId, profileUrl: parsed.normalizedUrl },
    data: { enabled: false, nextCaptureAt: null },
  });
  return { paused: result.count > 0 };
}

async function watchCreditCost(userId: string): Promise<number> {
  const entitlement = await prisma.entitlementSnapshot.findFirst({
    where: { workspace: { ownerUserId: userId } },
    orderBy: { validFrom: "desc" },
    select: { watchCreditsPerRequest: true },
  });
  const configured = entitlement?.watchCreditsPerRequest ?? 1;
  return Math.max(1, Number.isInteger(configured) ? configured : Math.floor(Number(configured) || 1));
}

async function captureReportForMonitor(monitor: WatchMonitorRow, now: Date): Promise<WatchReportRow> {
  const cadenceHours = normalizeWatchCadence(monitor.cadenceHours) ?? 168;
  const scheduledAt = monitor.nextCaptureAt ?? now;
  const captureKey = watchCaptureKey(monitor.id, scheduledAt, cadenceHours);
  const existing = await prisma.watchReport.findUnique({ where: { captureKey } });
  if (existing) return existing as WatchReportRow;

  const workspace = await getOrCreatePersonalWorkspace(monitor.userId);
  const cost = await watchCreditCost(monitor.userId);
  const reportData = {
    externalId: externalId("wpr"),
    intentKey: intentKey(workspace.id, captureKey, "watch-capture"),
    monitorId: monitor.id,
    captureKey,
    workspaceId: workspace.dbId,
    profileUrl: monitor.profileUrl,
    platform: monitor.platform,
    status: "RUNNING" as const,
    provider: monitor.provider,
    creditCost: cost,
    nextAttemptAt: now,
  };
  try {
    return (await prisma.watchReport.create({ data: reportData })) as WatchReportRow;
  } catch (error) {
    const isUniqueConflict = error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
    if (!isUniqueConflict) throw error;
    const concurrent = await prisma.watchReport.findUnique({ where: { captureKey } });
    if (!concurrent) throw error;
    return concurrent as WatchReportRow;
  }
}

async function claimReport(report: WatchReportRow, now: Date): Promise<WatchReportRow | null> {
  const staleBefore = new Date(now.getTime() - WATCH_CLAIM_LEASE_MS);
  const token = randomBytes(18).toString("base64url");
  const claimed = await prisma.watchReport.updateMany({
    where: {
      id: report.id,
      status: "RUNNING",
      nextAttemptAt: { lte: now },
      OR: [{ claimToken: null }, { claimedAt: null }, { claimedAt: { lt: staleBefore } }],
    },
    data: { claimToken: token, claimedAt: now, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  const current = await prisma.watchReport.findUnique({ where: { id: report.id } });
  return (current as WatchReportRow | null) ?? null;
}

function metricValue(metrics: SnapshotMetricSource, key: keyof SnapshotMetrics): number | null {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildDelta(previous: ({ capturedAt: Date } & SnapshotMetricSource) | null, current: SnapshotMetrics, capturedAt: Date): WatchDelta {
  if (!previous) return null;
  const keys: Array<keyof SnapshotMetrics> = [
    "followerCount",
    "followingCount",
    "postCount",
    "reelsCollected",
    "totalViews",
    "medianViews",
    "visibleInteractions",
    "visibleInteractionRate",
  ];
  const metrics = Object.fromEntries(keys.map((key) => {
    const before = metricValue(previous, key);
    const after = metricValue(current, key);
    return [key, { previous: before, current: after, delta: before === null || after === null ? null : after - before }];
  }));
  return { baselineCapturedAt: previous.capturedAt.toISOString(), capturedAt: capturedAt.toISOString(), metrics };
}

function publicAudit(auditData: NormalizedSocialAuditResult) {
  const { rawProviderPayload: _profilePayload, ...profile } = auditData.profile;
  return {
    profile,
    videos: auditData.videos.map(({ rawProviderPayload: _videoPayload, ...video }) => video),
  };
}

function watchEvidence(input: {
  report: WatchReportRow;
  capturedAt: Date;
  auditData: NormalizedSocialAuditResult;
  metrics: SnapshotMetrics;
  previous: { capturedAt: Date } | null;
}): WatchEvidence {
  return {
    type: "WATCH_CAPTURE",
    captureKey: input.report.captureKey ?? "unknown",
    capturedAt: input.capturedAt.toISOString(),
    profileUrl: input.report.profileUrl,
    platform: input.report.platform,
    provider: input.auditData.profile.provider,
    sourceUrls: input.auditData.videos.map((video) => video.url).filter(Boolean),
    metrics: input.metrics,
    baselineCapturedAt: input.previous?.capturedAt.toISOString() ?? null,
  };
}

async function stillEnabled(monitor: WatchMonitorRow): Promise<boolean> {
  const current = await prisma.publicProfileMonitor.findFirst({
    where: { id: monitor.id, userId: monitor.userId, enabled: true },
    select: { id: true },
  });
  return Boolean(current);
}

async function scheduleRetry(report: WatchReportRow, monitor: WatchMonitorRow, now: Date, reason: string, delayMs = watchRetryDelayMs(report.attemptCount)) {
  const nextAttempt = new Date(now.getTime() + delayMs);
  await prisma.watchReport.update({
    where: { id: report.id },
    data: { nextAttemptAt: nextAttempt, lastError: reason, claimToken: null, claimedAt: null },
  });
  await prisma.publicProfileMonitor.update({
    where: { id: monitor.id },
    data: { lastAttemptAt: now, retryCount: report.attemptCount, lastError: reason },
  });
  return { status: "RETRY_SCHEDULED" as const, reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", nextAttemptAt: nextAttempt.toISOString(), reason };
}

async function terminalFailure(report: WatchReportRow, monitor: WatchMonitorRow, now: Date, reason: string, shouldRefund: boolean) {
  let refunded = false;
  if (shouldRefund && report.intentKey) {
    try {
      await refundCredits({ amount: report.creditCost, reference: `watch:${report.profileUrl}`, intent: report.intentKey, actorAuthUserId: monitor.userId });
      refunded = true;
    } catch {
      // A finalized hold is deliberately not refunded. The report remains an
      // auditable failure and the settlement state is preserved for review.
    }
  }
  await prisma.watchReport.update({
    where: { id: report.id },
    data: { status: "FAILED", lastError: reason, completedAt: now, nextAttemptAt: null, claimToken: null, claimedAt: null },
  });
  await prisma.publicProfileMonitor.update({
    where: { id: monitor.id },
    data: { lastAttemptAt: now, retryCount: report.attemptCount, lastError: reason, nextCaptureAt: new Date(now.getTime() + TERMINAL_RETRY_MS) },
  });
  return { status: "FAILED" as const, reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", refunded, reason };
}

async function executeClaimedReport(report: WatchReportRow, monitor: WatchMonitorRow, now: Date): Promise<ScheduledWatchResult> {
  if (!report.intentKey || !report.captureKey) return terminalFailure(report, monitor, now, "Watch capture identity is incomplete.", false);
  if (!(await stillEnabled(monitor))) return terminalFailure(report, monitor, now, "Watch was paused before capture started.", false);

  const reference = `watch:${report.profileUrl}`;
  try {
    await holdCredits({
      internalWorkspaceId: report.workspaceId,
      amount: report.creditCost,
      reference,
      idempotencyKey: `${report.intentKey}:hold`,
      actorAuthUserId: monitor.userId,
    });
  } catch (error) {
    return terminalFailure(report, monitor, now, error instanceof Error && error.message === "Insufficient credits" ? "Insufficient credits." : "Credit hold unavailable.", false);
  }

  let auditData: NormalizedSocialAuditResult;
  try {
    auditData = await fetchSocialAudit(platform(report.platform) as SocialPlatform, { url: report.profileUrl, limit: monitor.reelLimit });
  } catch (error) {
    const reason = sanitizedWatchError(error);
    if (report.attemptCount < WATCH_MAX_CAPTURE_ATTEMPTS) return scheduleRetry(report, monitor, now, reason);
    return terminalFailure(report, monitor, now, reason, true);
  }

  if (!(await stillEnabled(monitor))) return terminalFailure(report, monitor, now, "Watch was paused before capture completed.", true);

  try {
    await finalizeCredits({ amount: report.creditCost, reference, intent: report.intentKey, actorAuthUserId: monitor.userId });
  } catch {
    // Keep the HOLD in place for a later idempotent settlement retry. A
    // successful provider read must never be silently refunded as if it did
    // not happen.
    return scheduleRetry(report, monitor, now, "Credit settlement unavailable.", WATCH_SETTLEMENT_RECOVERY_MS);
  }

  const metrics = buildPublicSnapshotMetrics(auditData);
  const previous = await prisma.publicProfileSnapshot.findFirst({
    where: { monitorId: monitor.id, captureKey: { not: report.captureKey } },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, followerCount: true, followingCount: true, postCount: true, reelsCollected: true, totalViews: true, medianViews: true, visibleInteractions: true, visibleInteractionRate: true },
  });
  const delta = buildDelta(previous, metrics, now);
  const evidence = watchEvidence({ report, capturedAt: now, auditData, metrics, previous });
  const safeAudit = publicAudit(auditData);
  try {
    await prisma.$transaction([
      prisma.publicProfileSnapshot.upsert({
        where: { captureKey: report.captureKey },
        create: {
          monitorId: monitor.id,
          captureKey: report.captureKey,
          capturedAt: now,
          provider: auditData.profile.provider,
          providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(report.platform, monitor.reelLimit)),
          sourceUrls: evidence.sourceUrls,
          ...metrics,
        },
        update: {
          capturedAt: now,
          provider: auditData.profile.provider,
          providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(report.platform, monitor.reelLimit)),
          sourceUrls: evidence.sourceUrls,
          ...metrics,
        },
      }),
      prisma.watchReport.update({
        where: { id: report.id },
        data: {
          status: "COMPLETED",
          reportJson: { type: "WATCH_CAPTURE", audit: safeAudit, metrics, delta, evidence } as Prisma.InputJsonObject,
          deltaJson: delta as Prisma.InputJsonValue,
          evidenceJson: evidence as unknown as Prisma.InputJsonObject,
          provider: auditData.profile.provider,
          lastError: null,
          completedAt: now,
          nextAttemptAt: null,
          claimToken: null,
          claimedAt: null,
        },
      }),
      prisma.publicProfileMonitor.update({
        where: { id: monitor.id },
        data: {
          provider: auditData.profile.provider,
          providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(report.platform, monitor.reelLimit)),
          lastCapturedAt: now,
          nextCaptureAt: nextCaptureAt(now, normalizeWatchCadence(monitor.cadenceHours) ?? 168),
          lastAttemptAt: now,
          retryCount: 0,
          lastError: null,
        },
      }),
    ]);
  } catch {
    // FINALIZE is already idempotently recorded. Retain the settled hold and
    // retry persistence/reconciliation rather than refunding a successful
    // provider operation or creating a second charge.
    return scheduleRetry(report, monitor, now, "Watch result persistence unavailable.", WATCH_SETTLEMENT_RECOVERY_MS);
  }

  return { status: "COMPLETED", reportExternalId: report.externalId, captureKey: report.captureKey, provider: auditData.profile.provider, delta };
}

export async function processDueWatchCaptures(now = new Date(), limit = 10): Promise<ScheduledWatchSummary> {
  const monitors = await prisma.publicProfileMonitor.findMany({
    where: { enabled: true, nextCaptureAt: { lte: now } },
    orderBy: { nextCaptureAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  const summary: ScheduledWatchSummary = { inspected: monitors.length, completed: 0, retried: 0, failed: 0, skipped: 0 };

  for (const monitor of monitors as WatchMonitorRow[]) {
    try {
      const active = await prisma.watchReport.findFirst({
        where: { monitorId: monitor.id, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
      });
      const report = (active as WatchReportRow | null) ?? await captureReportForMonitor(monitor, now);
      const claimed = await claimReport(report, now);
      if (!claimed) {
        summary.skipped += 1;
        continue;
      }
      const outcome = await executeClaimedReport(claimed, monitor, now);
      if (outcome.status === "COMPLETED") summary.completed += 1;
      else if (outcome.status === "RETRY_SCHEDULED") summary.retried += 1;
      else if (outcome.status === "FAILED") summary.failed += 1;
      else summary.skipped += 1;
    } catch {
      summary.failed += 1;
      await prisma.publicProfileMonitor.update({
        where: { id: monitor.id },
        data: { lastAttemptAt: now, lastError: "Watch worker failed.", nextCaptureAt: new Date(now.getTime() + RETRY_BASE_MS) },
      }).catch(() => undefined);
    }
  }

  return summary;
}
