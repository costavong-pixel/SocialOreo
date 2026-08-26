import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { renderAuditReportHtml } from "@/lib/reports/render-audit-report-html";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const resolution = await resolveDbUserFromVerifiedSession();
  const { id } = await context.params;

  if (hasDbSessionIdentityConflict(resolution)) {
    return new Response("Account identity conflict.", { status: 409 });
  }
  if (!resolution) {
    return new Response("Authentication required.", { status: 401 });
  }

  const auditJob = await prisma.auditJob.findUnique({
    where: { id, userId: resolution.dbId },
    include: {
      auditReport: true,
      transcriptEnrichment: true,
      socialProfiles: true,
      socialVideos: true,
    },
  });

  if (!auditJob || !auditJob.auditReport) {
    return new Response("Report not found.", { status: 404 });
  }

  const html = renderAuditReportHtml({
    profileUrl: auditJob.profileUrl,
    videoCount: auditJob.socialVideos.length,
    transcriptEnrichmentStatus: auditJob.transcriptEnrichment?.status,
    publicMetrics: buildPublicMetrics(auditJob.socialProfiles[0], auditJob.socialVideos),
    overallScore: auditJob.auditReport.overallScore,
    subScores: auditJob.auditReport.subScoresJson as Record<string, number>,
    summary: auditJob.auditReport.summaryJson as { headline?: string; diagnosis?: string },
    actionPlan: auditJob.auditReport.actionPlanJson as string[],
    contentPack: auditJob.auditReport.contentPackJson as {
      strengths?: string[];
      weaknesses?: string[];
      angleRecommendations?: Array<{ angleName: string; reason: string; hook: string }>;
      readyToPostHooks?: string[];
      readyToPostScripts?: string[];
      ctaOptions?: string[];
      captionPack?: string[];
      hashtagPack?: string[];
      contentPrescription?: Array<{ title: string; evidence: string; topic: string; hook: string; first3Seconds: string; shotsOrBeats: string[]; captionDirection: string; cta: string; testSignal: string }>;
    },
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
