import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { holdCredits, finalizeCredits, refundCredits, intentKey, finalizeKey } from "@/lib/socialolla/credits/batch-service";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import { liveSocialAuditRuntimeAllowed, providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { socialProviderForPlatform } from "@/lib/providers/social/audit-provider-config";
import type { NormalizedSocialAuditResult } from "@/lib/providers/social/types";
import { sanitizeSocialAuditResult } from "@/lib/providers/social/sanitize-audit-result";

export interface WatchCostPreview {
  estimatedCredits: number;
  batchAvailable: boolean;
}

export interface WatchRunInput {
  authUserId: string;
  profileUrl: string;
  platform: "instagram" | "tiktok";
  confirmed: boolean;
}

function newWatchReportExternalId(): string {
  return `wpr_${randomBytes(12).toString("base64url")}`;
}

/**
 * Watch customer flow — credit-gated and provider-boundary protected.
 * - exact credit cost preview + explicit confirmation;
 * - HOLD credits, run the guarded provider, FINALIZE on usable success,
 *   REFUND on failure;
 * - persist a WatchReport;
 * - live provider calls remain staging-only and are disabled by default.
 */
export function createWatchService() {
  function safeStoredAnalysis(value: unknown): NormalizedSocialAuditResult | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<NormalizedSocialAuditResult>;
    if (!candidate.profile || !Array.isArray(candidate.videos)) return null;
    return sanitizeSocialAuditResult(candidate as NormalizedSocialAuditResult);
  }

  async function preview(authUserId: string): Promise<WatchCostPreview> {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspaceId: workspace.dbId },
      orderBy: { validFrom: "desc" },
    });
    const estimatedCredits = entitlement?.watchCreditsPerRequest ?? 1;
    const { selectSpendableBatch } = await import("@/lib/socialolla/credits/batch-service");
    const spendable = await selectSpendableBatch(workspace.dbId, estimatedCredits);
    return { estimatedCredits, batchAvailable: spendable !== null };
  }

  async function run(input: WatchRunInput) {
    if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
    if (!providerDisabledEnabled() && !liveSocialAuditRuntimeAllowed()) {
      throw new Error("Live provider calls are disabled outside the exact staging runtime.");
    }

    const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspaceId: workspace.dbId },
      orderBy: { validFrom: "desc" },
    });
    const cost = entitlement?.watchCreditsPerRequest ?? 1;

    const intent = intentKey(workspace.id, `watch:${input.profileUrl}`, "basic-profile-analysis");
    const reference = `watch:${input.profileUrl}`;

    const replay = await prisma.watchReport.findUnique({
      where: { intentKey: intent },
      select: { id: true, externalId: true, status: true, reportJson: true },
    });
    if (replay) {
      const analysis = replay.status === "COMPLETED" ? safeStoredAnalysis(replay.reportJson) : null;
      return {
        reportExternalId: replay.externalId,
        status: replay.status,
        ...(analysis ? { analysis } : {}),
        duplicate: true as const,
      };
    }

    let report: { id: string; externalId: string };
    try {
      report = await prisma.watchReport.create({
        data: {
          externalId: newWatchReportExternalId(),
          intentKey: intent,
          workspaceId: workspace.dbId,
          profileUrl: input.profileUrl,
          platform: input.platform,
          status: "RUNNING",
          provider: providerDisabledEnabled() ? "provider-disabled" : socialProviderForPlatform(input.platform),
          creditCost: cost,
        },
      });
    } catch (error) {
      const isUniqueConflict = error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
      if (!isUniqueConflict) throw error;
      const concurrent = await prisma.watchReport.findUnique({
        where: { intentKey: intent },
        select: { id: true, externalId: true, status: true, reportJson: true },
      });
      if (!concurrent) throw error;
      const analysis = concurrent.status === "COMPLETED" ? safeStoredAnalysis(concurrent.reportJson) : null;
      return {
        reportExternalId: concurrent.externalId,
        status: concurrent.status,
        ...(analysis ? { analysis } : {}),
        duplicate: true as const,
      };
    }

    let holdAcquired = false;
    try {
      // Hold inside the try so any failed report operation can release its hold.
      const hold = await holdCredits({
        internalWorkspaceId: workspace.dbId,
        amount: cost,
        reference,
        idempotencyKey: `${intent}:hold`,
        actorAuthUserId: input.authUserId,
      });
      if (!hold.held) throw new Error("Failed to hold credits");
      // This request owns the newly-created report, so a replayed HOLD from a
      // crashed predecessor must still be settled if this attempt fails.
      holdAcquired = true;

      const analysis = sanitizeSocialAuditResult(await fetchSocialAudit(input.platform, { url: input.profileUrl, limit: 30 }));
      await finalizeCredits({ amount: cost, reference, intent, actorAuthUserId: input.authUserId });
      await prisma.watchReport.update({
        where: { id: report.id },
        data: { status: "COMPLETED", reportJson: analysis as object, completedAt: new Date(), lastError: null },
      });
      return { reportExternalId: report.externalId, status: "COMPLETED", analysis };
    } catch (error) {
      const finalizationState = await Promise.resolve(prisma.creditTransaction.findUnique({ where: { idempotencyKey: finalizeKey(intent) } }))
        .then((transaction) => transaction ? true : false)
        .catch(() => null);
      if (finalizationState === true) {
        // The credit settlement is durable, but the report write failed. Keep
        // the report retryable and never refund a completed settlement.
        await prisma.watchReport.updateMany({
          where: { id: report.id, status: "RUNNING" },
          data: { lastError: "Watch result persistence unavailable." },
        }).catch(() => undefined);
      } else if (finalizationState === false) {
        await prisma.watchReport.updateMany({
          where: { id: report.id, status: "RUNNING" },
          data: { status: "FAILED", completedAt: new Date(), lastError: "Watch capture failed." },
        }).catch(() => undefined);
        if (holdAcquired) await refundCredits({ amount: cost, reference, intent, actorAuthUserId: input.authUserId }).catch(() => undefined);
      }
      throw error;
    }
  }

  async function list(authUserId: string) {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    return prisma.watchReport.findMany({
      where: { workspaceId: workspace.dbId },
      select: {
        id: true,
        externalId: true,
        profileUrl: true,
        platform: true,
        status: true,
        provider: true,
        creditCost: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  return { preview, run, list };
}
