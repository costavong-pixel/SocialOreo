import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";
import { renderAuditReportPdf } from "@/lib/reports/render-audit-report-pdf";

export const runtime = "nodejs";

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

  const pdf = await renderAuditReportPdf({
    profileUrl: auditJob.profileUrl,
    videoCount: auditJob.socialVideos.length,
    transcriptEnrichmentStatus: auditJob.transcriptEnrichment?.status,
    publicMetrics: buildPublicMetrics(auditJob.socialProfiles[0], auditJob.socialVideos),
    overallScore: auditJob.auditReport.overallScore,
    summary: auditJob.auditReport.summaryJson as { headline?: string; diagnosis?: string },
    actionPlan: auditJob.auditReport.actionPlanJson as string[],
    contentPack: auditJob.auditReport.contentPackJson as {
      strengths?: string[];
      weaknesses?: string[];
      readyToPostHooks?: string[];
      readyToPostScripts?: string[];
      ctaOptions?: string[];
      captionPack?: string[];
      hashtagPack?: string[];
      contentPrescription?: Array<{ title: string; evidence: string; topic: string; hook: string; first3Seconds: string; shotsOrBeats: string[]; captionDirection: string; cta: string; testSignal: string }>;
    },
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Disposition": `attachment; filename="socialolla-report-${id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
