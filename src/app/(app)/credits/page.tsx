import { m2CreditsOverview } from "@/app/m2-actions";
import { planConfig } from "@/lib/socialolla/plans/plan-config";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";
import { CheckoutButtons, ClaimMonthlyCredits } from "@/components/credits/checkout-buttons";

export const metadata = { title: "Credits — SocialOlla" };

export default async function CreditsPage() {
  const overview = await m2CreditsOverview();
  const plans = planConfig();
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Credits</h1>
      <p className="mt-2 text-white/70">Canonical credit batches, expiry and ledger.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {overview.batches.map((b) => (
          <div key={b.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{b.externalId} · {b.kind}</p>
            <p className="text-sm text-white/60">remaining {b.remaining} / {b.amount} · expiry {b.expiresAt ? b.expiresAt.toISOString().slice(0, 10) : "—"}</p>
          </div>
        ))}
      </div>
      {overview.batches.length === 0 && <p className="mt-4 text-sm text-white/50">{shellStateLabel("empty")} — no credit batches yet.</p>}
      <ClaimMonthlyCredits entitled={Boolean(overview.entitlement) && (overview.entitlement?.includedMonthlyCredits ?? 0) > 0} includedMonthlyCredits={overview.entitlement?.includedMonthlyCredits ?? 0} />
      <CheckoutButtons
        lifetimePriceCents={plans.lifetime.priceCents}
        lifetimeCurrency={plans.lifetime.currency}
        monthlyPriceCents={plans.monthly.priceCents}
        monthlyCurrency={plans.monthly.currency}
      />
      <h2 className="mt-8 font-display text-lg font-extrabold">Recent transactions</h2>
      <div className="mt-3 space-y-2">
        {overview.transactions.map((t) => (
          <p key={t.id} className="text-sm text-white/70">{t.kind} · {t.amount} · {t.reference}</p>
        ))}
      </div>
    </section>
  );
}
