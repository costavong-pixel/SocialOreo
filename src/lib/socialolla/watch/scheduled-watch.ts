import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { socialProviderForPlatform } from "@/lib/providers/social/audit-provider-config";
import { sanitizeSocialAuditResult } from "@/lib/providers/social/sanitize-audit-result";
import type { NormalizedSocialAuditResult, SocialPlatform } from "@/lib/providers/social/types";
import { intentKey, holdCredits, finalizeCredits, refundCredits } from "@/lib/socialolla/credits/batch-service";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { buildPublicSnapshotMetrics } from "@/lib/snapshots/public-profile-snapshots";
import { normalizeWatchCadence, sanitizedWatchError, watchCaptureKey, watchProviderCostEstimate, type WatchCadenceHours } from "@/lib/snapshots/watch-policy";
import { validateSocialUrl } from "@/lib/validators/social-url";
import { watchCompetitorLimitForUser } from "./resolver";

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

class WatchClaimLostError extends Error {
  constructor() {
    super("Watch capture lease was lost.");
    this.name = "WatchClaimLostError";
  }
}

export function assertWatchWorkerStagingRuntime(env: Record<string, string | undefined> = process.env): void {
  const nodeEnvironment = (env.NODE_ENV ?? "").trim().toLowerCase();
  const appEnvironment = (env.SOCIALOLLA_ENV ?? "").trim().toLowerCase();
  if (nodeEnvironment !== "staging" || appEnvironment !== "staging") {
    throw new Error("The Watch worker is staging-only.");
  }
}

export function assertWatchWorkerProviderDisabledRuntime(env: Record<string, string | undefined> = process.env): void {
  assertWatchWorkerStagingRuntime(env);
  if (!providerDisabledEnabled(env)) {
    throw new Error("The Watch worker requires provider-disabled mode.");
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
  const configuredProvider = providerDisabledEnabled() ? "provider-disabled" : socialProviderForPlatform(input.platform);
  const monitorLimit = await watchCompetitorLimitForUser(input.userId);

  const monitor = await prisma.$transaction(async (tx) => {
    const existing = await tx.publicProfileMonitor.findUnique({
      where: { userId_profileUrl: { userId: input.userId, profileUrl: normalizedUrl } },
      select: { id: true, enabled: true },
    });
    if (!existing?.enabled) {
      const activeCount = await tx.publicProfileMonitor.count({
        where: { userId: input.userId, enabled: true, NOT: { profileUrl: normalizedUrl } },
      });
      if (activeCount >= monitorLimit) throw new Error("Watch monitor limit reached for this plan.");
    }
    return tx.publicProfileMonitor.upsert({
      where: { userId_profileUrl: { userId: input.userId, profileUrl: normalizedUrl } },
      create: {
        userId: input.userId,
        profileUrl: normalizedUrl,
        platform: input.platform,
        provider: configuredProvider,
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
        provider: configuredProvider,
        enabled: true,
        cadenceHours,
        providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(input.platform, 30)),
        nextCaptureAt: new Date(),
        lastError: null,
        retryCount: 0,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

async function watchCreditCost(workspaceId: string): Promise<number> {
  const entitlement = await prisma.entitlementSnapshot.findFirst({
    where: { workspaceId },
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
  const cost = await watchCreditCost(workspace.dbId);
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
  if (!current || current.claimToken !== token) return null;
  return current as WatchReportRow;
}

function activeClaimWhere(report: WatchReportRow, now = new Date()) {
  if (!report.claimToken) return null;
  return {
    id: report.id,
    status: "RUNNING" as const,
    claimToken: report.claimToken,
    claimedAt: { gte: new Date(now.getTime() - WATCH_CLAIM_LEASE_MS) },
  };
}

async function renewClaim(report: WatchReportRow): Promise<boolean> {
  const now = new Date();
  const where = activeClaimWhere(report, now);
  if (!where) return false;
  const renewed = await prisma.watchReport.updateMany({ where, data: { claimedAt: now } });
  return renewed.count === 1;
}

function skipped(report: WatchReportRow, reason: string): ScheduledWatchResult {
  return {
    status: "SKIPPED",
    reportExternalId: report.externalId,
    captureKey: report.captureKey ?? "unknown",
    reason,
  };
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

function pendingAudit(reportJson: unknown): NormalizedSocialAuditResult | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const candidate = reportJson as { type?: unknown; audit?: unknown };
  if (candidate.type !== "WATCH_CAPTURE_PENDING") return null;
  if (!candidate.audit || typeof candidate.audit !== "object") return null;
  const audit = candidate.audit as { profile?: unknown; videos?: unknown };
  if (!audit.profile || typeof audit.profile !== "object" || !Array.isArray(audit.videos)) return null;
  return sanitizeSocialAuditResult(candidate.audit as NormalizedSocialAuditResult);
}

async function persistPendingAudit(report: WatchReportRow, auditData: NormalizedSocialAuditResult): Promise<boolean> {
  const where = activeClaimWhere(report);
  if (!where) return false;
  const result = await prisma.watchReport.updateMany({
    where,
    data: { reportJson: { type: "WATCH_CAPTURE_PENDING", audit: auditData } as Prisma.InputJsonObject },
  });
  return result.count === 1;
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
  if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");
  const where = activeClaimWhere(report);
  if (!where) return skipped(report, "Watch capture lease is not held.");
  const released = await prisma.watchReport.updateMany({
    where,
    data: { nextAttemptAt: nextAttempt, lastError: reason, claimToken: null, claimedAt: null },
  });
  if (released.count !== 1) return skipped(report, "Watch capture lease was lost.");
  await prisma.publicProfileMonitor.updateMany({
    where: { id: monitor.id, userId: monitor.userId },
    data: { lastAttemptAt: now, retryCount: report.attemptCount, lastError: reason },
  });
  return { status: "RETRY_SCHEDULED" as const, reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", nextAttemptAt: nextAttempt.toISOString(), reason };
}

async function terminalFailure(report: WatchReportRow, monitor: WatchMonitorRow, now: Date, reason: string, shouldRefund: boolean) {
  if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");
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
  const where = activeClaimWhere(report);
  if (!where) return skipped(report, "Watch capture lease is not held.");
  const failed = await prisma.watchReport.updateMany({
    where,
    data: { status: "FAILED", lastError: reason, completedAt: now, nextAttemptAt: null, claimToken: null, claimedAt: null },
  });
  if (failed.count !== 1) return skipped(report, "Watch capture lease was lost.");
  await prisma.publicProfileMonitor.updateMany({
    where: { id: monitor.id, userId: monitor.userId },
    data: { lastAttemptAt: now, retryCount: report.attemptCount, lastError: reason, nextCaptureAt: new Date(now.getTime() + TERMINAL_RETRY_MS) },
  });
  return { status: "FAILED" as const, reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", refunded, reason };
}

async function executeClaimedReport(report: WatchReportRow, monitor: WatchMonitorRow, now: Date): Promise<ScheduledWatchResult> {
  if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");
  if (!report.intentKey || !report.captureKey) return terminalFailure(report, monitor, now, "Watch capture identity is incomplete.", false);
  const captureKey = report.captureKey;
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

  let auditData = pendingAudit(report.reportJson);
  if (!auditData) {
    try {
      auditData = sanitizeSocialAuditResult(await fetchSocialAudit(platform(report.platform) as SocialPlatform, { url: report.profileUrl, limit: monitor.reelLimit }));
    } catch (error) {
      const reason = sanitizedWatchError(error);
      if (report.attemptCount < WATCH_MAX_CAPTURE_ATTEMPTS) return scheduleRetry(report, monitor, now, reason);
      return terminalFailure(report, monitor, now, reason, true);
    }
    try {
      if (!(await persistPendingAudit(report, auditData))) return skipped(report, "Watch capture lease was lost.");
    } catch {
      return scheduleRetry(report, monitor, now, "Watch result persistence unavailable.");
    }
  }

  if (!(await stillEnabled(monitor))) return terminalFailure(report, monitor, now, "Watch was paused before capture completed.", true);

  if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");

  try {
    await finalizeCredits({ amount: report.creditCost, reference, intent: report.intentKey, actorAuthUserId: monitor.userId });
  } catch (error) {
    // Keep the HOLD in place for a later idempotent settlement retry. A
    // successful provider read must never be silently refunded as if it did
    // not happen.
    return scheduleRetry(report, monitor, now, "Credit settlement unavailable.", WATCH_SETTLEMENT_RECOVERY_MS);
  }

  const metrics = buildPublicSnapshotMetrics(auditData);
  const previous = await prisma.publicProfileSnapshot.findFirst({
    where: { monitorId: monitor.id, captureKey: { not: captureKey } },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, followerCount: true, followingCount: true, postCount: true, reelsCollected: true, totalViews: true, medianViews: true, visibleInteractions: true, visibleInteractionRate: true },
  });
  const delta = buildDelta(previous, metrics, now);
  const evidence = watchEvidence({ report, capturedAt: now, auditData, metrics, previous });
  const safeAudit = sanitizeSocialAuditResult(auditData);
  if (!(await renewClaim(report))) return skipped(report, "Watch capture lease was lost.");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.publicProfileSnapshot.upsert({
        where: { captureKey },
        create: {
          monitorId: monitor.id,
          captureKey,
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
      });
      const reportWhere = activeClaimWhere(report);
      if (!reportWhere) throw new WatchClaimLostError();
      const completed = await tx.watchReport.updateMany({
        where: reportWhere,
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
      });
      if (completed.count !== 1) throw new WatchClaimLostError();
      const monitorUpdated = await tx.publicProfileMonitor.updateMany({
        where: { id: monitor.id, userId: monitor.userId },
        data: {
          provider: auditData.profile.provider,
          providerCostEstimate: new Prisma.Decimal(watchProviderCostEstimate(report.platform, monitor.reelLimit)),
          lastCapturedAt: now,
          nextCaptureAt: nextCaptureAt(now, normalizeWatchCadence(monitor.cadenceHours) ?? 168),
          lastAttemptAt: now,
          retryCount: 0,
          lastError: null,
        },
      });
      if (monitorUpdated.count !== 1) throw new Error("Watch monitor no longer exists.");
    });
  } catch {
    if (await prisma.watchReport.findUnique({ where: { id: report.id } }).then((current) => current?.status === "COMPLETED").catch(() => false)) {
      return { status: "COMPLETED", reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", provider: auditData.profile.provider, delta };
    }
    // FINALIZE is already idempotently recorded. Retain the settled hold and
    // retry persistence/reconciliation rather than refunding a successful
    // provider operation or creating a second charge.
    return scheduleRetry(report, monitor, now, "Watch result persistence unavailable.", WATCH_SETTLEMENT_RECOVERY_MS);
  }

  return { status: "COMPLETED", reportExternalId: report.externalId, captureKey: report.captureKey ?? "unknown", provider: auditData.profile.provider, delta };
}

export async function processDueWatchCaptures(now = new Date(), limit = 10): Promise<ScheduledWatchSummary> {
  const monitors = await prisma.publicProfileMonitor.findMany({
    where: { enabled: true, nextCaptureAt: { lte: now } },
    orderBy: { nextCaptureAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  const summary: ScheduledWatchSummary = { inspected: monitors.length, completed: 0, retried: 0, failed: 0, skipped: 0 };

  for (const monitor of monitors as WatchMonitorRow[]) {
    let claimedReport: WatchReportRow | null = null;
    try {
      const active = await prisma.watchReport.findFirst({
        where: { monitorId: monitor.id, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
      });
      const report = (active as WatchReportRow | null) ?? await captureReportForMonitor(monitor, now);
      claimedReport = await claimReport(report, now);
      if (!claimedReport) {
        summary.skipped += 1;
        continue;
      }
      const outcome = await executeClaimedReport(claimedReport, monitor, now);
      if (outcome.status === "COMPLETED") summary.completed += 1;
      else if (outcome.status === "RETRY_SCHEDULED") summary.retried += 1;
      else if (outcome.status === "FAILED") summary.failed += 1;
      else summary.skipped += 1;
    } catch {
      if (claimedReport) {
        const where = activeClaimWhere(claimedReport);
        const released = where
          ? await prisma.watchReport.updateMany({
            where,
            data: { nextAttemptAt: new Date(now.getTime() + RETRY_BASE_MS), lastError: "Watch worker failed.", claimToken: null, claimedAt: null },
          }).catch(() => ({ count: 0 }))
          : { count: 0 };
        if (released.count === 1) {
          summary.retried += 1;
          await prisma.publicProfileMonitor.updateMany({
            where: { id: monitor.id, userId: monitor.userId },
            data: { lastAttemptAt: now, lastError: "Watch worker failed." },
          }).catch(() => undefined);
        } else {
          summary.skipped += 1;
        }
        continue;
      }
      summary.failed += 1;
      await prisma.publicProfileMonitor.updateMany({
        where: { id: monitor.id, userId: monitor.userId },
        data: { lastAttemptAt: now, lastError: "Watch worker failed.", nextCaptureAt: new Date(now.getTime() + RETRY_BASE_MS) },
      }).catch(() => undefined);
    }
  }

  return summary;
}
