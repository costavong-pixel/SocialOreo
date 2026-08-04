import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { holdCredits, finalizeCredits, refundCredits, intentKey } from "@/lib/socialolla/credits/batch-service";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import { assertProviderDisabledMode } from "@/lib/providers/social/provider-guard";

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
 * Watch customer flow (Slice D) — credit-gated and provider-disabled.
 * - exact credit cost preview + explicit confirmation;
 * - HOLD credits, run the provider-disabled fixture, FINALIZE on usable
 *   success, REFUND on failure;
 * - persist a WatchReport;
 * - the live worker stays unwired and the provider chokepoint refuses live
 *   calls unless provider-disabled mode.
 */
export function createWatchService() {
  async function preview(authUserId: string): Promise<WatchCostPreview> {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId: authUserId } },
      orderBy: { validFrom: "desc" },
    });
    const estimatedCredits = entitlement?.watchCreditsPerRequest ?? 1;
    const { selectSpendableBatch } = await import("@/lib/socialolla/credits/batch-service");
    const spendable = await selectSpendableBatch(workspace.dbId, estimatedCredits);
    return { estimatedCredits, batchAvailable: spendable !== null };
  }

  async function run(input: WatchRunInput) {
    if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
    assertProviderDisabledMode();

    const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId: input.authUserId } },
      orderBy: { validFrom: "desc" },
    });
    const cost = entitlement?.watchCreditsPerRequest ?? 1;

    const intent = intentKey(workspace.id, `watch:${input.profileUrl}`, "basic-profile-analysis");
    const reference = `watch:${input.profileUrl}`;
    const hold = await holdCredits({
      internalWorkspaceId: workspace.dbId,
      amount: cost,
      reference,
      idempotencyKey: `${intent}:hold`,
      actorAuthUserId: input.authUserId,
    });
    if (!hold.held) throw new Error("Failed to hold credits");

    const report = await prisma.watchReport.create({
      data: {
        externalId: newWatchReportExternalId(),
        workspaceId: workspace.dbId,
        profileUrl: input.profileUrl,
        platform: input.platform,
        status: "RUNNING",
        provider: "provider-disabled",
        creditCost: cost,
      },
    });

    try {
      const analysis = await fetchSocialAudit(input.platform, { url: input.profileUrl, limit: 30 });
      await prisma.watchReport.update({
        where: { id: report.id },
        data: { status: "COMPLETED", reportJson: analysis as object, completedAt: new Date() },
      });
      await finalizeCredits({ amount: cost, reference, intent, actorAuthUserId: input.authUserId });
      return { reportExternalId: report.externalId, status: "COMPLETED", analysis };
    } catch (error) {
      await prisma.watchReport.update({
        where: { id: report.id },
        data: { status: "FAILED", completedAt: new Date() },
      });
      await refundCredits({ amount: cost, reference, intent, actorAuthUserId: input.authUserId });
      throw error;
    }
  }

  async function list(authUserId: string) {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    return prisma.watchReport.findMany({
      where: { workspaceId: workspace.dbId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  return { preview, run, list };
}
