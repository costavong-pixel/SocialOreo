import Link from "next/link";
import { redirect } from "next/navigation";

import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

export const metadata = { title: "Analysis — SocialOlla" };

export default async function AnalysisPage() {
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!resolution) redirect("/auth/login");

  await getOrCreatePersonalWorkspace(resolution.dbId);
  const analyses = await prisma.auditJob.findMany({
    where: { userId: resolution.dbId },
    select: {
      id: true,
      profileUrl: true,
      status: true,
      createdAt: true,
      completedAt: true,
      auditReport: { select: { overallScore: true } },
      socialProfiles: { select: { username: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--social-blue)]">SocialOlla feature</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em]">Profile Analysis</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65">Review your saved public-profile analyses and turn their evidence into your next content move.</p>
        </div>
        <Link className="rounded-full bg-[var(--social-blue)] px-5 py-3 text-center text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/analysis/new">New analysis</Link>
      </div>

      <div className="mt-8 grid gap-3">
        {analyses.length ? analyses.map((analysis) => (
          <Link className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-[var(--social-blue)]" href={`/analysis/${analysis.id}`} key={analysis.id}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="truncate font-bold">{analysis.socialProfiles[0]?.username ? `@${analysis.socialProfiles[0].username}` : analysis.profileUrl}</p>
                <p className="mt-1 truncate text-sm text-white/55">{analysis.profileUrl}</p>
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-white/45">{analysis.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/60">
              <span>Score: {analysis.auditReport?.overallScore ?? "—"}</span>
              <span>{analysis.completedAt ? `Completed ${analysis.completedAt.toLocaleDateString()}` : `Started ${analysis.createdAt.toLocaleDateString()}`}</span>
            </div>
          </Link>
        )) : (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-8">
            <h2 className="font-display text-xl font-extrabold">No analyses yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">Start with a public Instagram or TikTok profile to create your first SocialOlla Profile Analysis.</p>
            <Link className="mt-5 inline-flex rounded-full border border-white/20 px-4 py-2 text-sm font-bold hover:border-[var(--social-blue)]" href="/analysis/new">Create your first analysis</Link>
          </div>
        )}
      </div>
    </section>
  );
}
