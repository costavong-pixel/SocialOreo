import { redirect } from "next/navigation";
import { m2AdminInspect, m2AdminAudit, m2RequireAdmin } from "@/app/m2-actions";
import { formatPriceCents, lifetimePlan } from "@/lib/socialolla/plans/plan-config";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { AdminAdjustCreditsForm } from "@/components/admin/admin-adjust-credits-form";
import { AdminSetLifetimePriceForm } from "@/components/admin/admin-set-lifetime-price-form";
import Link from "next/link";

export const metadata = { title: "Admin — Plans — SocialOlla" };

export default async function AdminPlansPage() {
  // Server-side admin gate: the shell protects the signed-in app area, and this
  // action re-verifies the ADMIN role before any admin surface is rendered.
  const { admin } = await m2RequireAdmin();
  if (!admin) redirect("/home");

  const plan = lifetimePlan();
  const inspected = await m2AdminInspect();
  const audit = await m2AdminAudit();
  const providerDisabled = providerDisabledEnabled();

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Admin — Plans &amp; entitlement</h1>

      <nav aria-label="Admin" className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
        <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/plans">Plans</Link>
        <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/angle-library">Angle Library</Link>
        <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/contact">Contact</Link>
        <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/feedback">Analysis feedback</Link>
      </nav>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <p className="font-bold">{plan.name}</p>
        <p className="text-sm text-white/60">Price: {formatPriceCents(plan.priceCents, plan.currency)} · version {plan.version}</p>
        <div className="mt-3">
          <AdminSetLifetimePriceForm currentPriceCents={plan.priceCents} />
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Provider-disable mode</h2>
        <p className="mt-1 text-sm text-white/70">
          Status: <strong className={providerDisabled ? "text-emerald-300" : "text-rose-300"}>{providerDisabled ? "ENABLED (provider-disabled)" : "DISABLED (live providers would be reachable)"}</strong>
        </p>
        <p className="mt-2 text-xs text-white/50">
          Milestone 2 makes zero live provider calls. The chokepoint refuses live transport unless <code>SOCIALOLLA_PROVIDER_DISABLED=true</code>. This card is informational only — the flag is set by configuration.
        </p>
      </div>

      <h2 className="mt-8 font-display text-lg font-extrabold">Entitlement snapshot</h2>
      {inspected.snapshot ? (
        <p className="mt-2 text-sm text-white/70">maxDestinations {inspected.snapshot.maxDestinations} · monthly credits {inspected.snapshot.includedMonthlyCredits} · post {inspected.snapshot.postCreditsPerRequest} · watch {inspected.snapshot.watchCreditsPerRequest}</p>
      ) : (
        <p className="mt-2 text-sm text-white/50">No entitlement snapshot yet.</p>
      )}

      <h2 className="mt-8 font-display text-lg font-extrabold">Manual adjustment / refund</h2>
      <p className="mt-1 text-sm text-white/60">Target a user, set an amount (negative = refund), give a reason. A confirmation step and an audit event are required.</p>
      <div className="mt-3">
        <AdminAdjustCreditsForm />
      </div>

      <h2 className="mt-8 font-display text-lg font-extrabold">Audit events</h2>
      <div className="mt-3 space-y-2">
        {audit.length === 0 && <p className="text-sm text-white/50">No audit events.</p>}
        {audit.map((e) => (
          <p key={e.id} className="text-sm text-white/70">{e.eventType} · {e.occurredAt.toISOString()}</p>
        ))}
      </div>
    </section>
  );
}
