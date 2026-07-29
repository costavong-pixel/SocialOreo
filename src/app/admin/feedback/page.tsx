import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { ProductFrame } from "@/components/layout/product-frame";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function FeedbackInboxPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isAdmin = await requireAdminByAuthUserId(user.id);

  if (!isAdmin) {
    return (
      <ProductFrame backHref="/dashboard" backLabel="Workspace" maxWidth="narrow">
        <section className="so-admin mt-6">
          <div className="mt-10 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-sm md:p-10">
            <h1 className="text-3xl font-black tracking-[-0.04em]">Admin access required</h1>
            <p className="mt-4 text-black/70">The feedback inbox is restricted to SocialOreo admins.</p>
          </div>
        </section>
      </ProductFrame>
    );
  }

  const feedbackEntries = await prisma.auditFeedback.findMany({
    include: {
      auditJob: {
        select: {
          id: true,
          profileUrl: true,
          completedAt: true,
          auditReport: { select: { overallScore: true } },
          user: { select: { email: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const helpfulCount = feedbackEntries.filter((entry) => entry.rating === "HELPFUL").length;
  const notYetCount = feedbackEntries.length - helpfulCount;
  const helpfulRate = feedbackEntries.length ? Math.round((helpfulCount / feedbackEntries.length) * 100) : 0;

  return (
    <ProductFrame backHref="/dashboard" backLabel="Workspace">
      <section className="so-admin">
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Beta feedback</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">Feedback inbox</h1>
            <p className="mt-3 max-w-2xl text-black/65">Review the latest completed-audit responses and use them to prioritize the next report improvement.</p>
          </div>
          <Link className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-black" href="/admin/angle-library">
            Angle Library
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Responses" value={feedbackEntries.length} detail="Most recent 100" />
          <SummaryCard label="Helpful" value={`${helpfulRate}%`} detail={`${helpfulCount} helpful response${helpfulCount === 1 ? "" : "s"}`} />
          <SummaryCard label="Needs work" value={notYetCount} detail="Responses marked not yet" />
        </div>

        <div className="mt-8 grid gap-4">
          {feedbackEntries.length ? feedbackEntries.map((entry) => (
            <article className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm" key={entry.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${entry.rating === "HELPFUL" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                    {entry.rating === "HELPFUL" ? "Helpful" : "Not yet"}
                  </p>
                  <Link className="mt-3 block truncate text-lg font-black hover:underline" href={`/audits/${entry.auditJob.id}`}>
                    {entry.auditJob.profileUrl}
                  </Link>
                  <p className="mt-1 text-sm text-black/55">
                    {entry.auditJob.user?.email ?? "Unknown user"} · Updated {formatDate(entry.updatedAt)} · Score {entry.auditJob.auditReport?.overallScore ?? "—"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-black/55">Audit completed {entry.auditJob.completedAt ? formatDate(entry.auditJob.completedAt) : "—"}</p>
              </div>

              {entry.usefulSections.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.usefulSections.map((section) => <span className="rounded-full bg-black/[0.05] px-3 py-1 text-xs font-semibold text-black/70" key={section}>{section}</span>)}
                </div>
              ) : null}
              {entry.comments ? <p className="mt-4 rounded-xl border border-black/10 bg-black/[0.025] p-4 text-sm leading-6 text-black/75">{entry.comments}</p> : null}
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 p-8 text-center text-black/60">
              No feedback yet. Completed-audit responses will appear here.
            </div>
          )}
        </div>
      </section>
    </ProductFrame>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-black/45">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm text-black/60">{detail}</p>
    </div>
  );
}
