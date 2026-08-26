import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";

import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { ComparisonHookIdeas } from "@/components/report/comparison-hook-ideas";
import { campaignBriefSchema, campaignGoalOptions } from "@/lib/campaign-brief/types";
import { competitorLimitForPlan, selectedCompetitorIdsForPlan } from "@/lib/competitors/entitlements";
import { prisma } from "@/lib/db/prisma";
import { buildCompetitorComparison, type CompetitorReport } from "@/lib/reports/competitor-comparison";
import { buildPublicMetrics } from "@/lib/reports/public-metrics";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ competitor?: string | string[]; competitors?: string | string[] }>;
};

function labelForAudit(audit: { profileUrl: string; socialProfiles: Array<{ username: string | null }> }): string {
  return audit.socialProfiles[0]?.username ? `@${audit.socialProfiles[0].username}` : audit.profileUrl;
}

function campaignGoalForAudit(audit: { campaignBriefJson: unknown }): string | undefined {
  return campaignBriefSchema.safeParse(audit.campaignBriefJson).data?.goal;
}

function campaignBriefForAudit(audit: { campaignBriefJson: unknown }) {
  return campaignBriefSchema.safeParse(audit.campaignBriefJson).data;
}

function labelForGoal(goal: string | undefined): string {
  return campaignGoalOptions.find((option) => option.value === goal)?.label ?? "Not available";
}

function requestedCompetitorIds(searchParams: { competitor?: string | string[]; competitors?: string | string[] }) {
  return [searchParams.competitor, searchParams.competitors]
    .flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((value) => value.split(","));
}

function toCompetitorReport(audit: {
  id: string;
  profileUrl: string;
  socialProfiles: Array<{ username: string | null; followerCount: number | null; displayName: string | null; followingCount: number | null; postCount: number | null; profileImageUrl: string | null }>;
  socialVideos: Array<{ id: string; url: string; caption: string | null; hashtags: string[]; durationSeconds: number | null; viewCount: number | null; likeCount: number | null; commentCount: number | null; shareCount: number | null; saveCount: number | null; postedAt: Date | null; thumbnailUrl: string | null }>;
  auditReport: { overallScore: number } | null;
  campaignBriefJson: unknown;
}): CompetitorReport {
  return {
    id: audit.id,
    label: labelForAudit(audit),
    score: audit.auditReport?.overallScore ?? 0,
    campaignGoal: campaignGoalForAudit(audit),
    targetAudience: campaignBriefForAudit(audit)?.targetAudience,
    offerOrCta: campaignBriefForAudit(audit)?.offerOrCta,
    publicMetrics: buildPublicMetrics(audit.socialProfiles[0], audit.socialVideos),
  };
}

export async function CompetitorComparisonPage({ params, searchParams }: PageProps) {
  const sessionUser = await getAcceptedSessionUser();
  const resolution = await resolveDbUserFromVerifiedSession();
  const { id } = await params;
  const requestedSearchParams = await searchParams;

  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!sessionUser || !resolution) redirect("/auth/login");
  await getOrCreatePersonalWorkspace(resolution.dbId);

  const account = await prisma.user.findUnique({
    where: { id: resolution.dbId },
    select: { accessPlan: true },
  });
  if (!account) redirect("/auth/login");

  const competitorLimit = competitorLimitForPlan(account.accessPlan);

  const audits = await prisma.auditJob.findMany({
    where: {
      userId: resolution.dbId,
      status: "COMPLETED",
      auditReport: { isNot: null },
    },
    include: { auditReport: true, socialProfiles: true, socialVideos: true },
    orderBy: { completedAt: "desc" },
  });
  const current = audits.find((audit) => audit.id === id);

  if (!current) {
    return <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6"><p>Analysis not found.</p></section>;
  }

  const competitors = audits.filter((audit) => audit.id !== id);
  const selected = selectedCompetitorIdsForPlan(requestedCompetitorIds(requestedSearchParams), account.accessPlan)
    .map((competitorId) => competitors.find((audit) => audit.id === competitorId))
    .filter((audit): audit is (typeof competitors)[number] => Boolean(audit));
  const comparisons = selected.map((competitor) => ({
    competitor,
    comparison: buildCompetitorComparison(toCompetitorReport(current), toCompetitorReport(competitor)),
  }));
  const primary = comparisons[0];

  return (
      <section className="mt-6">
        <p className="text-xs font-bold uppercase text-orange-300">Competitor mode</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">Compare saved reports</h1>
        <p className="mt-3 max-w-2xl leading-7 text-white/65">Compare your campaign report with another completed report you own. This page never starts a new scan or uses a credit.</p>

        {competitorLimit === 0 ? (
          <section className="mt-7 rounded-lg border border-orange-300/20 bg-orange-400/[0.06] p-6">
            <h2 className="text-xl font-black">Competitor Board is a paid feature</h2>
            <p className="mt-3 max-w-2xl leading-7 text-orange-50/75">The free trial includes one seven-post audit and its complete report. Lifetime access includes one competitor; Monthly access includes up to three.</p>
            <Link className="mt-5 inline-block rounded-md bg-orange-400 px-5 py-3 text-sm font-bold text-black" href="/pricing">View plans</Link>
          </section>
        ) : competitors.length ? (
          <form className="mt-7 flex flex-col gap-3 rounded-lg border border-white/10 bg-[#101318] p-5 sm:flex-row sm:items-end" method="get">
            <label className="grid flex-1 gap-2 text-sm font-bold" htmlFor="competitor">{`Choose up to ${competitorLimit} saved competitor report${competitorLimit === 1 ? "" : "s"}`}
              <select className="min-h-28 rounded-md border border-white/15 bg-black/20 px-3 py-3 text-white" defaultValue={selected.map((audit) => audit.id)} id="competitor" multiple name="competitor">
                {competitors.map((audit) => <option key={audit.id} value={audit.id}>{labelForAudit(audit)}</option>)}
              </select>
            </label>
            <button className="rounded-md bg-orange-400 px-5 py-3 text-sm font-bold text-black hover:bg-orange-300" type="submit">Compare profiles</button>
          </form>
        ) : (
          <section className="mt-7 rounded-lg border border-dashed border-white/20 bg-white/[0.025] p-6">
            <h2 className="text-xl font-black">Add one saved competitor report first</h2>
            <p className="mt-3 max-w-2xl leading-7 text-white/65">Run a separate profile analysis for a competitor only when you are ready. Once it is complete, return here to compare both reports. SocialOlla will not create that analysis automatically.</p>
            <Link className="mt-5 inline-block rounded-md bg-orange-400 px-5 py-3 text-sm font-bold text-black" href="/analysis/new">Analyze a competitor</Link>
          </section>
        )}

        {comparisons.length ? (
          <div className="mt-7 grid gap-5">
            <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><div><p className="text-xs font-bold uppercase text-white/45">Your report</p><p className="mt-1 text-xl font-black">{labelForAudit(current)}</p><p className="mt-1 text-sm text-white/55">Goal: {labelForGoal(campaignGoalForAudit(current))}</p></div><div className="grid gap-3 sm:grid-cols-2">{selected.map((competitor, index) => <div key={competitor.id}><p className="text-xs font-bold uppercase text-orange-300">Competitor {index + 1}</p><p className="mt-1 text-xl font-black">{labelForAudit(competitor)}</p><p className="mt-1 text-sm text-orange-100/70">Goal: {labelForGoal(campaignGoalForAudit(competitor))}</p></div>)}</div></div>
              <div className="mt-6"><p className="text-sm font-bold text-white">Profile comparison</p><p className="mt-1 text-sm text-white/55">Compare your public sample with up to {competitorLimit} competitor {competitorLimit === 1 ? "sample" : "samples"}. Values are visible public data, not private Instagram Insights.</p><div className="mt-4 overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="border-b border-white/10 text-xs font-bold uppercase tracking-[0.1em] text-white/40"><tr><th className="pb-3 pr-4">Metric</th><th className="pb-3 pr-4 text-white/65">You</th>{selected.map((competitor, index) => <th className="pb-3 pr-4 text-orange-200/70" key={competitor.id}>Competitor {index + 1}</th>)}</tr></thead><tbody>{comparisons[0].comparison.metrics.map((metric, metricIndex) => <tr className="border-b border-white/[0.07] last:border-0" key={metric.label}><td className="py-3 pr-4 font-bold text-white/80">{metric.label}</td><td className="py-3 pr-4 font-black text-white">{metric.yours}</td>{comparisons.map(({ competitor, comparison }) => <td className="py-3 pr-4 font-black text-orange-100" key={`${competitor.id}-${metric.label}`}>{comparison.metrics[metricIndex]?.competitor ?? "--"}</td>)}</tr>)}</tbody></table></div></div>
              {comparisons.some(({ comparison }) => !comparison.scoreIsComparable) ? <p className="mt-4 rounded-md border border-amber-200/20 bg-amber-300/[0.08] p-3 text-sm leading-6 text-amber-50/85">One or more selected reports use a different campaign goal. Their scores are not directly comparable; use the public metrics and reel examples to study patterns instead.</p> : null}
              <p className="mt-4 text-xs leading-5 text-white/45">Public performance is an estimate based on available public data, not private Instagram Insights.</p>
            </section>
            {primary ? <><section className="flex flex-col justify-between gap-4 rounded-lg border border-orange-300/20 bg-orange-400/[0.06] p-5 sm:flex-row sm:items-center sm:p-7"><div><p className="text-xs font-bold uppercase text-orange-200/70">Agency-ready export</p><h2 className="mt-1 text-xl font-black">Share the primary comparison</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-orange-50/70">Download the first selected public snapshot, content-gap tests, and original hook prompts as one branded PDF.</p></div><a className="shrink-0 rounded-md bg-orange-400 px-5 py-3 text-center text-sm font-bold text-black hover:bg-orange-300" href={`/analysis/${current.id}/compare/pdf?competitor=${primary.competitor.id}`}>Download client PDF</a></section>
            {primary.comparison.contentGaps.length ? <section className="rounded-lg border border-cyan-200/20 bg-cyan-300/[0.06] p-5 sm:p-7"><p className="text-xs font-bold uppercase text-cyan-100/70">Primary content gap report</p><h2 className="mt-1 text-2xl font-black">Three patterns to test next</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50/70">These are public-data test ideas from the first selected report, not a claim about private Instagram performance.</p><div className="mt-5 grid gap-3 md:grid-cols-3">{primary.comparison.contentGaps.map((gap) => <article className="rounded-md border border-cyan-100/10 bg-black/10 p-4" key={gap.category}><p className="text-xs font-bold uppercase text-cyan-200/70">{gap.category}</p><h3 className="mt-2 text-lg font-black">{gap.title}</h3><p className="mt-3 text-sm leading-6 text-cyan-50/70">{gap.evidence}</p><p className="mt-4 border-t border-cyan-100/10 pt-3 text-sm font-semibold leading-6 text-cyan-50">Test: {gap.test}</p></article>)}</div></section> : null}
            {primary.comparison.hookExtractions.length ? <ComparisonHookIdeas auditId={current.id} competitorId={primary.competitor.id} extractions={primary.comparison.hookExtractions} /> : null}
            <section className="rounded-lg border border-orange-300/20 bg-orange-400/[0.06] p-5 sm:p-7"><p className="text-xs font-bold uppercase text-orange-200/70">Simple next steps</p><h2 className="mt-1 text-2xl font-black">Pick one thing to try</h2><p className="mt-3 text-sm leading-6 text-orange-50/70">Do not change everything at once. Test one idea in one reel, then compare it with your normal format.</p><ol className="mt-5 grid gap-3">{primary.comparison.studyIdeas.map((idea, index) => <li className="grid grid-cols-[2rem_1fr] gap-3 rounded-md border border-orange-200/10 bg-black/10 p-3 text-sm leading-6 text-orange-50/85" key={idea}><span className="font-black text-orange-300">{String(index + 1).padStart(2, "0")}</span><span>{idea}</span></li>)}</ol></section>
            <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7"><p className="text-xs font-bold uppercase text-white/45">Primary competitor hook examples</p><h2 className="mt-1 text-2xl font-black">Highest public-view reels</h2><div className="mt-5 grid gap-3">{toCompetitorReport(primary.competitor).publicMetrics.topReels.map((reel) => <a className="rounded-md border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/75 hover:border-orange-300/60" href={reel.url} key={reel.id} rel="noreferrer" target="_blank"><span className="block font-bold text-orange-200">{reel.views.toLocaleString()} public views</span>{reel.caption}</a>)}</div></section></> : null}
          </div>
        ) : null}
      </section>
  );
}

/** Compatibility route: historical comparison links resolve into /analysis. */
export default async function LegacyCompetitorComparisonPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const requested = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["competitor", "competitors"] as const) {
    const value = requested[key];
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) query.append(key, entry);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  permanentRedirect(`/analysis/${id}/compare${suffix}`);
}
