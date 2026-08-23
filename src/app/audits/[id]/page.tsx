import { permanentRedirect, redirect } from "next/navigation";

import { AuditFeedbackCard } from "@/components/report/audit-feedback-card";
import { AuditReportView, type AuditReportViewModel } from "@/components/report/audit-report-view";
import { TranscriptEnrichmentRefresh } from "@/components/report/transcript-enrichment-refresh";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

type PageProps = {
  params: Promise<{ id: string }>;
};

/** Canonical SocialOlla Profile Analysis report surface. */
export async function AuditReportPage({ params }: PageProps) {
  const sessionUser = await getVerifiedSessionUser();
  const resolution = await resolveDbUserFromVerifiedSession();
  const { id } = await params;

  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!sessionUser || !resolution) redirect("/auth/login");

  await getOrCreatePersonalWorkspace(resolution.dbId);

  const auditJob = await prisma.auditJob.findUnique({
    where: { id, userId: resolution.dbId },
    include: {
      auditReport: true,
      feedback: true,
      transcriptEnrichment: true,
      socialProfiles: true,
      socialVideos: true,
    },
  });

  if (!auditJob) {
    return (
      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-10">
        <h1 className="font-display text-3xl font-black">Analysis not found</h1>
        <p className="mt-4 text-white/70">This analysis does not exist or you do not have access.</p>
      </section>
    );
  }

  const report = auditJob.auditReport;
  const contentPack = (report?.contentPackJson ?? {}) as {
    strengths?: string[];
    weaknesses?: string[];
    angleRecommendations?: Array<{ angleName: string; reason: string; hook: string }>;
    readyToPostHooks?: string[];
    readyToPostScripts?: string[];
    ctaOptions?: string[];
    captionPack?: string[];
    hashtagPack?: string[];
    contentPrescription?: Array<{ title: string; evidence: string; topic: string; hook: string; first3Seconds: string; shotsOrBeats: string[]; captionDirection: string; cta: string; testSignal: string }>;
  };

  const audit: AuditReportViewModel = {
    id: auditJob.id,
    status: auditJob.status,
    profileUrl: auditJob.profileUrl,
    videoCount: auditJob.socialVideos.length,
    errorMessage: auditJob.errorMessage,
    transcriptEnrichmentStatus: auditJob.transcriptEnrichment?.status,
    publicMetrics: buildPublicMetrics(auditJob.socialProfiles[0], auditJob.socialVideos),
    report: report
      ? {
          overallScore: report.overallScore,
          subScores: report.subScoresJson as Record<string, number>,
          summary: report.summaryJson as { headline?: string; diagnosis?: string },
          actionPlan: report.actionPlanJson as string[],
          contentPack,
        }
      : null,
  };

  return (
    <section className="mt-6">
      <div>
        <TranscriptEnrichmentRefresh status={auditJob.transcriptEnrichment?.status} />
        <AuditReportView audit={audit} />
        {auditJob.status === "COMPLETED" && report ? (
          <div className="mt-5">
            <AuditFeedbackCard
              auditId={auditJob.id}
              initialFeedback={auditJob.feedback ? {
                rating: auditJob.feedback.rating,
                usefulSections: auditJob.feedback.usefulSections,
                comments: auditJob.feedback.comments,
              } : null}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Compatibility route: historical audit links resolve into /analysis/[id]. */
export default async function LegacyAuditReportPage({ params }: PageProps) {
  const { id } = await params;
  permanentRedirect(`/analysis/${id}`);
}
