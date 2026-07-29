import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { toPublicSocialProfile } from "@/lib/providers/social/public-profile";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;

  const auditJob = await prisma.auditJob.findUnique({
    where: { id },
    include: {
      user: true,
      socialProfiles: true,
      socialVideos: {
        orderBy: { postedAt: "desc" },
        take: 30,
      },
      auditReport: true,
      feedback: true,
    },
  });

  if (!auditJob || auditJob.user?.authUserId !== user.id) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: auditJob.id,
    status: auditJob.status,
    platform: auditJob.platform,
    profileUrl: auditJob.profileUrl,
    reelLimit: auditJob.reelLimit,
    campaignBrief: auditJob.campaignBriefJson,
    errorMessage: auditJob.errorMessage,
    createdAt: auditJob.createdAt,
    completedAt: auditJob.completedAt,
    profile: toPublicSocialProfile(auditJob.socialProfiles[0]),
    videoCount: auditJob.socialVideos.length,
    feedback: auditJob.feedback
      ? {
          rating: auditJob.feedback.rating,
          usefulSections: auditJob.feedback.usefulSections,
          comments: auditJob.feedback.comments,
          updatedAt: auditJob.feedback.updatedAt,
        }
      : null,
    report: auditJob.auditReport
      ? {
          overallScore: auditJob.auditReport.overallScore,
          subScores: auditJob.auditReport.subScoresJson,
          summary: auditJob.auditReport.summaryJson,
          actionPlan: auditJob.auditReport.actionPlanJson,
          contentPack: auditJob.auditReport.contentPackJson,
        }
      : null,
  });
}
