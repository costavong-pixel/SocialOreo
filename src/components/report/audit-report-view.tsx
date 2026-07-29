import Link from "next/link";

import { buildReelStructures } from "@/lib/reports/reel-structures";
import type { PerformancePattern, PublicMetrics } from "@/lib/reports/public-metrics";

type ReportSummary = {
  headline?: string;
  diagnosis?: string;
};

type ReportSubScores = Record<string, number>;

type ReportContentPack = {
  strengths?: string[];
  weaknesses?: string[];
  angleRecommendations?: Array<{ angleName: string; reason: string; hook: string }>;
  readyToPostHooks?: string[];
  readyToPostScripts?: string[];
  ctaOptions?: string[];
  captionPack?: string[];
  hashtagPack?: string[];
  contentPrescription?: Array<{
    title: string;
    evidence: string;
    topic: string;
    hook: string;
    first3Seconds: string;
    shotsOrBeats: string[];
    captionDirection: string;
    cta: string;
    testSignal: string;
  }>;
};

export type AuditReportViewModel = {
  id: string;
  status: string;
  profileUrl: string;
  videoCount: number;
  errorMessage?: string | null;
  transcriptEnrichmentStatus?: string;
  publicMetrics: PublicMetrics;
  report?: {
    overallScore: number;
    subScores: ReportSubScores;
    summary: ReportSummary;
    actionPlan: string[];
    contentPack: ReportContentPack;
  } | null;
};

const subScoreLabels: Record<string, string> = {
  hookScore: "Hook quality",
  retentionSetup: "Retention setup",
  captionScore: "Caption strength",
  ctaScore: "Call to action",
  postingPattern: "Posting pattern",
  audienceFit: "Audience fit",
  goalFit: "Campaign fit",
  viralAngleStrength: "Viral angle",
  salesConversionStrength: "Sales conversion",
};

function scoreTone(score: number): string {
  if (score >= 70) return "text-emerald-300";
  if (score >= 45) return "text-amber-300";
  return "text-rose-300";
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-sm text-white/70">{detail}</p>
    </div>
  );
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function PatternList({ title, patterns }: { title: string; patterns: PerformancePattern[] }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.025] p-4">
      <h3 className="font-bold">{title}</h3>
      {patterns.length ? (
        <div className="mt-3 grid gap-2">
          {patterns.slice(0, 4).map((pattern) => (
            <div key={pattern.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-white/65">{pattern.label} <span className="text-white/35">({pattern.sampleSize})</span></span>
              <span className="font-bold text-white">{formatNumber(pattern.averageViews)} avg. views</span>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-white/50">No public view data available.</p>}
    </div>
  );
}

function ProfileAvatar({ imageUrl, username }: { imageUrl?: string | null; username?: string | null }) {
  const fallback = username?.slice(0, 1).toUpperCase() ?? "R";

  return (
    <div
      aria-label={username ? `Profile image for @${username}` : "Profile image"}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-sm font-black text-orange-200"
      role="img"
      style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {imageUrl ? null : fallback}
    </div>
  );
}

const recommendationStyles = {
  KEEP: "border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100",
  CHANGE: "border-amber-300/25 bg-amber-400/[0.08] text-amber-100",
  STOP: "border-rose-300/25 bg-rose-400/[0.08] text-rose-100",
};

function ReelEvidenceTable({ metrics }: { metrics: PublicMetrics }) {
  const evidence = metrics.reelEvidence ?? [];

  return (
    <article className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase text-orange-300">Evidence</p>
      <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Keep, change, or stop</h2>
      <p className="mt-2 max-w-[65ch] text-base leading-7 text-white/75">Ranked by public views. Every reel includes one practical next test.</p>
      {evidence.length ? (
        <ol className="mt-5 grid gap-3">
          {evidence.map((reel) => (
            <li key={reel.id} className="grid gap-4 rounded-md border border-white/8 bg-white/[0.025] p-4 lg:grid-cols-[2rem_4rem_minmax(0,1fr)_minmax(15rem,.8fr)]">
              <span className="text-sm font-black text-orange-300">{reel.rank ? String(reel.rank).padStart(2, "0") : "—"}</span>
              <div
                aria-label="Public reel thumbnail"
                className="aspect-[3/4] rounded-sm border border-white/10 bg-white/10"
                role="img"
                style={reel.thumbnailUrl ? { backgroundImage: `url(${reel.thumbnailUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
              />
              <div className="min-w-0">
                <a className="line-clamp-2 text-sm font-semibold leading-6 text-white hover:text-orange-200" href={reel.url} target="_blank" rel="noreferrer">{reel.caption}</a>
                <p className="mt-2 text-sm leading-6 text-white/65">{reel.evidence}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/65">
                  <span>{reel.durationSeconds === undefined ? "Length unavailable" : `${reel.durationSeconds} sec`}</span><span>·</span><span>{reel.captionWordCount}-word caption</span><span>·</span><span>{reel.hashtagCount} hashtags</span>
                </div>
              </div>
              <div className="grid content-start gap-3">
                <div className={`rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wide ${recommendationStyles[reel.recommendation]}`}>{reel.recommendation}</div>
                <div className="text-xs text-white/65"><p className="font-bold tabular-nums text-white">{formatNumber(reel.views)}</p><p>public views</p>{reel.engagementPerView !== undefined ? <p className="mt-1 text-emerald-300">{formatPercent(reel.engagementPerView)} EPV</p> : null}</div>
                <p className="border-t border-white/10 pt-3 text-sm leading-6 text-white/75"><span className="font-semibold text-white">Next test:</span> {reel.nextTest}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="mt-5 text-white/55">No public reels were saved with this audit.</p>}
    </article>
  );
}

function ContentIntelligenceSection({ metrics, enrichmentStatus }: { metrics: PublicMetrics; enrichmentStatus?: string }) {
  const intelligence = metrics.contentIntelligence;
  if (!intelligence) return null;

  return (
    <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase text-orange-300">Content intelligence</p>
      <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Spoken-hook evidence</h2>
      <p className="mt-2 max-w-[65ch] text-base leading-7 text-white/75">Public transcripts and audio labels only. Missing data stays unavailable.</p>
      {enrichmentStatus === "SUBMITTED" ? <p className="mt-3 rounded-md border border-orange-300/20 bg-orange-400/[0.08] px-3 py-2 text-sm leading-6 text-orange-50/80">Transcripts are being collected in the background. This report refreshes automatically when they are ready.</p> : null}
      {enrichmentStatus === "FAILED" ? <p className="mt-3 rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-sm leading-6 text-white/60">Transcript collection was unavailable for this audit. The public metadata report is still complete.</p> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <MetricCard label="Spoken transcripts" value={`${intelligence.transcriptCount}/${intelligence.totalReels}`} detail="Reels with a public transcript" />
        <MetricCard label="Audio labels" value={`${intelligence.audioCount}/${intelligence.totalReels}`} detail="Reels with an exposed audio name" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="rounded-md border border-white/10 bg-white/[0.025] p-4">
          <h3 className="font-bold">Spoken openings</h3>
          {intelligence.transcriptOpenings.length ? (
            <div className="mt-3 grid gap-3">
              {intelligence.transcriptOpenings.map((reel) => (
                <a className="rounded-md border border-white/8 bg-black/10 p-3 transition hover:border-orange-300/50" href={reel.url} key={reel.id} rel="noreferrer" target="_blank">
                  <p className="text-sm font-semibold leading-6 text-white">“{reel.opening}”</p>
                  <p className="mt-2 text-xs leading-5 text-white/50">{reel.caption} {reel.views === undefined ? "" : `· ${formatNumber(reel.views)} public views`}</p>
                </a>
              ))}
            </div>
          ) : <p className="mt-3 text-sm leading-6 text-white/55">No transcript was returned for these public reels. Spoken-hook analysis will appear when a transcript source is available.</p>}
        </article>
        <article className="rounded-md border border-white/10 bg-white/[0.025] p-4">
          <h3 className="font-bold">Audio patterns</h3>
          {intelligence.audioPatterns.length ? (
            <div className="mt-3 grid gap-2">
              {intelligence.audioPatterns.map((pattern) => <div className="flex items-start justify-between gap-4 text-sm" key={pattern.label}><span className="min-w-0 text-white/70">{pattern.label} <span className="text-white/35">({pattern.sampleSize})</span></span><span className="shrink-0 font-bold text-white">{formatNumber(pattern.averageViews)} avg. views</span></div>)}
            </div>
          ) : <p className="mt-3 text-sm leading-6 text-white/55">No public audio label was returned for these reels.</p>}
        </article>
      </div>
    </section>
  );
}

function ContentPrescriptionSection({ prescriptions }: { prescriptions?: ReportContentPack["contentPrescription"] }) {
  if (!prescriptions?.length) return null;

  return (
    <section className="rounded-lg border border-orange-300/20 bg-orange-400/[0.06] p-5 sm:p-7" id="content-plan">
      <p className="text-xs font-bold uppercase text-orange-200/80">Content prescription</p>
      <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Three posts to make next</h2>
      <p className="mt-2 max-w-[65ch] text-base leading-7 text-orange-50/80">Built from the public sample. Test these ideas; they are not private-reach promises.</p>
      <div className="mt-6 grid gap-4">
        {prescriptions.map((post, index) => (
          <article className="rounded-md border border-orange-200/15 bg-black/15 p-4 sm:p-5" key={`${post.title}-${index}`}>
            <p className="text-xs font-black text-orange-300">POST {String(index + 1).padStart(2, "0")}</p>
            <h3 className="mt-2 font-report text-xl font-semibold tracking-[-0.015em]">{post.title}</h3>
            <p className="mt-2 text-base leading-7 text-orange-50/80"><span className="font-semibold text-orange-100">Observed evidence:</span> {post.evidence}</p>
            <dl className="mt-5 grid gap-4 text-sm leading-6 lg:grid-cols-2">
              <div><dt className="font-black text-orange-200">Topic</dt><dd className="mt-1 text-white/75">{post.topic}</dd></div>
              <div><dt className="font-black text-orange-200">Hook</dt><dd className="mt-1 font-semibold text-white">{post.hook}</dd></div>
              <div><dt className="font-black text-orange-200">First 3 seconds</dt><dd className="mt-1 text-white/75">{post.first3Seconds}</dd></div>
              <div><dt className="font-black text-orange-200">Caption direction</dt><dd className="mt-1 text-white/75">{post.captionDirection}</dd></div>
              <div><dt className="font-black text-orange-200">CTA</dt><dd className="mt-1 text-white/75">{post.cta}</dd></div>
              <div><dt className="font-black text-orange-200">Public test signal</dt><dd className="mt-1 text-white/75">{post.testSignal}</dd></div>
            </dl>
            <div className="mt-5 border-t border-orange-200/10 pt-4"><p className="text-xs font-black uppercase text-orange-200">Shots or beats</p><ol className="mt-2 grid gap-1 text-sm leading-6 text-white/75">{post.shotsOrBeats.map((beat, beatIndex) => <li key={beat}>{beatIndex + 1}. {beat}</li>)}</ol></div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AuditReportView({ audit }: { audit: AuditReportViewModel }) {
  if (audit.status === "FAILED") {
    return (
      <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-6 text-rose-50 md:p-10">
        <h1 className="text-3xl font-black tracking-normal">Audit failed</h1>
        <p className="mt-4 text-rose-100/80">{audit.errorMessage ?? "We could not complete this audit."}</p>
      </div>
    );
  }

  if (!audit.report) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-6 text-white md:p-10">
        <h1 className="text-3xl font-black tracking-normal">Report not ready</h1>
        <p className="mt-4 text-white/65">This audit is still processing or no report was generated.</p>
      </div>
    );
  }

  const { report } = audit;
  const content = report.contentPack;
  const publicMetrics = audit.publicMetrics;
  const reelStructures = buildReelStructures(content);
  const scoreRows = Object.entries(report.subScores).map(([key, value]) => ({
    key,
    label: subScoreLabels[key] ?? key,
    value: Math.max(0, Math.min(100, value)),
  }));
  const headline = report.summary.headline ?? "Campaign diagnosis";
  const diagnosis = report.summary.diagnosis ?? "Your content was analyzed against the campaign brief.";
  const firstAction = report.actionPlan[0] ?? "Use the ready-to-post pack to test one focused idea this week.";

  return (
    <div className="grid gap-5 text-white">
      <section className="overflow-hidden rounded-lg border border-white/10 bg-[#101318] shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 px-5 py-4 sm:px-7">
          <p className="text-xs font-bold uppercase text-orange-300">SocialOreo expert campaign brief</p>
          <p className="mt-1 break-all text-sm text-white/50">{audit.profileUrl}</p>
        </div>
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p className="text-sm font-semibold text-orange-300">Expert diagnosis</p>
            <h1 className="mt-2 max-w-[18ch] font-report text-3xl font-semibold leading-[1.12] tracking-[-0.03em] sm:text-4xl">{headline}</h1>
            <p className="mt-4 max-w-[65ch] font-report text-base leading-7 text-white/85">{diagnosis}</p>
            <div className="mt-6 rounded-lg border border-orange-300/20 bg-orange-400/10 p-4">
              <p className="text-xs font-bold uppercase text-orange-200/70">Do this first</p>
              <p className="mt-2 leading-6 text-orange-50">{firstAction}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MetricCard label="Campaign score" value={`${report.overallScore}/100`} detail="Readiness" />
            <MetricCard label="Evidence reviewed" value={audit.videoCount} detail="Public reels" />
            <MetricCard label="Next moves" value={report.actionPlan.length} detail="Prioritized actions" />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7" id="execution-pack">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase text-orange-300">Evidence snapshot</p>
            <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">What the public sample shows</h2>
            <p className="mt-2 max-w-[65ch] text-base leading-7 text-white/75">Public views and engagement only. Private platform analytics are not included.</p>
          </div>
          {publicMetrics.profile?.username ? <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] px-4 py-3 text-sm"><ProfileAvatar imageUrl={publicMetrics.profile.profileImageUrl} username={publicMetrics.profile.username} /><div><p className="font-black">@{publicMetrics.profile.username}</p><p className="mt-1 text-white/50">{formatNumber(publicMetrics.profile.followerCount ?? undefined)} followers</p></div></div> : null}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total views" value={formatNumber(publicMetrics.summary.totalViews)} detail={`${publicMetrics.summary.reelsWithViews} reels with public views`} />
          <MetricCard label="Median views" value={formatNumber(publicMetrics.summary.medianViews)} detail="Typical reel performance" />
          <MetricCard label="Public likes" value={formatNumber(publicMetrics.summary.totalLikes)} detail="Available public counts" />
          <MetricCard label="Public comments" value={formatNumber(publicMetrics.summary.totalComments)} detail="Available public counts" />
          <MetricCard label="Engagement / view" value={formatPercent(publicMetrics.summary.engagementPerView)} detail="Likes, comments, and available shares/saves" />
        </div>
        <p className="mt-4 text-sm text-white/65">Engagement per follower: {formatPercent(publicMetrics.summary.engagementPerFollower)}. Unavailable fields are not estimated.</p>
      </section>

      <ReelEvidenceTable metrics={publicMetrics} />

      <ContentIntelligenceSection metrics={publicMetrics} enrichmentStatus={audit.transcriptEnrichmentStatus} />

      <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase text-white/45">Pattern signals</p>
        <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Public patterns to test</h2>
        <p className="mt-2 text-base leading-7 text-white/75">Average public views only. Posting times use UTC.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PatternList title="Best posting windows" patterns={publicMetrics.postingWindows} />
          <PatternList title="Duration" patterns={publicMetrics.durationPatterns} />
          <PatternList title="Caption length" patterns={publicMetrics.captionPatterns} />
          <PatternList title="Hashtag count" patterns={publicMetrics.hashtagPatterns} />
          <PatternList title="Hook type" patterns={publicMetrics.hookPatterns} />
          <div className="rounded-md border border-dashed border-white/15 p-4"><h3 className="font-bold">Private metrics</h3><p className="mt-3 text-sm leading-6 text-white/70">Reach, retention, watch time, audience details, and historic follower growth: <span className="font-semibold text-white/85">Not included in public-data audits.</span></p></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-white/45">Expert priorities</p>
              <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Fix these first</h2>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${scoreTone(report.overallScore)}`}>{report.overallScore}</p>
          </div>
          <div className="mt-6 grid gap-4">
            {scoreRows.length ? (
              scoreRows.map((score) => (
                <div key={score.key}>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-white/75">{score.label}</span>
                    <span className="font-bold text-white">{score.value}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-sm bg-white/10">
                    <div className="h-full rounded-sm bg-orange-400" style={{ width: `${score.value}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-white/55">No sub-scores were generated for this audit.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase text-white/45">Action plan</p>
          <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Next moves</h2>
          <ol className="mt-5 grid gap-2">
            {report.actionPlan.map((item, index) => (
              <li key={item} className="grid grid-cols-[2rem_1fr] gap-3 rounded-md border border-white/8 bg-white/[0.025] p-3">
                <span className="text-sm font-black text-orange-300">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-sm leading-6 text-white/75">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-lg border border-emerald-300/20 bg-emerald-400/[0.06] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase text-emerald-200/70">Keep doing</p>
          <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Keep</h2>
          <ul className="mt-5 grid gap-2">
            {(content.strengths ?? []).map((item) => (
              <li key={item} className="rounded-md border border-emerald-200/10 bg-black/10 p-3 text-sm leading-6 text-emerald-50/85">
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-lg border border-rose-300/20 bg-rose-400/[0.06] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase text-rose-200/70">Fix next</p>
          <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Change</h2>
          <ul className="mt-5 grid gap-2">
            {(content.weaknesses ?? []).map((item) => (
              <li key={item} className="rounded-md border border-rose-200/10 bg-black/10 p-3 text-sm leading-6 text-rose-50/85">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <ContentPrescriptionSection prescriptions={content.contentPrescription} />

      {reelStructures.length ? (
        <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase text-white/45">Expert formats</p>
          <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">5 repeatable reel structures</h2>
          <p className="mt-3 max-w-[65ch] text-base leading-7 text-white/75">Use a format, then make it your own with the pack below.</p>
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {reelStructures.map((recommendation, index) => (
              <article key={`${recommendation.angleName}-${recommendation.hook}`} className="rounded-md border border-white/10 bg-white/[0.025] p-4">
                <p className="text-xs font-bold text-orange-300">FORMAT {String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 font-bold text-white">{recommendation.angleName}</h3>
                <p className="mt-2 text-sm leading-6 text-white/75">{recommendation.reason}</p>
                <p className="mt-4 border-t border-white/10 pt-3 text-sm font-semibold leading-6 text-white/90">{recommendation.hook}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase text-white/45">Ready to publish</p>
        <h2 className="mt-1 font-report text-2xl font-semibold tracking-[-0.02em]">Your execution pack</h2>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <ContentList id="hooks" title="Hooks" items={content.readyToPostHooks} />
          <ContentList id="scripts" title="Scripts" items={content.readyToPostScripts} preserveLines />
          <ContentList id="ctas" title="CTAs" items={content.ctaOptions} />
          <ContentList id="captions" title="Captions" items={content.captionPack} preserveLines />
        </div>
        <div className="mt-5 rounded-md border border-white/10 bg-white/[0.025] p-4">
          <h3 className="font-bold">Hashtag pack</h3>
          <p className="mt-3 text-base leading-7 text-white/80">{(content.hashtagPack ?? []).join(" ")}</p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link className="rounded-md bg-orange-400 px-5 py-3 text-center text-sm font-bold text-black transition hover:bg-orange-300" href={`/audits/${audit.id}/export`} target="_blank">
          Open HTML report
        </Link>
        <Link className="rounded-md border border-orange-300/70 px-5 py-3 text-center text-sm font-bold text-orange-100 transition hover:bg-orange-400/10" href={`/audits/${audit.id}/pdf`}>
          Download PDF
        </Link>
        <Link className="rounded-md border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10" href={`/audits/${audit.id}/compare`}>
          Compare competitor
        </Link>
        <Link className="rounded-md border border-white/20 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10" href="/audits/new">
          Run another audit
        </Link>
      </div>
    </div>
  );
}

function ContentList({ id, title, items, preserveLines = false }: { id?: string; title: string; items?: string[]; preserveLines?: boolean }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.025] p-4" id={id}>
      <h3 className="font-bold">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {(items ?? []).map((item) => (
          <li key={item} className={`border-l-2 border-orange-300/70 pl-3 text-base leading-7 text-white/80 ${preserveLines ? "whitespace-pre-wrap" : ""}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
