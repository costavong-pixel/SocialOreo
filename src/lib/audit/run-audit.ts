import { AngleStatus, AuditStatus, Prisma } from "@prisma/client";

import { analyzeAuditWithAi } from "@/lib/analysis/ai-audit-provider";
import type { TrustedAngleContext } from "@/lib/analysis/types";
import { AuditAlreadyRunningError, createRunningAuditJob } from "@/lib/audit/audit-running-guard";
import { enqueueTranscriptEnrichment } from "@/lib/audit/transcript-enrichment";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { evaluateAuditGuards } from "@/lib/audit/audit-guards";
import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import type { CampaignBrief } from "@/lib/campaign-brief/types";
import { resolveAuditTier, type RequestedTier } from "@/lib/credits/audit-tier";
import {
  consumeCreditForAudit,
  InsufficientCreditsError,
  refundAuditCredit,
} from "@/lib/credits/consume-credit";
import {
  claimFreeAuditAllowance,
  FreeAuditAllowanceExhaustedError,
  restoreFreeAuditAllowance,
} from "@/lib/credits/free-audit-allowance";
import { prisma } from "@/lib/db/prisma";
import { estimateSocialAuditCost, socialProviderEndpoint, socialProviderForPlatform } from "@/lib/providers/social/audit-provider-config";
import { fetchSocialAudit } from "@/lib/providers/social/provider-router";
import { SocialProviderError } from "@/lib/providers/social/types";
import { recordAuditPublicSnapshot } from "@/lib/snapshots/public-profile-snapshots";

export type CreateAuditInput = {
  authUserId: string;
  email: string;
  url: string;
  campaignBrief: CampaignBrief;
  requestedTier?: RequestedTier;
};

export type CreateAuditResult =
  | {
      ok: true;
      auditJobId: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      retryAfterSeconds?: number;
    };

async function getActiveTrustedAngles(): Promise<TrustedAngleContext[]> {
  const angles = await prisma.angleLibrary.findMany({
    where: {
      status: AngleStatus.ACTIVE,
      internalOnly: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return angles.map((angle) => ({
    angleName: angle.angleName,
    category: angle.category,
    hookFormula: angle.hookFormula,
    ctaFormula: angle.ctaFormula,
    goalFit: angle.goalFit,
    nicheFit: angle.nicheFit,
    occasionFit: angle.occasionFit,
    tone: angle.tone,
  }));
}

async function logProviderCall(input: {
  auditJobId: string;
  provider: string;
  endpointOrActor: string;
  estimatedCost: number;
  status: string;
  errorMessage?: string;
}) {
  await prisma.providerCallLog.create({
    data: {
      auditJobId: input.auditJobId,
      provider: input.provider,
      endpointOrActor: input.endpointOrActor,
      estimatedCost: new Prisma.Decimal(input.estimatedCost),
      status: input.status,
      errorMessage: input.errorMessage,
    },
  });
}

export async function createAndRunAudit(input: CreateAuditInput): Promise<CreateAuditResult> {
  const user = await syncUserFromAuth0({
    id: input.authUserId,
    email: input.email,
  });
  const isAdmin = await requireAdminByAuthUserId(input.authUserId);

  const auditTier = resolveAuditTier(input.requestedTier);

  const guard = evaluateAuditGuards({
    url: input.url,
    rateLimitKey: `audit:${user.id}`,
    auditTier,
  });

  if (!guard.allowed) {
    return {
      ok: false,
      status: guard.stage === "rate_limit" ? 429 : 400,
      message: guard.message,
      retryAfterSeconds: guard.retryAfterSeconds,
    };
  }

  const provider = socialProviderForPlatform(guard.platform);
  const reelLimit = guard.auditTier.reelLimit;
  const estimatedCost = estimateSocialAuditCost(guard.platform, reelLimit);
  const providerEndpoint = socialProviderEndpoint(guard.platform);

  let auditJob: { id: string };

  try {
    auditJob = await createRunningAuditJob(user.id, (tx) =>
      tx.auditJob.create({
        data: {
          userId: user.id,
          platform: guard.platform,
          provider,
          profileUrl: guard.normalizedUrl,
          status: AuditStatus.RUNNING,
          reelLimit,
          campaignBriefJson: input.campaignBrief,
          providerCostEstimate: new Prisma.Decimal(estimatedCost),
        },
      }),
    );
  } catch (error) {
    if (error instanceof AuditAlreadyRunningError) {
      return {
        ok: false,
        status: 409,
        message: "An audit is already running. Wait for it to finish before starting another.",
      };
    }

    throw error;
  }

  let consumedLedgerEntryId: string | null = null;
  let claimedFreeAllowance = false;
  let socialProviderSucceeded = false;

  try {
    if (guard.auditTier.tier === "paid") {
      const consumption = await consumeCreditForAudit(user.id, guard.auditTier.creditCost, auditJob.id);
      consumedLedgerEntryId = consumption.ledgerEntryId;
    } else if (!isAdmin) {
      await claimFreeAuditAllowance(user.id);
      claimedFreeAllowance = true;
    }
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      await prisma.auditJob.update({
        where: { id: auditJob.id },
        data: {
          status: AuditStatus.FAILED,
          errorMessage: "Insufficient credits for a paid audit.",
          completedAt: new Date(),
        },
      });

      return {
        ok: false,
        status: 402,
        message: "You do not have enough credits for a full audit.",
      };
    }

    if (error instanceof FreeAuditAllowanceExhaustedError) {
      await prisma.auditJob.update({
        where: { id: auditJob.id },
        data: {
          status: AuditStatus.FAILED,
          errorMessage: "Free audit allowance already used.",
          completedAt: new Date(),
        },
      });

      return {
        ok: false,
        status: 402,
        message: "Your free audit has already been used. Choose a full audit to continue.",
      };
    }

    throw error;
  }

  try {
    const auditData = await fetchSocialAudit(guard.platform, {
      url: guard.normalizedUrl,
      limit: reelLimit,
    });

    await logProviderCall({
      auditJobId: auditJob.id,
      provider,
      endpointOrActor: providerEndpoint,
      estimatedCost,
      status: "success",
    });
    socialProviderSucceeded = true;

    await prisma.socialProfile.create({
      data: {
        auditJobId: auditJob.id,
        platform: auditData.profile.platform,
        provider: auditData.profile.provider,
        username: auditData.profile.username,
        displayName: auditData.profile.displayName,
        profileUrl: auditData.profile.profileUrl,
        bio: auditData.profile.bio,
        followerCount: auditData.profile.followerCount,
        followingCount: auditData.profile.followingCount,
        postCount: auditData.profile.postCount,
        profileImageUrl: auditData.profile.profileImageUrl,
        rawProviderPayload: auditData.profile.rawProviderPayload as Prisma.InputJsonValue,
      },
    });

    if (auditData.videos.length > 0) {
      await prisma.socialVideo.createMany({
        data: auditData.videos.map((video) => ({
          auditJobId: auditJob.id,
          platform: video.platform,
          provider: video.provider,
          providerVideoId: video.providerVideoId,
          url: video.url,
          caption: video.caption,
          hashtags: video.hashtags,
          mentions: video.mentions,
          audioName: video.audioName,
          durationSeconds: video.durationSeconds,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          shareCount: video.shareCount,
          saveCount: video.saveCount,
          postedAt: video.postedAt ? new Date(video.postedAt) : null,
          thumbnailUrl: video.thumbnailUrl,
          videoUrlIfAvailable: video.videoUrlIfAvailable,
          transcriptIfAvailable: video.transcriptIfAvailable,
          rawProviderPayload: video.rawProviderPayload as Prisma.InputJsonValue,
        })),
      });
    }

    const trustedAngles = await getActiveTrustedAngles();
    const analysis = await analyzeAuditWithAi({
      campaignBrief: input.campaignBrief,
      auditData,
      trustedAngles,
    });

    await prisma.auditReport.create({
      data: {
        auditJobId: auditJob.id,
        overallScore: analysis.overallScore,
        subScoresJson: analysis.subScores,
        summaryJson: analysis.summary,
        actionPlanJson: analysis.actionPlan,
        contentPackJson: {
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          angleRecommendations: analysis.angleRecommendations,
          readyToPostHooks: analysis.readyToPostHooks,
          readyToPostScripts: analysis.readyToPostScripts,
          ctaOptions: analysis.ctaOptions,
          captionPack: analysis.captionPack,
          hashtagPack: analysis.hashtagPack,
          contentPrescription: analysis.contentPrescription,
        },
      },
    });

    const completedAt = new Date();
    await prisma.auditJob.update({
      where: { id: auditJob.id },
      data: {
        status: AuditStatus.COMPLETED,
        completedAt,
      },
    });

    // Store the completed public audit as a historical baseline. Recurring
    // provider refreshes remain opt-in from the dashboard.
    try {
      await recordAuditPublicSnapshot({
        userId: user.id,
        auditJobId: auditJob.id,
        profileUrl: guard.normalizedUrl,
        platform: guard.platform,
        provider,
        reelLimit,
        capturedAt: completedAt,
        auditData,
      });
    } catch {
      // An audit stays successful when optional historical storage is down.
      // The user can backfill the completed audit from the dashboard later.
    }

    // The separate transcript actor can take minutes for a multi-reel batch.
    // Start it only after the report is complete; its worker updates the same
    // audit later without delaying this customer-facing request.
    try {
      if (guard.platform === "instagram") {
        await enqueueTranscriptEnrichment({ auditJobId: auditJob.id, videos: auditData.videos });
      }
    } catch {
      // Public metadata report remains complete if optional enrichment queueing
      // is unavailable. The failure is recorded by the queue when possible.
    }

    return { ok: true, auditJobId: auditJob.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Audit failed.";

    if (consumedLedgerEntryId) {
      await refundAuditCredit(
        user.id,
        guard.auditTier.creditCost,
        auditJob.id,
        consumedLedgerEntryId,
      );
    }

    if (claimedFreeAllowance) {
      await restoreFreeAuditAllowance(user.id);
    }

    if (socialProviderSucceeded) {
      await logProviderCall({
        auditJobId: auditJob.id,
        provider: "ai",
        endpointOrActor: "audit-analysis",
        estimatedCost: 0,
        status: "failed",
        errorMessage,
      });
    } else {
      await logProviderCall({
        auditJobId: auditJob.id,
        provider,
        endpointOrActor: providerEndpoint,
        estimatedCost,
        status: "failed",
        errorMessage,
      });
    }

    await prisma.auditJob.update({
      where: { id: auditJob.id },
      data: {
        status: AuditStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      },
    });

    if (error instanceof SocialProviderError) {
      return {
        ok: false,
        status: 502,
        message: error.publicMessage,
      };
    }

    return {
      ok: false,
      status: 500,
      message: "We could not complete this audit. Please try again.",
    };
  }
}
