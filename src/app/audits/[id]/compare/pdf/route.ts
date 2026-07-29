import { getSessionUser } from "@/lib/auth/current-user";
import { campaignBriefSchema, campaignGoalOptions } from "@/lib/campaign-brief/types";
import { prisma } from "@/lib/db/prisma";
import { buildCompetitorComparison, type CompetitorReport } from "@/lib/reports/competitor-comparison";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";
import { renderCompetitorComparisonPdf } from "@/lib/reports/render-competitor-comparison-pdf";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function reportLabel(audit: { profileUrl: string; socialProfiles: Array<{ username: string | null }> }): string {
  return audit.socialProfiles[0]?.username ? `@${audit.socialProfiles[0].username}` : audit.profileUrl;
}

function reportGoal(audit: { campaignBriefJson: unknown }): string | undefined {
  return campaignBriefSchema.safeParse(audit.campaignBriefJson).data?.goal;
}

function goalLabel(goal: string | undefined): string {
  return campaignGoalOptions.find((option) => option.value === goal)?.label ?? "Not available";
}

function toCompetitorReport(audit: {
  id: string;
  profileUrl: string;
  campaignBriefJson: unknown;
  socialProfiles: Array<{ username: string | null; followerCount: number | null; displayName: string | null; followingCount: number | null; postCount: number | null; profileImageUrl: string | null }>;
  socialVideos: Array<{ id: string; url: string; caption: string | null; hashtags: string[]; durationSeconds: number | null; viewCount: number | null; likeCount: number | null; commentCount: number | null; shareCount: number | null; saveCount: number | null; postedAt: Date | null; thumbnailUrl: string | null }>;
  auditReport: { overallScore: number } | null;
}): CompetitorReport {
  const brief = campaignBriefSchema.safeParse(audit.campaignBriefJson).data;
  return {
    id: audit.id,
    label: reportLabel(audit),
    score: audit.auditReport?.overallScore ?? 0,
    campaignGoal: brief?.goal,
    targetAudience: brief?.targetAudience,
    offerOrCta: brief?.offerOrCta,
    publicMetrics: buildPublicMetrics(audit.socialProfiles[0], audit.socialVideos),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  const { id } = await context.params;
  const competitorId = new URL(request.url).searchParams.get("competitor");
  if (!user) return new Response("Authentication required.", { status: 401 });
  if (!competitorId) return new Response("Choose a competitor report.", { status: 400 });

  const audits = await prisma.auditJob.findMany({
    where: { user: { authUserId: user.id }, status: "COMPLETED", auditReport: { isNot: null } },
    include: { auditReport: true, socialProfiles: true, socialVideos: true },
  });
  const current = audits.find((audit) => audit.id === id);
  const competitor = audits.find((audit) => audit.id === competitorId && audit.id !== id);
  if (!current || !competitor) return new Response("Report not found.", { status: 404 });

  const currentReport = toCompetitorReport(current);
  const competitorReport = toCompetitorReport(competitor);
  const pdf = await renderCompetitorComparisonPdf({
    yourLabel: currentReport.label,
    competitorLabel: competitorReport.label,
    yourGoal: goalLabel(currentReport.campaignGoal),
    competitorGoal: goalLabel(competitorReport.campaignGoal),
    comparison: buildCompetitorComparison(currentReport, competitorReport),
  });

  return new Response(new Uint8Array(pdf), { headers: { "Content-Disposition": `attachment; filename="socialoreo-comparison-${id}-vs-${competitorId}.pdf"`, "Content-Type": "application/pdf" } });
}
