import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendScanStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { competitorLimitForPlan } from "@/lib/competitors/entitlements";
import { prisma } from "@/lib/db/prisma";
import { buildPublicMetrics, type PerformancePattern, type PublicPerformanceMap, type PublicReelEvidence } from "@/lib/reports/public-metrics";
import { INSTAGRAM_TREND_ESTIMATED_COST_USD, isInstagramTrendPilotEnabled } from "@/lib/trends/instagram-trend-provider";
import { buildTrendMovementReadiness } from "@/lib/trends/movement";
import { buildCrossPlatformOpportunities } from "@/lib/trends/opportunities";
import { TIKTOK_TREND_ESTIMATED_COST_USD, isTikTokTrendPilotEnabled } from "@/lib/trends/tiktok-trend-provider";
import { isYouTubeTrendPilotEnabled, youtubeTrendPilotLabel } from "@/lib/trends/youtube-trend-provider";
import { getInstagramInsightsConfig } from "@/lib/instagram-insights/config";
import { addCompetitorToBoard, addTrendWatchlist, pausePublicSnapshotHistory, removeCompetitorFromBoard, removeTrendWatchlist, startInstagramTrendScan, startPublicSnapshotHistory, startTikTokTrendScan, startYouTubeTrendScan } from "./actions";

type ContentPack = {
  strengths?: string[];
  weaknesses?: string[];
  readyToPostHooks?: string[];
  ctaOptions?: string[];
  contentPrescription?: Array<{
    title: string;
    hook: string;
    first3Seconds?: string;
    cta?: string;
  }>;
};

function compact(value: number | undefined | null) {
  return value === undefined || value === null
    ? "--"
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function percent(value: number | undefined | null) {
  return value === undefined || value === null
    ? "--"
    : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function initials(value?: string | null) {
  return value?.slice(0, 1).toUpperCase() ?? "R";
}

function cleanScoreLabel(label: string) {
  return label.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function recommendationTone(recommendation: PublicReelEvidence["recommendation"]) {
  if (recommendation === "KEEP") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-200";
  if (recommendation === "STOP") return "border-rose-300/30 bg-rose-400/10 text-rose-200";
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
}

export default async function DashboardPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/auth/login");

  const isAdmin = await requireAdminByAuthUserId(sessionUser.id);
  const account = await prisma.user.findUnique({
    where: { authUserId: sessionUser.id },
    select: { id: true, accessPlan: true },
  });
  const competitorLimit = account ? competitorLimitForPlan(account.accessPlan) : 0;

  const audits = account ? await prisma.auditJob.findMany({
    where: { userId: account.id, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    include: {
      auditReport: {
        select: {
          overallScore: true,
          subScoresJson: true,
          summaryJson: true,
          actionPlanJson: true,
          contentPackJson: true,
        },
      },
      socialProfiles: {
        select: {
          username: true,
          displayName: true,
          profileUrl: true,
          followerCount: true,
          followingCount: true,
          postCount: true,
          profileImageUrl: true,
        },
      },
      socialVideos: {
        select: {
          id: true,
          url: true,
          caption: true,
          hashtags: true,
          durationSeconds: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          shareCount: true,
          saveCount: true,
          postedAt: true,
          thumbnailUrl: true,
          audioName: true,
          transcriptIfAvailable: true,
        },
      },
      transcriptEnrichment: { select: { status: true } },
    },
  }) : [];

  const boardEntries = account && competitorLimit > 0 ? await prisma.competitorBoardEntry.findMany({
    where: { userId: account.id },
    orderBy: { createdAt: "desc" },
    take: competitorLimit,
    include: {
      auditJob: {
        select: {
          id: true,
          profileUrl: true,
          auditReport: { select: { overallScore: true } },
          socialProfiles: { select: { username: true, profileImageUrl: true } },
          socialVideos: { select: { viewCount: true, likeCount: true, commentCount: true, shareCount: true, saveCount: true } },
        },
      },
    },
  }) : [];

  const latest = audits[0];
  const profile = latest?.socialProfiles[0];
  const historyMonitor = account && latest ? await prisma.publicProfileMonitor.findUnique({
    where: { userId_profileUrl: { userId: account.id, profileUrl: latest.profileUrl } },
    select: {
      id: true,
      enabled: true,
      cadenceHours: true,
      lastCapturedAt: true,
      nextCaptureAt: true,
      lastError: true,
      snapshots: {
        orderBy: { capturedAt: "asc" },
        take: 18,
        select: {
          id: true,
          capturedAt: true,
          followerCount: true,
          reelsCollected: true,
          totalViews: true,
          medianViews: true,
          visibleInteractionRate: true,
        },
      },
    },
  }) : null;
  const instagramInsights = account ? await prisma.instagramInsightsConnection.findUnique({
    where: { userId: account.id },
    select: {
      username: true,
      accountType: true,
      status: true,
      lastSyncedAt: true,
      lastError: true,
      snapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { accountReach: true, accountViews: true, profileViews: true, totalInteractions: true, followerCount: true, fetchedAt: true },
      },
    },
  }) : null;
  const trendWatchlists = account ? await prisma.trendWatchlist.findMany({
    where: { userId: account.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      platform: true,
      sourceType: true,
      query: true,
      scans: { orderBy: { requestedAt: "desc" }, take: 1, select: { status: true, completedAt: true, resultCount: true } },
    },
  }) : [];
  const recentTrendScans = account ? await prisma.trendScan.findMany({
    where: { status: TrendScanStatus.COMPLETED, watchlist: { userId: account.id } },
    orderBy: { completedAt: "desc" },
    take: 3,
    select: {
      id: true,
      platform: true,
      sourceType: true,
      query: true,
      completedAt: true,
      resultCount: true,
      videos: {
        orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
        take: 3,
        select: {
          id: true,
          sourceUrl: true,
          creatorHandle: true,
          caption: true,
          hashtags: true,
          postedAt: true,
          viewCount: true,
          visibleInteractionRate: true,
        },
      },
    },
  }) : [];
  const trendMovementSources = account ? await prisma.trendWatchlist.findMany({
    where: { userId: account.id },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: {
      id: true,
      platform: true,
      sourceType: true,
      query: true,
      scans: {
        where: { status: TrendScanStatus.COMPLETED },
        orderBy: { completedAt: "asc" },
        take: 12,
        select: {
          completedAt: true,
          videos: { select: { sourceUrl: true } },
        },
      },
    },
  }) : [];
  const metrics = latest ? buildPublicMetrics(profile, latest.socialVideos) : null;
  const report = latest?.auditReport;
  const summary = (report?.summaryJson ?? {}) as { headline?: string; diagnosis?: string };
  const actions = (report?.actionPlanJson ?? []) as string[];
  const contentPack = (report?.contentPackJson ?? {}) as ContentPack;
  const scoreRows = Object.entries((report?.subScoresJson ?? {}) as Record<string, number>)
    .map(([label, score]) => ({ label: cleanScoreLabel(label), score: Math.max(0, Math.min(100, score)) }))
    .sort((a, b) => b.score - a.score);
  const reelEvidence = metrics?.reelEvidence ?? [];
  const highestViews = Math.max(1, ...reelEvidence.map((reel) => reel.views ?? 0));
  const keepCount = reelEvidence.filter((reel) => reel.recommendation === "KEEP").length;
  const changeCount = reelEvidence.filter((reel) => reel.recommendation === "CHANGE").length;
  const stopCount = reelEvidence.filter((reel) => reel.recommendation === "STOP").length;
  const intelligence = metrics?.contentIntelligence;
  const boardAuditIds = new Set(boardEntries.map((entry) => entry.auditJobId));
  const board = boardEntries.filter((entry) => entry.auditJob.id !== latest?.id);
  const availableCompetitors = audits.filter((audit) => audit.id !== latest?.id && !boardAuditIds.has(audit.id));

  return (
    <main className="social-orange-dashboard min-h-[100dvh] bg-[var(--social-ink)] text-[#f6f4ef]">
      <div className="mx-auto max-w-[1540px] px-4 py-4 lg:px-6">
        <header className="flex items-center justify-between border-b border-white/10 pb-4">
          <Link href="/dashboard" className="font-display text-xl font-extrabold tracking-[-0.04em] sm:text-2xl">
            Social<span className="text-[var(--social-lime)]">Oreo</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-bold uppercase tracking-[0.14em] text-white/35 sm:block">Public-data workspace</span>
            <Link href="/audits/new" className="rounded-lg bg-[var(--social-lime)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] transition hover:bg-white">New audit</Link>
            <a href="/auth/logout" className="hidden text-sm font-semibold text-white/55 hover:text-white lg:block">Sign out</a>
          </div>
        </header>

        <div className="grid gap-5 py-5 lg:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-white/10 bg-[#101a32] p-3 lg:min-h-[1040px]">
            <p className="px-3 pb-3 pt-1 text-xs font-bold uppercase tracking-[0.16em] text-white/35">Workspace</p>
            <nav className="grid gap-1 text-sm font-semibold">
              <Link href="/dashboard" className="rounded-lg bg-[var(--social-blue)]/35 px-3 py-2.5 text-[var(--social-lime)]">Overview</Link>
              <Link href="/audits/new" className="rounded-lg px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white">Run audit</Link>
              {latest ? <Link href={`/audits/${latest.id}`} className="rounded-lg px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white">Profile report</Link> : null}
              {latest ? <Link href={`/audits/${latest.id}/compare`} className="rounded-lg px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white">Competitor compare</Link> : null}
              {isAdmin ? <Link href="/admin/angle-library" className="rounded-lg px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white">Hook library</Link> : null}
              <Link href="/admin/feedback" className="rounded-lg px-3 py-2.5 text-white/60 hover:bg-white/5 hover:text-white">Feedback</Link>
            </nav>
            <div className="mt-8 rounded-lg border border-[var(--social-lime)]/25 bg-[var(--social-lime)]/[0.08] p-3">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--social-lime)]">SocialOreo advantage</p>
              <p className="mt-2 text-sm leading-5 text-white/65">Real reel evidence, spoken hooks, and a post queue - not invented private metrics.</p>
            </div>
          </aside>

          {latest && metrics && report ? (
            <section className="min-w-0">
              <section className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                  <Link href={`/audits/${latest.id}`} className="flex min-w-0 items-center gap-4 rounded-lg pr-3 transition hover:bg-white/5">
                    <div className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-orange-400/70 bg-white/10 text-xl font-black text-orange-200" style={profile?.profileImageUrl ? { backgroundImage: `url(${profile.profileImageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
                      {profile?.profileImageUrl ? null : initials(profile?.username)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-black">{profile?.username ? `@${profile.username}` : "Latest audit"}</p>
                      <p className="mt-1 truncate text-sm text-white/50">{profile?.displayName ?? latest.profileUrl}</p>
                      <p className="mt-1 text-xs font-bold text-orange-300">Open profile report -&gt;</p>
                    </div>
                  </Link>
                  <div className="grid grid-cols-3 divide-x divide-white/10 rounded-lg border border-white/10 bg-black/15 text-center">
                    <ProfileStat label="Followers" value={compact(profile?.followerCount)} />
                    <ProfileStat label="Following" value={compact(profile?.followingCount)} />
                    <ProfileStat label="Posts" value={compact(profile?.postCount)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile?.profileUrl ? <a href={profile.profileUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-orange-300/35 px-3 py-2 text-sm font-bold text-orange-200 hover:border-orange-300 hover:text-white">View Instagram</a> : null}
                    <Link href={`/audits/${latest.id}`} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold text-white/80 hover:border-orange-300 hover:text-white">Full report</Link>
                  </div>
                </div>
              </section>

              <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Campaign score" value={`${report.overallScore}/100`} note="Content readiness" accent />
                <Metric label="Reels reviewed" value={latest.socialVideos.length} note="Public sample" />
                <Metric label="Total views" value={compact(metrics.summary.totalViews)} note="Public reel views" />
                <Metric label="Median views" value={compact(metrics.summary.medianViews)} note="Typical reel" />
                <Metric label="Engagement / view" value={percent(metrics.summary.engagementPerView)} note="Public interaction proxy" />
              </section>

              <InstagramInsightsPanel configured={Boolean(getInstagramInsightsConfig())} connection={instagramInsights} />

              <ObservedHistory auditId={latest.id} monitor={historyMonitor} />

              <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
                <article className="min-w-0 rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">Campaign diagnosis</p>
                  <h1 className="mt-2 max-w-3xl text-2xl font-black tracking-[-0.035em] sm:text-3xl">{summary.headline ?? "Your latest content diagnosis"}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{summary.diagnosis ?? "Open the full report for the complete evidence and content plan."}</p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    {actions.slice(0, 3).map((action, index) => <div className="rounded-lg border border-orange-300/15 bg-orange-400/[0.06] p-3" key={action}><p className="text-xs font-black text-orange-300">0{index + 1}</p><p className="mt-1 text-sm leading-5 text-white/80">{action}</p></div>)}
                  </div>
                </article>
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Decision mix</p><h2 className="mt-1 text-lg font-black">Keep, change, stop</h2></div><Link href={`/audits/${latest.id}`} className="text-sm font-bold text-orange-300 hover:text-orange-200">All evidence -&gt;</Link></div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <DecisionStat label="Keep" value={keepCount} tone="text-emerald-200" />
                    <DecisionStat label="Change" value={changeCount} tone="text-amber-100" />
                    <DecisionStat label="Stop" value={stopCount} tone="text-rose-200" />
                  </div>
                  <div className="mt-5 grid gap-3">
                    {scoreRows.map((row) => <ScoreBar key={row.label} label={row.label} score={row.score} />)}
                  </div>
                </article>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Public-view distribution</p><h2 className="mt-1 text-lg font-black">Where the sample clusters</h2></div><span className="text-xs text-white/40">{metrics.summary.reelsWithViews} visible reels</span></div>
                  <ViewDistribution bins={metrics.viewDistribution} />
                  <p className="mt-4 text-xs leading-5 text-white/40">Bins use visible public reel views only; they are not reach or impressions.</p>
                </article>
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Next posts</p>
                  <h2 className="mt-1 text-lg font-black">Your content queue</h2>
                  <div className="mt-4 grid gap-2">
                    {(contentPack.contentPrescription ?? []).slice(0, 3).map((post, index) => <div key={`${post.title}-${index}`} className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><p className="text-xs font-black text-orange-300">POST 0{index + 1}</p><p className="mt-1 font-bold text-white">{post.title}</p><p className="mt-2 line-clamp-2 text-sm leading-5 text-white/55">{post.hook}</p></div>)}
                  </div>
                  <Link href={`/audits/${latest.id}`} className="mt-4 inline-flex text-sm font-bold text-orange-300 hover:text-orange-200">Open the post briefs -&gt;</Link>
                </article>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-2">
                <PerformanceMap map={metrics.performanceMap} />
                <article className="min-w-0 rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Read the map</p>
                  <h2 className="mt-1 text-lg font-black">Find the reels worth studying</h2>
                  <p className="mt-3 text-sm leading-6 text-white/60">Start with the upper-right reels: they are above this sample&apos;s median for both public views and visible interaction rate. Then use the source links to study the opening, topic, and CTA before adapting the next post.</p>
                  <div className="mt-5 grid gap-2">
                    {reelEvidence.filter((reel) => reel.recommendation === "KEEP").slice(0, 3).map((reel) => <a href={reel.url} key={reel.id} rel="noreferrer" target="_blank" className="min-w-0 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.055] p-3 hover:border-emerald-300/40"><div className="flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 flex-1 truncate text-sm font-bold text-white/85">{reel.caption}</p><span className="shrink-0 text-xs font-black text-emerald-200">{compact(reel.views)}</span></div><p className="mt-1 text-xs text-emerald-50/55">Public views · {percent(reel.engagementPerView)} visible interaction</p></a>)}
                    {!reelEvidence.some((reel) => reel.recommendation === "KEEP") ? <p className="rounded-lg border border-dashed border-white/15 p-3 text-sm leading-5 text-white/50">There are no above-typical public-view reels to promote yet. Use the full evidence table to choose the strongest test.</p> : null}
                  </div>
                </article>
              </section>

              <TrendRadar instagramPilotEnabled={isInstagramTrendPilotEnabled()} isAdmin={isAdmin} tiktokPilotEnabled={isTikTokTrendPilotEnabled()} youtubePilotEnabled={isYouTubeTrendPilotEnabled()} watchlists={trendWatchlists} />
              <TrendResults auditId={latest.id} scans={recentTrendScans} />
              <TrendMovementPanel sources={trendMovementSources.map((source) => ({ ...source, readiness: buildTrendMovementReadiness(source.scans) }))} />
              <CrossPlatformOpportunityPanel auditId={latest.id} opportunities={buildCrossPlatformOpportunities(trendMovementSources.map((source) => ({ ...source, readiness: buildTrendMovementReadiness(source.scans) })))} />

              <section className="mt-5 rounded-xl border border-white/10 bg-[#11141a] p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Top content</p><h2 className="mt-1 text-lg font-black">Evidence table</h2><p className="mt-1 text-sm text-white/50">Every row links to the original public reel.</p></div><Link href={`/audits/${latest.id}`} className="text-sm font-bold text-orange-300 hover:text-orange-200">Open all reel evidence -&gt;</Link></div>
                <TopContentTable reels={reelEvidence.slice(0, 10)} maximum={highestViews} />
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
                <PostingCalendar days={metrics.postingCalendar} />
                <PostingHeatmap cells={metrics.postingHeatmap} />
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-3">
                <PatternPanel title="Hook performance" subtitle="Average public views by opening style" patterns={metrics.hookPatterns} />
                <PatternPanel title="Content-type signals" subtitle="Inferred from public caption structure" patterns={metrics.contentTypePatterns} />
                <PatternPanel title="Caption and hashtag signals" subtitle="Average public views" patterns={[...metrics.captionPatterns.slice(0, 2), ...metrics.hashtagPatterns.slice(0, 2)]} />
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr]">
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Spoken intelligence</p><h2 className="mt-1 text-lg font-black">Openings to study</h2></div><span className="rounded-md border border-white/10 px-2 py-1 text-xs font-bold text-white/60">{intelligence ? `${intelligence.transcriptCount}/${intelligence.totalReels}` : "--"} transcripts</span></div>
                  {latest.transcriptEnrichment?.status === "SUBMITTED" ? <p className="mt-4 rounded-lg border border-orange-300/20 bg-orange-400/[0.07] p-3 text-sm leading-5 text-orange-100/80">Transcript imports are still running. This section refreshes when usable public text arrives.</p> : null}
                  {intelligence?.transcriptOpenings.length ? <div className="mt-4 grid gap-2">{intelligence.transcriptOpenings.map((reel) => <a href={reel.url} target="_blank" rel="noreferrer" key={reel.id} className="rounded-lg border border-white/8 bg-white/[0.025] p-3 hover:border-orange-300/35"><p className="text-sm font-semibold leading-5 text-white/85">&quot;{reel.opening}&quot;</p><p className="mt-2 text-xs text-white/45">{compact(reel.views)} public views</p></a>)}</div> : <p className="mt-4 text-sm leading-6 text-white/55">No public transcript text is available for this sample yet.</p>}
                </article>
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Execution board</p>
                  <h2 className="mt-1 text-lg font-black">Hooks to test next</h2>
                  <div className="mt-4 grid gap-2">
                    {(contentPack.readyToPostHooks ?? []).slice(0, 4).map((hook, index) => <div className="grid grid-cols-[1.8rem_1fr] gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3" key={hook}><span className="text-xs font-black text-orange-300">0{index + 1}</span><p className="text-sm leading-5 text-white/75">{hook}</p></div>)}
                  </div>
                  <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">CTA options</p><p className="mt-2 text-sm leading-5 text-white/65">{(contentPack.ctaOptions ?? []).slice(0, 2).join(" / ") || "Open the report to create your CTA options."}</p></div>
                </article>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
                <CompetitorBoard board={board} competitorLimit={competitorLimit} currentAuditId={latest.id} available={availableCompetitors.map((audit) => ({ id: audit.id, username: audit.socialProfiles[0]?.username ?? audit.profileUrl }))} />
                <StrategyChecklist auditId={latest.id} />
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <InsightList title="What is working" items={contentPack.strengths} tone="emerald" />
                <InsightList title="Fix next" items={contentPack.weaknesses} tone="rose" />
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Recent audits</p><h2 className="mt-1 text-lg font-black">Your profiles</h2><div className="mt-4 grid gap-2">{audits.slice(0, 5).map((audit) => <Link href={`/audits/${audit.id}`} key={audit.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5 text-sm hover:border-orange-300/35"><span className="truncate pr-4 font-semibold text-white/70">{audit.socialProfiles[0]?.username ? `@${audit.socialProfiles[0].username}` : audit.profileUrl}</span><span className="shrink-0 text-xs text-orange-200">Open -&gt;</span></Link>)}</div></article>
                <article className="rounded-xl border border-dashed border-white/15 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Data boundary</p><h2 className="mt-1 text-lg font-black">What this workspace knows</h2><p className="mt-3 text-sm leading-6 text-white/60">Public reels, visible interactions, captions, timestamps, and returned transcript text. It does not claim private reach, retention, watch time, audience demographics, or follower growth.</p><Link href={`/audits/${latest.id}`} className="mt-4 inline-flex text-sm font-bold text-orange-300 hover:text-orange-200">See evidence and labels -&gt;</Link></article>
              </section>
            </section>
          ) : (
            <section className="grid min-h-[620px] place-items-center rounded-xl border border-dashed border-white/15 bg-[#11141a] p-8 text-center"><div className="max-w-md"><p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-300">Your workspace is ready</p><h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">Run your first audit to unlock the dashboard.</h1><p className="mt-4 leading-6 text-white/60">SocialOreo will turn the public reel sample into a performance overview and a short list of posts to make next.</p><Link href="/audits/new" className="mt-7 inline-flex rounded-lg bg-orange-400 px-5 py-3 text-sm font-black text-black">Start an audit</Link></div></section>
          )}
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, note, accent = false }: { label: string; value: string | number; note: string; accent?: boolean }) {
  return <article className={`rounded-xl border p-4 ${accent ? "border-orange-300/30 bg-orange-400/[0.08]" : "border-white/10 bg-[#11141a]"}`}><p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">{value}</p><p className="mt-1 text-xs text-white/50">{note}</p></article>;
}

type InstagramInsightsConnectionPanel = {
  username: string | null;
  accountType: string | null;
  status: "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED";
  lastSyncedAt: Date | null;
  lastError: string | null;
  snapshots: Array<{ accountReach: number | null; accountViews: number | null; profileViews: number | null; totalInteractions: number | null; followerCount: number | null; fetchedAt: Date }>;
};

function InstagramInsightsPanel({ configured, connection }: { configured: boolean; connection: InstagramInsightsConnectionPanel | null }) {
  const snapshot = connection?.snapshots[0];
  if (!connection) return <section className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-400/[0.05] p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-100/75">Owner-only Instagram Insights</p><h2 className="mt-1 text-lg font-black">Connect your professional account</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Connect the Business or Creator account you own to show real Meta-returned reach, views, interactions, follower count, audience data, and eligible Reel watch-time metrics. Nothing is estimated.</p></div>{configured ? <a href="/api/meta/instagram/connect" className="shrink-0 rounded-lg bg-cyan-200 px-4 py-2.5 text-sm font-black text-[#071116] hover:bg-white">Connect Instagram</a> : <span className="shrink-0 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold text-white/55">Connection setup pending</span>}</div><p className="mt-3 text-xs leading-5 text-white/40">Meta only grants this for eligible professional accounts and approved permissions. Public-audit metrics remain separate.</p></section>;
  if (!snapshot) return <section className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-400/[0.05] p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-100/75">Owner-only Instagram Insights</p><h2 className="mt-1 text-lg font-black">@{connection.username ?? "connected account"} is connected</h2><p className="mt-2 text-sm leading-6 text-white/60">Meta authorization is stored securely. Run the first Insights sync to replace this empty state with real API data.</p></div><form action="/api/meta/instagram/sync" method="post"><button className="rounded-lg bg-cyan-200 px-4 py-2.5 text-sm font-black text-[#071116] hover:bg-white" type="submit">Sync Insights</button></form></div></section>;
  return <section className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-400/[0.05] p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-100/75">Owner-only Instagram Insights</p><h2 className="mt-1 text-lg font-black">@{connection.username ?? "connected account"}</h2><p className="mt-1 text-xs text-white/45">Meta API data · refreshed {shortDate(snapshot.fetchedAt)} · not public estimates</p></div><div className="flex gap-2"><span className="w-fit rounded-md border border-cyan-100/20 px-2 py-1 text-xs font-black text-cyan-100">{connection.accountType ?? "Professional"}</span><form action="/api/meta/instagram/sync" method="post"><button className="rounded-md border border-cyan-100/25 px-2 py-1 text-xs font-bold text-cyan-100 hover:border-cyan-100/60" type="submit">Refresh</button></form></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Reach" value={compact(snapshot.accountReach)} note="Meta account insight" /><Metric label="Views" value={compact(snapshot.accountViews)} note="Meta account insight" /><Metric label="Interactions" value={compact(snapshot.totalInteractions)} note="Meta account insight" /><Metric label="Profile views" value={compact(snapshot.profileViews)} note="Meta account insight" /><Metric label="Followers" value={compact(snapshot.followerCount)} note="Meta account insight" /></div></section>;
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-[78px] px-3 py-2"><p className="text-sm font-black text-white">{value}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/40">{label}</p></div>;
}

function DecisionStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><p className={`text-2xl font-black ${tone}`}>{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/45">{label}</p></div>;
}

type TrendWatchlistItem = {
  id: string;
  platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
  sourceType: "KEYWORD" | "HASHTAG" | "CREATOR";
  query: string;
  scans: Array<{ status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"; completedAt: Date | null; resultCount: number | null }>;
};

type TrendResultScan = {
  id: string;
  platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
  sourceType: "KEYWORD" | "HASHTAG" | "CREATOR";
  query: string;
  completedAt: Date | null;
  resultCount: number;
  videos: Array<{
    id: string;
    sourceUrl: string;
    creatorHandle: string | null;
    caption: string | null;
    hashtags: string[];
    postedAt: Date | null;
    viewCount: number | null;
    visibleInteractionRate: number | null;
  }>;
};

type TrendMovementSource = {
  id: string;
  platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
  sourceType: "KEYWORD" | "HASHTAG" | "CREATOR";
  query: string;
  readiness: ReturnType<typeof buildTrendMovementReadiness>;
};

function trendLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function latestTrendScanLabel(scan: TrendWatchlistItem["scans"][number] | undefined) {
  if (!scan) return "Not scanned";
  if (scan.status === "COMPLETED") return `${scan.resultCount ?? 0} public videos saved`;
  if (scan.status === "FAILED") return "Latest scan failed";
  return `${trendLabel(scan.status)} scan`;
}

function TrendRadar({ instagramPilotEnabled, isAdmin, tiktokPilotEnabled, watchlists, youtubePilotEnabled }: { instagramPilotEnabled: boolean; isAdmin: boolean; tiktokPilotEnabled: boolean; watchlists: TrendWatchlistItem[]; youtubePilotEnabled: boolean }) {
  const enabledPilots = [instagramPilotEnabled ? "Instagram" : null, tiktokPilotEnabled ? "TikTok" : null, youtubePilotEnabled ? "YouTube" : null].filter((value): value is string => Boolean(value));
  return <section className="mt-5 rounded-xl border border-cyan-200/20 bg-cyan-300/[0.045] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-100/70">Trend radar</p>
        <h2 className="mt-1 text-lg font-black">Find the next pattern, then make it yours</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">SocialOreo is adding niche keywords, hashtags, and creator watchlists across Instagram, TikTok, and YouTube so public patterns can become an original hook, script, CTA, and caption — not a copy of someone else&apos;s reel.</p>
      </div>
      <span className="w-fit rounded-md border border-cyan-100/20 bg-cyan-200/[0.08] px-2 py-1 text-xs font-black text-cyan-50">Watchlists ready</span>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <TrendStep number="01" title="Choose sources" detail="Your niche, hashtags, and public creators on Instagram, TikTok, and YouTube." />
      <TrendStep number="02" title="Prove movement" detail="Compare stored public samples before calling a pattern a trend." />
      <TrendStep number="03" title="Make the post" detail="Turn the evidence into a fresh hook, script, CTA, and caption." />
    </div>
    <div className="mt-5 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <form action={addTrendWatchlist} className="grid gap-2 rounded-lg border border-cyan-100/10 bg-black/10 p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-bold text-white/55">Platform<select className="rounded-md border border-white/10 bg-[#11141a] px-2.5 py-2 text-sm font-semibold text-white" defaultValue="INSTAGRAM" name="platform"><option value="INSTAGRAM">Instagram</option><option value="TIKTOK">TikTok</option><option value="YOUTUBE">YouTube</option></select></label>
        <label className="grid gap-1 text-xs font-bold text-white/55">Source<select className="rounded-md border border-white/10 bg-[#11141a] px-2.5 py-2 text-sm font-semibold text-white" defaultValue="HASHTAG" name="sourceType"><option value="HASHTAG">Hashtag</option><option value="KEYWORD">Keyword</option><option value="CREATOR">Creator</option></select></label>
        <label className="grid gap-1 text-xs font-bold text-white/55">What to watch<input className="rounded-md border border-white/10 bg-[#11141a] px-2.5 py-2 text-sm font-semibold text-white placeholder:text-white/30" maxLength={160} name="query" placeholder="#smallbusiness or @creator" required /></label>
        <button className="rounded-md bg-cyan-200 px-3 py-2 text-sm font-black text-[#081015] hover:bg-cyan-100" type="submit">Save source</button>
      </form>
      <div className="rounded-lg border border-white/10 bg-black/10 p-3">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-white/45">Your watchlist</p><span className="text-xs font-bold text-cyan-100">{watchlists.length} saved</span></div>
        {watchlists.length ? <div className="mt-3 grid gap-2">{watchlists.slice(0, 6).map((watchlist) => <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-2" key={watchlist.id}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white/80"><span className="text-cyan-100">{trendLabel(watchlist.platform)}</span> · {trendLabel(watchlist.sourceType)} · {watchlist.query}</p><p className="mt-0.5 text-[11px] font-medium text-white/40">{latestTrendScanLabel(watchlist.scans[0])}</p></div><div className="flex shrink-0 items-center gap-3">{isAdmin && instagramPilotEnabled && watchlist.platform === "INSTAGRAM" ? <form action={startInstagramTrendScan}><input name="watchlistId" type="hidden" value={watchlist.id} /><button className="text-xs font-bold text-cyan-100 hover:text-white" type="submit">Run pilot · est. ${INSTAGRAM_TREND_ESTIMATED_COST_USD.toFixed(2)}</button></form> : null}{isAdmin && tiktokPilotEnabled && watchlist.platform === "TIKTOK" ? <form action={startTikTokTrendScan}><input name="watchlistId" type="hidden" value={watchlist.id} /><button className="text-xs font-bold text-cyan-100 hover:text-white" type="submit">Run pilot · est. ${TIKTOK_TREND_ESTIMATED_COST_USD.toFixed(2)}</button></form> : null}{isAdmin && youtubePilotEnabled && watchlist.platform === "YOUTUBE" ? <form action={startYouTubeTrendScan}><input name="watchlistId" type="hidden" value={watchlist.id} /><button className="text-xs font-bold text-cyan-100 hover:text-white" type="submit">{youtubeTrendPilotLabel()}</button></form> : null}<form action={removeTrendWatchlist}><input name="watchlistId" type="hidden" value={watchlist.id} /><button className="text-xs font-bold text-white/40 hover:text-rose-200" type="submit">Remove</button></form></div></div>)}</div> : <p className="mt-3 text-sm leading-5 text-white/50">Save sources now. Scans stay off until each platform&apos;s verified provider pilot is connected.</p>}
      </div>
    </div>
    <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-amber-200/15 bg-black/15 p-3 sm:flex-row sm:items-center">
      <p className="text-xs leading-5 text-amber-50/70">{enabledPilots.length ? `${enabledPilots.join(" and ")} ${enabledPilots.length === 1 ? "is" : "are"} enabled for capped admin pilots. Saving any other source stays free until its verified source path is connected.` : "No live discovery source is connected yet, so this workspace intentionally shows no invented trend scores, velocity, or hashtag claims. Saving a watchlist does not start a scan or create a provider charge."}</p>
      {isAdmin ? <Link className="shrink-0 text-sm font-bold text-cyan-100 hover:text-white" href="/admin/angle-library">Add trusted hooks + CTAs →</Link> : null}
    </div>
  </section>;
}

function TrendResults({ auditId, scans }: { auditId: string; scans: TrendResultScan[] }) {
  const evidenceCount = scans.reduce((total, scan) => total + scan.videos.length, 0);

  return <section className="mt-5 rounded-xl border border-cyan-200/20 bg-[#11141a] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-100/70">Public discovery evidence</p>
        <h2 className="mt-1 text-lg font-black">Patterns worth adapting</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Each card is a saved public short-form video from a completed source capture. One capture is an emerging public pattern, not proof that something is trending.</p>
      </div>
      <span className="w-fit rounded-md border border-cyan-100/20 bg-cyan-200/[0.08] px-2 py-1 text-xs font-black text-cyan-50">{evidenceCount} videos saved</span>
    </div>
    {scans.length ? <div className="mt-5 grid gap-4">{scans.map((scan) => <article className="rounded-lg border border-white/10 bg-black/10 p-4" key={scan.id}>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-sm font-black text-white"><span className="text-cyan-100">Emerging public pattern</span> · {trendLabel(scan.platform)} · {trendLabel(scan.sourceType)} · {scan.sourceType === "HASHTAG" ? "#" : ""}{scan.query}</p><p className="mt-1 text-xs text-white/45">Captured {shortDate(scan.completedAt)} · {scan.resultCount} public videos returned</p></div><Link href={`/audits/${auditId}#content-plan`} className="shrink-0 text-xs font-bold text-orange-300 hover:text-orange-200">Use evidence in a post brief →</Link></div>
      {scan.videos.length ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{scan.videos.map((video) => <a className="group rounded-lg border border-white/8 bg-white/[0.025] p-3 transition hover:border-cyan-200/35" href={video.sourceUrl} key={video.id} rel="noreferrer" target="_blank"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-black text-cyan-100">{video.creatorHandle ? scan.platform === "YOUTUBE" ? video.creatorHandle : `@${video.creatorHandle}` : "Open public video"}</p><span className="shrink-0 text-[11px] font-bold text-white/40">Source ↗</span></div><p className="mt-3 line-clamp-3 text-sm leading-5 text-white/75">{video.caption || "Public video with no returned caption."}</p><div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-[11px]"><div><p className="text-white/35">Views</p><p className="mt-1 font-black text-white">{compact(video.viewCount)}</p></div><div><p className="text-white/35">Interaction</p><p className="mt-1 font-black text-white">{percent(video.visibleInteractionRate)}</p></div><div><p className="text-white/35">Published</p><p className="mt-1 font-black text-white">{shortDate(video.postedAt)}</p></div></div>{video.hashtags.length ? <p className="mt-3 truncate text-[11px] text-white/40">#{video.hashtags.slice(0, 3).join(" #")}</p> : null}</a>)}</div> : <p className="mt-4 rounded-md border border-dashed border-white/15 p-3 text-sm text-white/50">This completed capture returned no usable public videos.</p>}
    </article>)}</div> : <div className="mt-5 rounded-lg border border-dashed border-white/15 p-4"><p className="text-sm font-bold text-white/70">No public captures yet</p><p className="mt-1 text-sm leading-6 text-white/50">Save a source above, then run a verified provider pilot. SocialOreo will show the original links, visible public metrics, and capture time here before you adapt the idea into your own post brief.</p></div>}
    <p className="mt-4 text-xs leading-5 text-white/40">Public views and visible interactions are source evidence only. They are not reach, retention, watch time, audience data, or Instagram Insights.</p>
  </section>;
}

function TrendMovementPanel({ sources }: { sources: TrendMovementSource[] }) {
  return <section className="mt-5 rounded-xl border border-white/10 bg-[#11141a] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">Observed movement</p><h2 className="mt-1 text-lg font-black">When a pattern earns a trend label</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">SocialOreo requires at least two completed captures and a recurring public source before it compares movement. This prevents a single capture from being presented as velocity or a trend.</p></div><span className="w-fit rounded-md border border-orange-300/25 bg-orange-400/[0.08] px-2 py-1 text-xs font-black text-orange-200">Evidence gate</span></div>
    {sources.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{sources.map((source) => <MovementSourceCard key={source.id} source={source} />)}</div> : <div className="mt-5 rounded-lg border border-dashed border-white/15 p-4"><p className="text-sm font-bold text-white/70">No sources saved yet</p><p className="mt-1 text-sm leading-6 text-white/50">Save a keyword, hashtag, or creator in Trend Radar. The dashboard will track how many completed public captures are needed before any movement comparison is eligible.</p></div>}
    <p className="mt-4 text-xs leading-5 text-white/40">Even after this gate is met, SocialOreo compares only returned public samples and recurring source links. It does not infer platform-wide trend velocity or private Instagram Insights.</p>
  </section>;
}

function MovementSourceCard({ source }: { source: TrendMovementSource }) {
  const readiness = source.readiness;
  const label = source.sourceType === "HASHTAG" ? `#${source.query}` : source.sourceType === "CREATOR" ? `@${source.query}` : source.query;
  const status = readiness.status === "READY_TO_COMPARE"
    ? { title: "Ready to compare returned samples", detail: `${readiness.repeatedSourceCount} recurring public source${readiness.repeatedSourceCount === 1 ? "" : "s"} across ${readiness.captureCount} captures.`, className: "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100" }
    : readiness.status === "NO_REPEATED_SOURCES"
      ? { title: "Need recurring public sources", detail: `${readiness.captureCount} captures are saved, but no returned public source link appears in both yet.`, className: "border-amber-300/20 bg-amber-400/[0.06] text-amber-100" }
      : { title: "Need one more completed capture", detail: `${readiness.captureCount}/2 captures saved. Do not label this source trending yet.`, className: "border-white/10 bg-white/[0.025] text-white/75" };

  return <article className={`rounded-lg border p-4 ${status.className}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white"><span className="text-orange-300">{trendLabel(source.platform)}</span> · {label}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] opacity-70">{trendLabel(source.sourceType)}</p></div><span className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-xs font-black">{readiness.captureCount}/2 captures</span></div><p className="mt-4 text-sm font-bold text-white">{status.title}</p><p className="mt-1 text-xs leading-5 opacity-75">{status.detail}</p>{readiness.firstCapturedAt && readiness.latestCapturedAt ? <p className="mt-3 border-t border-current/15 pt-3 text-[11px] font-medium opacity-65">Observed {shortDate(readiness.firstCapturedAt)} to {shortDate(readiness.latestCapturedAt)} · {readiness.sourceReelCount} distinct returned public source links</p> : null}</article>;
}

function CrossPlatformOpportunityPanel({ auditId, opportunities }: { auditId: string; opportunities: ReturnType<typeof buildCrossPlatformOpportunities> }) {
  return <section className="mt-5 rounded-xl border border-sky-200/20 bg-sky-300/[0.04] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100/75">Cross-platform opportunity board</p><h2 className="mt-1 text-lg font-black">Turn repeated evidence into an original post</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">This board joins matching watchlists across platforms. It shows coverage first; an adaptation is eligible only when every participating platform has recurring public source evidence.</p></div><span className="w-fit rounded-md border border-sky-100/20 bg-sky-200/[0.08] px-2 py-1 text-xs font-black text-sky-50">Source-backed only</span></div>
    {opportunities.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">{opportunities.map((opportunity) => <CrossPlatformOpportunityCard auditId={auditId} key={opportunity.key} opportunity={opportunity} />)}</div> : <div className="mt-5 rounded-lg border border-dashed border-white/15 p-4"><p className="text-sm font-bold text-white/70">No matching cross-platform sources yet</p><p className="mt-1 text-sm leading-6 text-white/50">Save the same keyword or hashtag on at least two platforms. SocialOreo will show shared coverage without assuming the platforms have the same audience or algorithm.</p></div>}
    <p className="mt-4 text-xs leading-5 text-white/40">“Eligible” means the saved public samples can inform an original brief. It is not a claim of platform-wide trend velocity, reach, retention, or private Insights.</p>
  </section>;
}

function CrossPlatformOpportunityCard({ auditId, opportunity }: { auditId: string; opportunity: ReturnType<typeof buildCrossPlatformOpportunities>[number] }) {
  const label = opportunity.sourceType === "HASHTAG" ? `#${opportunity.query.replace(/^#/, "")}` : opportunity.sourceType === "CREATOR" ? `@${opportunity.query.replace(/^@/, "")}` : opportunity.query;
  const status = opportunity.status === "READY_TO_ADAPT"
    ? { title: "Eligible for an original post brief", detail: `Recurring public source evidence is saved on ${opportunity.readyPlatforms.length} platform${opportunity.readyPlatforms.length === 1 ? "" : "s"}.`, className: "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100" }
    : opportunity.status === "NEEDS_MOVEMENT_EVIDENCE"
      ? { title: "Coverage found; capture again before adapting", detail: `${opportunity.platforms.length} platforms watch this source, but only ${opportunity.readyPlatforms.length}/${opportunity.platforms.length} have recurring public evidence.`, className: "border-amber-300/20 bg-amber-400/[0.06] text-amber-100" }
      : { title: "Add the same source on one more platform", detail: "Cross-platform comparison needs at least two saved platform sources.", className: "border-sky-200/20 bg-sky-200/[0.06] text-sky-100" };

  return <article className={`rounded-lg border p-4 ${status.className}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{label}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] opacity-70">{trendLabel(opportunity.sourceType)} · {opportunity.platforms.map(trendLabel).join(" + ")}</p></div><span className="shrink-0 rounded-md border border-current/20 px-2 py-1 text-xs font-black">{opportunity.readyPlatforms.length}/{opportunity.platforms.length} ready</span></div><p className="mt-4 text-sm font-bold text-white">{status.title}</p><p className="mt-1 text-xs leading-5 opacity-75">{status.detail}</p>{opportunity.status === "READY_TO_ADAPT" ? <Link href={`/audits/${auditId}#content-plan`} className="mt-3 inline-flex border-t border-current/15 pt-3 text-xs font-black text-white hover:text-sky-100">Build an original post brief →</Link> : null}</article>;
}

function TrendStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <article className="rounded-lg border border-cyan-100/10 bg-black/10 p-3"><p className="text-xs font-black text-cyan-100">{number}</p><p className="mt-2 text-sm font-bold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-white/50">{detail}</p></article>;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return <div><div className="flex justify-between gap-3 text-xs"><span className="text-white/65">{label}</span><span className="font-black text-white">{score}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-400" style={{ width: `${score}%` }} /></div></div>;
}

type HistoryMonitor = {
  id: string;
  enabled: boolean;
  cadenceHours: number;
  lastCapturedAt: Date | null;
  nextCaptureAt: Date | null;
  lastError: string | null;
  snapshots: Array<{
    id: string;
    capturedAt: Date;
    followerCount: number | null;
    reelsCollected: number;
    totalViews: number | null;
    medianViews: number | null;
    visibleInteractionRate: number | null;
  }>;
};

function shortDate(value: Date | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(value) : "--";
}

function ObservedHistory({ auditId, monitor }: { auditId: string; monitor: HistoryMonitor | null }) {
  const snapshots = monitor?.snapshots ?? [];
  const values = snapshots.map((snapshot) => snapshot.totalViews).filter((value): value is number => typeof value === "number");
  const first = snapshots[0];
  const latest = snapshots.at(-1);
  const change = first?.totalViews !== undefined && first?.totalViews !== null && latest?.totalViews !== undefined && latest?.totalViews !== null
    ? latest.totalViews - first.totalViews
    : undefined;
  const max = Math.max(1, ...values);

  return <section className="mt-5 rounded-xl border border-white/10 bg-[#11141a] p-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Observed history</p><h2 className="mt-1 text-lg font-black">Public sample over time</h2><p className="mt-1 text-sm leading-5 text-white/50">Stored public snapshots make future sample-to-sample comparisons possible. They are not Instagram Insights.</p></div><span className={`w-fit rounded-md border px-2 py-1 text-xs font-black ${monitor?.enabled ? "border-emerald-300/25 bg-emerald-400/[0.07] text-emerald-200" : "border-white/10 text-white/50"}`}>{monitor?.enabled ? "Weekly tracking on" : "Tracking paused"}</span></div>
    {snapshots.length >= 2 ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Snapshots" value={snapshots.length} note={`First: ${shortDate(first?.capturedAt)}`} /><Metric label="Latest sample" value={compact(latest?.totalViews)} note={`${latest?.reelsCollected ?? 0} public reels · ${shortDate(latest?.capturedAt)}`} /><Metric label="Sample change" value={change === undefined ? "--" : `${change > 0 ? "+" : ""}${compact(change)}`} note="Across stored public samples" /></div><div className="mt-5 flex h-20 items-end gap-1.5" aria-label="Observed public sample views over time">{snapshots.map((snapshot) => <div className="group flex min-w-0 flex-1 flex-col justify-end" key={snapshot.id} title={`${shortDate(snapshot.capturedAt)}: ${compact(snapshot.totalViews)} public views across ${snapshot.reelsCollected} reels`}><div className="min-h-1 rounded-t bg-orange-400/80" style={{ height: `${Math.max(5, ((snapshot.totalViews ?? 0) / max) * 100)}%` }} /><span className="mt-2 truncate text-center text-[9px] text-white/35">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(snapshot.capturedAt)}</span></div>)}</div><p className="mt-4 text-xs leading-5 text-white/40">Each point is the visible reel sample returned at capture time. New posts, a changed sample, or removed public reels can change the total; it is not account-wide month-over-month reach.</p></> : <p className="mt-5 rounded-lg border border-dashed border-white/15 p-4 text-sm leading-6 text-white/55">{snapshots.length ? `Baseline saved on ${shortDate(snapshots[0]?.capturedAt)}. A second observed snapshot is needed before SocialOreo shows a change.` : "No baseline is stored yet. Start tracking to backfill completed public audits for this profile, then capture new weekly public samples."}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"><p className="text-xs leading-5 text-white/45">{monitor?.enabled ? `Next provider refresh: ${shortDate(monitor.nextCaptureAt)}. It uses the existing public Instagram provider and may incur its configured provider cost.` : "Tracking stays off until you explicitly enable it; completed audits remain available as baselines."}</p>{monitor?.enabled ? <form action={pausePublicSnapshotHistory}><input name="monitorId" type="hidden" value={monitor.id} /><button className="rounded-md border border-white/15 px-2.5 py-2 text-xs font-bold text-white/70 hover:border-rose-300/50 hover:text-rose-200" type="submit">Pause tracking</button></form> : <form action={startPublicSnapshotHistory}><input name="auditJobId" type="hidden" value={auditId} /><button className="rounded-md border border-orange-300/35 bg-orange-400/[0.07] px-2.5 py-2 text-xs font-bold text-orange-200 hover:border-orange-300 hover:text-white" type="submit">Start weekly tracking</button></form>}</div>
    {monitor?.lastError ? <p className="mt-3 text-xs leading-5 text-amber-100/75">Latest scheduled refresh could not complete. SocialOreo will retry; the stored public baseline remains unchanged.</p> : null}
  </section>;
}

function ViewDistribution({ bins }: { bins: Array<{ minViews: number; maxViews: number; count: number }> }) {
  const maximum = Math.max(1, ...bins.map((bin) => bin.count));
  if (!bins.length) return <p className="mt-5 text-sm text-white/50">No usable public view data.</p>;
  return <div className="mt-5 flex h-44 items-end gap-2" aria-label="Public view distribution histogram">
    {bins.map((bin) => <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={`${bin.minViews}-${bin.maxViews}`}><span className="text-xs font-black text-white">{bin.count}</span><div className="flex h-28 w-full items-end rounded-t bg-white/[0.04]"><div className="w-full rounded-t bg-orange-400/85" style={{ height: `${Math.max(bin.count ? 10 : 2, Math.round((bin.count / maximum) * 100))}%` }} /></div><span className="text-center text-[10px] leading-4 text-white/45">{compact(bin.minViews)}{bin.minViews === bin.maxViews ? "" : `–${compact(bin.maxViews)}`}</span></div>)}
  </div>;
}

function PerformanceMap({ map }: { map: PublicPerformanceMap | undefined }) {
  if (!map || map.points.length < 2) return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Performance map</p><h2 className="mt-1 text-lg font-black">Views and visible interaction</h2><p className="mt-5 text-sm leading-6 text-white/50">At least two reels with both public views and visible interactions are needed to map the sample.</p></article>;

  const logViews = map.points.map((point) => Math.log10(Math.max(1, point.views)));
  const rates = map.points.map((point) => point.engagementPerView);
  const minLog = Math.min(...logViews);
  const maxLog = Math.max(...logViews);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const x = (views: number) => 10 + ((Math.log10(Math.max(1, views)) - minLog) / Math.max(0.0001, maxLog - minLog)) * 82;
  const y = (rate: number) => 88 - ((rate - minRate) / Math.max(0.0001, maxRate - minRate)) * 76;
  const pointTone = (quadrant: PublicPerformanceMap["points"][number]["quadrant"]) => quadrant === "HIGH_REACH_HIGH_INTERACTION" ? "#fb923c" : quadrant === "HIGH_REACH_LOWER_INTERACTION" ? "#facc15" : quadrant === "LOWER_REACH_HIGH_INTERACTION" ? "#5eead4" : "#94a3b8";
  const highBoth = map.points.filter((point) => point.quadrant === "HIGH_REACH_HIGH_INTERACTION").length;
  const highReach = map.points.filter((point) => point.quadrant === "HIGH_REACH_LOWER_INTERACTION").length;
  const highInteraction = map.points.filter((point) => point.quadrant === "LOWER_REACH_HIGH_INTERACTION").length;

  return <article className="min-w-0 rounded-xl border border-white/10 bg-[#11141a] p-5">
    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Performance map</p><h2 className="mt-1 text-lg font-black">Views and visible interaction</h2><p className="mt-1 text-xs text-white/45">Each point is one public reel. Midlines are this sample&apos;s medians.</p></div><span className="shrink-0 text-xs font-bold text-white/40">{map.points.length} reels with both signals</span></div>
    <div className="mt-4 overflow-x-auto"><svg aria-label="Public reel views and visible interaction rate scatter plot" className="min-w-[420px] w-full" role="img" viewBox="0 0 104 104"><rect fill="rgba(251,146,60,.035)" height="38" width="41" x="53" y="10" /><rect fill="rgba(94,234,212,.025)" height="38" width="41" x="10" y="10" /><line stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".45" x1={x(map.medianViews)} x2={x(map.medianViews)} y1="8" y2="90" /><line stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" strokeWidth=".45" x1="8" x2="94" y1={y(map.medianEngagementPerView)} y2={y(map.medianEngagementPerView)} /><line stroke="rgba(255,255,255,.28)" strokeWidth=".5" x1="8" x2="94" y1="90" y2="90" /><line stroke="rgba(255,255,255,.28)" strokeWidth=".5" x1="8" x2="8" y1="8" y2="90" />{map.points.map((point, index) => <a aria-label={`Open reel ${index + 1}: ${point.caption}`} href={point.url} key={point.id} rel="noreferrer" target="_blank"><title>{`${String(index + 1).padStart(2, "0")}. ${point.caption}: ${compact(point.views)} public views, ${percent(point.engagementPerView)} visible interaction rate`}</title><circle cx={x(point.views)} cy={y(point.engagementPerView)} fill={pointTone(point.quadrant)} r="3.3" stroke="#11141a" strokeWidth=".8" /><text dominantBaseline="middle" fill="#11141a" fontSize="2.5" fontWeight="800" textAnchor="middle" x={x(point.views)} y={y(point.engagementPerView) + .2}>{index + 1}</text></a>)}</svg></div>
    <div className="mt-1 flex justify-between gap-4 text-[10px] text-white/40"><span>Lower public views</span><span>Higher public views · log scale</span></div>
    <div className="mt-4"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Plot key</p><p className="text-[10px] text-white/40">Select any reel to open its source</p></div><div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Public reel plot key">{map.points.map((point, index) => <a className="flex min-w-0 items-center gap-2 rounded-md border border-white/8 bg-white/[0.025] px-2 py-1.5 hover:border-orange-300/35 hover:bg-orange-400/[0.04]" href={point.url} key={point.id} rel="noreferrer" target="_blank" title={point.caption}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white/80">{point.caption}</span><span className="block text-[10px] text-white/45">{compact(point.views)} views · {percent(point.engagementPerView)}</span></span></a>)}</div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3"><MapStat value={highBoth} label="High views + high interaction" tone="text-orange-200" /><MapStat value={highReach} label="High views, lower interaction" tone="text-amber-100" /><MapStat value={highInteraction} label="Lower views, high interaction" tone="text-teal-100" /></div><p className="mt-4 text-xs leading-5 text-white/40">Visible interaction rate is calculated from available public likes, comments, shares, and saves divided by public views. It is not reach, retention, or watch time.</p>
  </article>;
}

function MapStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3"><p className={`text-lg font-black ${tone}`}>{value}</p><p className="mt-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-white/45">{label}</p></div>;
}

function TopContentTable({ reels, maximum }: { reels: PublicReelEvidence[]; maximum: number }) {
  if (!reels.length) return <p className="mt-5 text-sm text-white/50">No reel evidence is available yet.</p>;
  return <div className="mt-5 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-white/10 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40"><tr><th className="pb-3 pr-3">Reel</th><th className="pb-3 pr-3">Published</th><th className="pb-3 pr-3">Public views</th><th className="pb-3 pr-3">Interaction rate</th><th className="pb-3 pr-3">Recommendation</th><th className="pb-3 text-right">Source</th></tr></thead><tbody>{reels.map((reel) => {
    const width = Math.max(5, Math.round(((reel.views ?? 0) / maximum) * 100));
    return <tr className="border-b border-white/[0.07] last:border-0" key={reel.id}><td className="max-w-[290px] py-3 pr-3"><div className="flex items-center gap-3"><div className="aspect-[3/4] w-8 shrink-0 rounded bg-white/10" style={reel.thumbnailUrl ? { backgroundImage: `url(${reel.thumbnailUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} /><span className="line-clamp-2 font-semibold leading-5 text-white/75">{reel.caption}</span></div></td><td className="py-3 pr-3 text-white/55">{reel.postedAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(reel.postedAt) : "Unavailable"}</td><td className="min-w-[125px] py-3 pr-3"><span className="font-black text-white">{compact(reel.views)}</span><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-400/80" style={{ width: `${width}%` }} /></div></td><td className="py-3 pr-3 font-semibold text-white/70">{percent(reel.engagementPerView)}</td><td className="py-3 pr-3"><span className={`rounded border px-1.5 py-1 text-[10px] font-black ${recommendationTone(reel.recommendation)}`}>{reel.recommendation}</span></td><td className="py-3 text-right"><a className="font-bold text-orange-300 hover:text-orange-200" href={reel.url} rel="noreferrer" target="_blank">Open ↗</a></td></tr>;
  })}</tbody></table></div>;
}

function PostingCalendar({ days }: { days: Array<{ isoDate: string; label: string; count: number; totalViews: number }> }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Posting consistency</p><h2 className="mt-1 text-lg font-black">Six-week calendar</h2><p className="mt-1 text-xs text-white/45">UTC dates from the public sample.</p>{days.length ? <><div className="mt-4 grid grid-cols-7 gap-1.5 text-[10px] text-white/40">{["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <span className="text-center" key={`${label}-${index}`}>{label}</span>)}</div><div className="mt-1 grid grid-cols-7 gap-1.5">{days.map((day) => <div aria-label={`${day.label}: ${day.count} public posts`} className={`aspect-square rounded-sm border border-white/5 ${day.count ? "bg-orange-400" : "bg-white/[0.035]"}`} key={day.isoDate} style={day.count ? { opacity: 0.32 + (day.count / max) * 0.68 } : undefined} title={`${day.label}: ${day.count} reel${day.count === 1 ? "" : "s"}, ${compact(day.totalViews)} public views`} />)}</div><div className="mt-3 flex justify-between text-xs text-white/45"><span>{days[0]?.label}</span><span>{days[days.length - 1]?.label}</span></div></> : <p className="mt-5 text-sm text-white/50">No public posting dates are available.</p>}</article>;
}

function PostingHeatmap({ cells }: { cells: Array<{ weekday: string; hour: number; count: number; averageViews?: number }> }) {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  if (!cells.some((cell) => cell.count)) return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Posting timing</p><h2 className="mt-1 text-lg font-black">Day and hour heatmap</h2><p className="mt-5 text-sm text-white/50">No public posting times are available.</p></article>;
  return <article className="overflow-hidden rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Posting timing</p><h2 className="mt-1 text-lg font-black">Day and hour heatmap</h2><p className="mt-1 text-xs text-white/45">Public timestamps in UTC. Brighter cells mean more sampled posts.</p><div className="mt-5 overflow-x-auto"><div className="grid min-w-[620px] grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-1 text-[9px]">{Array.from({ length: 25 }, (_, index) => <span className="h-4 text-center text-white/40" key={`hour-${index}`}>{index === 0 ? "" : (index - 1) % 3 === 0 ? String(index - 1).padStart(2, "0") : ""}</span>)}{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].flatMap((weekday) => [<span className="flex items-center text-[10px] font-bold text-white/45" key={`${weekday}-label`}>{weekday}</span>, ...cells.filter((cell) => cell.weekday === weekday).map((cell) => <span aria-label={`${cell.weekday} ${String(cell.hour).padStart(2, "0")}:00 UTC: ${cell.count} sampled post${cell.count === 1 ? "" : "s"}`} className={`aspect-square rounded-sm border border-white/5 ${cell.count ? "bg-orange-400" : "bg-white/[0.035]"}`} key={`${cell.weekday}-${cell.hour}`} style={cell.count ? { opacity: 0.25 + (cell.count / max) * 0.75 } : undefined} title={`${cell.weekday} ${String(cell.hour).padStart(2, "0")}:00 UTC: ${cell.count} sampled reel${cell.count === 1 ? "" : "s"}${cell.averageViews === undefined ? "" : `, ${compact(cell.averageViews)} avg. public views`}`} />)])}</div></div></article>;
}

function PatternPanel({ title, subtitle, patterns }: { title: string; subtitle: string; patterns: PerformancePattern[] }) {
  const max = Math.max(1, ...patterns.map((pattern) => pattern.averageViews));
  return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Public patterns</p><h2 className="mt-1 text-lg font-black">{title}</h2><p className="mt-1 text-xs text-white/45">{subtitle}</p><div className="mt-4 grid gap-3">{patterns.length ? patterns.slice(0, 4).map((pattern) => <div key={pattern.label}><div className="flex justify-between gap-3 text-xs"><span className="truncate text-white/65">{pattern.label} <span className="text-white/35">({pattern.sampleSize})</span></span><span className="shrink-0 font-black text-white">{compact(pattern.averageViews)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-400/80" style={{ width: `${Math.max(5, Math.round((pattern.averageViews / max) * 100))}%` }} /></div></div>) : <p className="text-sm text-white/50">No usable public view data.</p>}</div></article>;
}

type BoardEntry = {
  auditJobId: string;
  auditJob: {
    id: string;
    profileUrl: string;
    auditReport: { overallScore: number } | null;
    socialProfiles: Array<{ username: string | null; profileImageUrl: string | null }>;
    socialVideos: Array<{ viewCount: number | null; likeCount: number | null; commentCount: number | null; shareCount: number | null; saveCount: number | null }>;
  };
};

function CompetitorBoard({ board, competitorLimit, currentAuditId, available }: { board: BoardEntry[]; competitorLimit: number; currentAuditId: string; available: Array<{ id: string; username: string }> }) {
  if (competitorLimit === 0) return <article className="rounded-xl border border-orange-300/20 bg-orange-400/[0.06] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">Competitor Board</p><h2 className="mt-1 text-lg font-black">Available with Lifetime or Monthly</h2><p className="mt-2 text-sm leading-6 text-orange-50/70">Your free trial includes one seven-post audit and the complete report. Lifetime includes one competitor; Monthly includes up to three.</p><Link className="mt-4 inline-flex rounded-md bg-orange-400 px-4 py-2.5 text-xs font-black text-black hover:bg-orange-300" href="/pricing">View plans</Link></article>;
  const summaries = board.map((entry) => {
    const audit = entry.auditJob;
    const videosWithViews = audit.socialVideos.filter((video) => typeof video.viewCount === "number" && video.viewCount >= 0);
    const views = videosWithViews.map((video) => video.viewCount as number);
    const visibleInteractions = audit.socialVideos.flatMap((video) => [video.likeCount, video.commentCount, video.shareCount, video.saveCount].filter((value): value is number => typeof value === "number" && value >= 0));
    const totalViews = views.reduce((sum, value) => sum + value, 0);
    const sortedViews = [...views].sort((a, b) => a - b);
    const middle = Math.floor(sortedViews.length / 2);
    const medianViews = sortedViews.length ? sortedViews.length % 2 ? sortedViews[middle] : (sortedViews[middle - 1] + sortedViews[middle]) / 2 : undefined;
    return {
      entry,
      audit,
      label: audit.socialProfiles[0]?.username ? `@${audit.socialProfiles[0].username}` : audit.profileUrl,
      reelCount: views.length,
      totalViews: views.length ? totalViews : undefined,
      medianViews,
      interactionRate: totalViews && visibleInteractions.length ? visibleInteractions.reduce((sum, value) => sum + value, 0) / totalViews : undefined,
    };
  });

  if (summaries.length) return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Competitor board</p><h2 className="mt-1 text-lg font-black">Saved profiles to study</h2><p className="mt-1 text-sm leading-5 text-white/50">Compare public samples side by side, then open the exact reel evidence before borrowing an idea.</p></div><span className="rounded-md border border-orange-300/20 bg-orange-400/[0.06] px-2 py-1 text-xs font-black text-orange-200">{board.length}/{competitorLimit} saved</span></div><div className="mt-5 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead className="border-b border-white/10 uppercase tracking-[0.12em] text-white/40"><tr><th className="pb-3 pr-3">Profile</th><th className="pb-3 pr-3">Score</th><th className="pb-3 pr-3">Sample</th><th className="pb-3 pr-3">Public views</th><th className="pb-3 pr-3">Median views</th><th className="pb-3 pr-3">Visible interaction / view</th><th className="pb-3 text-right">Action</th></tr></thead><tbody>{summaries.map((summary) => <tr className="border-b border-white/[0.07] last:border-0" key={summary.entry.auditJobId}><td className="max-w-[155px] truncate py-3 pr-3 font-black text-white/85">{summary.label}</td><td className="py-3 pr-3 font-black text-white">{summary.audit.auditReport?.overallScore ?? "--"}/100</td><td className="py-3 pr-3 text-white/65">{summary.reelCount} reels</td><td className="py-3 pr-3 font-black text-white">{compact(summary.totalViews)}</td><td className="py-3 pr-3 font-semibold text-white/75">{compact(summary.medianViews)}</td><td className="py-3 pr-3 font-semibold text-white/75">{percent(summary.interactionRate)}</td><td className="py-3 text-right"><div className="flex justify-end gap-3"><Link className="font-bold text-orange-300 hover:text-orange-200" href={`/audits/${currentAuditId}/compare?competitor=${summary.audit.id}`}>Compare</Link><form action={removeCompetitorFromBoard}><input name="auditJobId" type="hidden" value={summary.audit.id} /><button className="font-bold text-white/40 hover:text-rose-200" type="submit">Remove</button></form></div></td></tr>)}</tbody></table></div><p className="mt-3 text-xs leading-5 text-white/40">Each row is its saved public audit sample. Different sample sizes and capture dates are visible context, not a creator percentile or private Insights comparison.</p>{available.length && board.length < competitorLimit ? <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">Completed audits available to save</p><div className="mt-3 flex flex-wrap gap-2">{available.slice(0, 6).map((audit) => <form action={addCompetitorToBoard} key={audit.id}><input name="auditJobId" type="hidden" value={audit.id} /><button className="rounded-md border border-white/15 px-2.5 py-2 text-xs font-bold text-white/70 hover:border-orange-300/50 hover:text-orange-200" type="submit">+ {audit.username}</button></form>)}</div></div> : null}</article>;

  return <article className="rounded-xl border border-white/10 bg-[#11141a] p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/40">Competitor board</p><h2 className="mt-1 text-lg font-black">Saved profiles to study</h2><p className="mt-1 text-sm leading-5 text-white/50">Store up to {competitorLimit} completed competitor {competitorLimit === 1 ? "audit" : "audits"} here, then open a detailed comparison when you need it.</p></div><span className="rounded-md border border-orange-300/20 bg-orange-400/[0.06] px-2 py-1 text-xs font-black text-orange-200">{board.length}/{competitorLimit} saved</span></div>{board.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{board.slice(0, competitorLimit).map((entry) => { const audit = entry.auditJob; const label = audit.socialProfiles[0]?.username ? `@${audit.socialProfiles[0].username}` : audit.profileUrl; const totalViews = audit.socialVideos.reduce((sum, video) => sum + (video.viewCount ?? 0), 0); return <div className="rounded-lg border border-white/8 bg-white/[0.025] p-3" key={entry.auditJobId}><div className="flex items-start justify-between gap-2"><p className="truncate font-black text-white/85">{label}</p><form action={removeCompetitorFromBoard}><input name="auditJobId" type="hidden" value={audit.id} /><button className="text-xs font-bold text-white/40 hover:text-rose-200" type="submit">Remove</button></form></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="text-white/40">Score</p><p className="mt-1 font-black text-white">{audit.auditReport?.overallScore ?? "--"}/100</p></div><div><p className="text-white/40">Public views</p><p className="mt-1 font-black text-white">{compact(totalViews)}</p></div></div><Link className="mt-4 inline-flex text-xs font-bold text-orange-300 hover:text-orange-200" href={`/audits/${currentAuditId}/compare?competitor=${audit.id}`}>Compare ↗</Link></div>; })}</div> : <p className="mt-5 rounded-lg border border-dashed border-white/15 p-4 text-sm leading-6 text-white/50">Save completed competitor audits to compare multiple public performance snapshots from one dashboard.</p>}{available.length && board.length < competitorLimit ? <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">Completed audits available to save</p><div className="mt-3 flex flex-wrap gap-2">{available.slice(0, 6).map((audit) => <form action={addCompetitorToBoard} key={audit.id}><input name="auditJobId" type="hidden" value={audit.id} /><button className="rounded-md border border-white/15 px-2.5 py-2 text-xs font-bold text-white/70 hover:border-orange-300/50 hover:text-orange-200" type="submit">+ {audit.username}</button></form>)}</div></div> : null}</article>;
}

function StrategyChecklist({ auditId }: { auditId: string }) {
  const report = `/audits/${auditId}`;
  const steps = [
    { label: "Pick a post brief", href: `${report}#content-plan`, detail: "Evidence + next post" },
    { label: "Choose a hook", href: `${report}#hooks`, detail: "Ready-to-post openings" },
    { label: "Adapt the script", href: `${report}#scripts`, detail: "Turn the idea into beats" },
    { label: "Select the CTA", href: `${report}#ctas`, detail: "Give the post one clear action" },
    { label: "Finish the caption", href: `${report}#captions`, detail: "Publish with the matching copy" },
  ];
  return <article className="rounded-xl border border-orange-300/20 bg-orange-400/[0.06] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-200/80">AI strategy checklist</p><h2 className="mt-1 text-lg font-black">Turn evidence into your next reel</h2><ol className="mt-4 grid gap-2">{steps.map((step, index) => <li key={step.label}><Link className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 rounded-lg border border-orange-200/10 bg-black/10 p-3 hover:border-orange-300/45" href={step.href}><span className="text-xs font-black text-orange-300">{String(index + 1).padStart(2, "0")}</span><span><span className="block text-sm font-bold text-white">{step.label}</span><span className="mt-0.5 block text-xs text-orange-50/55">{step.detail}</span></span><span className="text-orange-300">→</span></Link></li>)}</ol><p className="mt-4 text-xs leading-5 text-orange-50/55">These links open SocialOreo’s generated brief and execution pack; they do not create an estimate or private metric.</p></article>;
}

function InsightList({ title, items, tone }: { title: string; items?: string[]; tone: "emerald" | "rose" }) {
  const className = tone === "emerald" ? "border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-100" : "border-rose-300/20 bg-rose-400/[0.06] text-rose-100";
  return <article className={`rounded-xl border p-5 ${className}`}><p className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">{tone === "emerald" ? "Keep doing" : "Fix next"}</p><h2 className="mt-1 text-lg font-black text-white">{title}</h2><div className="mt-4 grid gap-2">{(items ?? []).slice(0, 4).map((item) => <p key={item} className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm leading-5">{item}</p>)}</div></article>;
}
