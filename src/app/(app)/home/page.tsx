import Link from "next/link";
import { redirect } from "next/navigation";

import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { loadDashboardSummary, type DashboardCardState } from "@/lib/socialolla/dashboard/dashboard-summary";

export const metadata = { title: "Dashboard — SocialOlla" };

function StateBadge({ state }: { state: DashboardCardState }) {
  return (
    <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">
      {state}
    </span>
  );
}

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString() : "—";
}

function formatPlan(plan: string, planVersion: string | null): string {
  return planVersion ?? plan.replaceAll("_", " ");
}

export default async function M2HomePage() {
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!resolution) redirect("/auth/login");

  const workspace = await getOrCreatePersonalWorkspace(resolution.dbId);
  const summary = await loadDashboardSummary(resolution.dbId, workspace.dbId);

  return (
    <section data-testid="socialolla-dashboard">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--social-blue)]">SocialOlla workspace</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em]">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
            One place for your Profile Analysis, Posts, Watch activity, connections, and credit status.
          </p>
        </div>
        <span data-testid="dashboard-state" className="text-xs font-black uppercase tracking-[0.14em] text-amber-200">
          Workspace state: {summary.overallState}
        </span>
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--social-blue)]/35 bg-[var(--social-blue)]/10 p-5" data-testid="dashboard-next-action">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--social-blue)]">Recommended next action</p>
            <h2 className="mt-2 font-display text-xl font-extrabold">{summary.recommendedAction.title}</h2>
            <p className="mt-1 text-sm text-white/70">{summary.recommendedAction.description}</p>
          </div>
          <Link className="rounded-full bg-[var(--social-blue)] px-5 py-3 text-center text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href={summary.recommendedAction.href}>
            Open
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-analysis-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Profile Analysis</h2>
            <StateBadge state={summary.analysis.state} />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.analysis.count}</p>
          <p className="text-sm text-white/55">completed reports in this account</p>
          {summary.analysis.latest ? (
            <p className="mt-4 text-sm text-white/70">
              Latest: <strong>{summary.analysis.latest.label}</strong> · score {summary.analysis.latest.score ?? "—"} · {formatDate(summary.analysis.latest.completedAt)}
            </p>
          ) : (
            <p className="mt-4 text-sm text-white/60">No completed analysis yet. Historical reports will appear here.</p>
          )}
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/analysis">Open Analysis</Link>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-post-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Posts</h2>
            <StateBadge state={summary.posts.state} />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.posts.total}</p>
          <p className="text-sm text-white/55">recent Post requests</p>
          <p className="mt-4 text-sm text-white/70">Drafts {summary.posts.draft} · scheduled {summary.posts.scheduled} · failed {summary.posts.failed}</p>
          <p className="mt-2 text-xs text-white/45">Draft and schedule state is local; provider delivery is not claimed here.</p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/posts">Open Posts</Link>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-watch-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Watch</h2>
            <StateBadge state={summary.watch.state} />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.watch.activeMonitors}</p>
          <p className="text-sm text-white/55">active monitors · {summary.watch.reports} recent reports</p>
          {summary.watch.latestReport ? (
            <p className="mt-4 text-sm text-white/70">Latest: {summary.watch.latestReport.platform} · {summary.watch.latestReport.status}</p>
          ) : (
            <p className="mt-4 text-sm text-white/60">No Watch result yet.</p>
          )}
          <p className="mt-2 text-xs text-white/45">{summary.providerDisabled ? "Provider monitoring is disabled in this environment; no automatic execution is claimed." : "Live provider monitoring is not verified; no automatic execution is claimed."}</p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/watch">Open Watch</Link>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-connections-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Connections</h2>
            <StateBadge state={summary.connections.state} />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.connections.connected}/{summary.connections.total}</p>
          <p className="text-sm text-white/55">connections recorded · {summary.connections.reconnectRequired} need attention</p>
          {summary.connections.instagramInsights ? (
            <p className="mt-4 text-sm text-white/70">Instagram Profile Analysis: {summary.connections.instagramInsights.status}{summary.connections.instagramInsights.username ? ` · @${summary.connections.instagramInsights.username}` : ""}</p>
          ) : (
            <p className="mt-4 text-sm text-white/60">No Instagram Insights connection is recorded.</p>
          )}
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/connections">Open Connections</Link>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-credits-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Credits & plan</h2>
            <StateBadge state={summary.credits.state} />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.credits.canonicalAvailable}</p>
          <p className="text-sm text-white/55">available credits shown in this workspace</p>
          <p className="mt-4 text-sm text-white/70">Plan: <strong>{formatPlan(summary.credits.plan, summary.credits.planVersion)}</strong></p>
          <p className="mt-2 text-xs text-white/45">Read-only summary while account credit records are being consolidated. Historical balance {summary.credits.legacyBalance ?? "—"}.</p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/credits">Open Credits</Link>
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-calendar-summary">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Calendar</h2>
            <StateBadge state="PARTIAL" />
          </div>
          <p className="mt-3 text-3xl font-black">{summary.upcoming.length}</p>
          <p className="text-sm text-white/55">upcoming scheduled items</p>
          {summary.upcoming[0] ? (
            <p className="mt-4 text-sm text-white/70">Next: {formatDate(summary.upcoming[0].scheduleAt)} · {summary.upcoming[0].timezone}</p>
          ) : (
            <p className="mt-4 text-sm text-white/60">No upcoming schedule entries.</p>
          )}
          <p className="mt-2 text-xs text-white/45">Calendar reflects saved local schedule state, not confirmed provider delivery.</p>
          <Link className="mt-4 inline-flex text-sm font-bold text-[var(--social-blue)] hover:underline" href="/calendar">Open Calendar</Link>
        </article>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-recent-activity">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Recent Posts</h2>
            <Link className="text-sm font-bold text-[var(--social-blue)] hover:underline" href="/posts">View all</Link>
          </div>
          {summary.posts.latest.length === 0 ? (
            <p className="mt-4 text-sm text-white/60">Nothing here yet. Create a draft from Posts.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {summary.posts.latest.map((post) => (
                <div key={post.id} className="rounded-2xl border border-white/5 p-3">
                  <p className="font-bold">{post.externalId}</p>
                  <p className="text-xs text-white/50">{post.status} · {post.destinationRef} · {formatDate(post.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" data-testid="dashboard-connection-status">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Workspace status</h2>
            <Link className="text-sm font-bold text-[var(--social-blue)] hover:underline" href="/settings">Settings</Link>
          </div>
          <div className="mt-4 space-y-2 text-sm text-white/70">
            <p>Workspace: <strong>{workspace.label}</strong></p>
            <p>Social delivery: <strong>{summary.providerDisabled ? "not enabled in staging" : "not yet verified"}</strong></p>
            <p>Active Watch monitors: <strong>{summary.watch.activeMonitors}</strong>{summary.watch.nextCaptureAt ? ` · next ${formatDate(summary.watch.nextCaptureAt)}` : ""}</p>
            <p>Recent credit activity: <strong>{summary.credits.recentActivity.length}</strong> entries</p>
          </div>
        </article>
      </div>
    </section>
  );
}
