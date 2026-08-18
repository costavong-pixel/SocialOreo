import Link from "next/link";
import { getSessionUser } from "@/lib/auth/current-user";
import { planConfig, formatPriceCents } from "@/lib/socialolla/plans/plan-config";
import { CheckoutButtons } from "@/components/credits/checkout-buttons";

export const metadata = { title: "Pricing — SocialOlla" };

export default async function PricingPage() {
  const sessionUser = await getSessionUser();
  const config = planConfig();
  const lifetime = config.lifetime;
  const monthly = config.monthly;
  const plans = [
    {
      name: "Free demo",
      price: "$0",
      referencePrice: null,
      billing: "One-time",
      detail: "One free live-quality title/caption demo before you commit.",
      items: ["One labelled title/caption demo", "Editable and copyable result", "No sign-up required", "No credits consumed"],
      action: "Try the demo",
      href: "/demo",
      featured: false,
    },
    {
      name: "Lifetime",
      price: formatPriceCents(lifetime.priceCents, lifetime.currency),
      referencePrice: null,
      billing: "One-time",
      detail: "SocialOlla lifetime plan with included credits.",
      items: ["One personal workspace", "Destination-specific Post creation", "Watch with exact credit preview", "Included monthly credits + purchase packs"],
      action: "Choose Lifetime",
      href: "/credits",
      featured: true,
    },
    {
      name: "Monthly",
      price: formatPriceCents(monthly.priceCents, monthly.currency),
      referencePrice: null,
      billing: "per month",
      detail: "Recurring plan with monthly included credits.",
      items: ["One personal workspace", "Monthly credit batch", "Watch with exact credit preview", "Cancel in Square sandbox when live checkout is enabled"],
      action: "Choose Monthly",
      href: "/credits",
      featured: false,
    },
  ];

  return (
    <main className="min-h-[100dvh] bg-[var(--social-page)] px-5 py-5 text-[var(--social-text)] sm:px-8 lg:px-12">
      <nav className="so-public-nav mx-auto max-w-7xl">
        <Link className="font-display text-xl font-extrabold tracking-[-0.04em]" href="/">SocialOlla</Link>
        <Link className="so-public-back" href="/">← Home</Link>
        <div className="flex items-center gap-4">
          <Link className="hidden text-sm font-bold text-white/65 hover:text-white sm:block" href="/terms">Terms</Link>
          {sessionUser ? (
            <>
              <Link className="text-sm font-bold text-white/65 hover:text-white" href="/dashboard">Dashboard</Link>
              <Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/auth/logout">Sign out</Link>
            </>
          ) : (
            <Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/sign-in">Sign in</Link>
          )}
        </div>
      </nav>
      <section className="mx-auto max-w-7xl py-12">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">Simple pricing.</h1>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-3xl border p-6 ${plan.featured ? "border-[var(--social-blue)] bg-white/5" : "border-white/10 bg-white/[0.02]"}`}>
              <h2 className="font-display text-xl font-extrabold">{plan.name}</h2>
              <p className="mt-2 font-display text-3xl font-extrabold">{plan.price}<span className="ml-1 text-sm font-normal text-white/50">{plan.billing}</span></p>
              <p className="mt-3 text-sm text-white/70">{plan.detail}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/80">
                {plan.items.map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <Link className="mt-6 block rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-center text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href={plan.href}>{plan.action}</Link>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 max-w-3xl">
          <CheckoutButtons
            lifetimePriceCents={lifetime.priceCents}
            lifetimeCurrency={lifetime.currency}
            monthlyPriceCents={monthly.priceCents}
            monthlyCurrency={monthly.currency}
          />
          <p className="mt-4 text-center text-sm text-white/50">
            Checkout is Square sandbox-only and tester-gated until it is made available. {sessionUser ? "Use your dashboard to continue." : <Link className="text-[var(--social-blue)] hover:underline" href="/sign-in">Sign in</Link>} {!sessionUser && " to start a checkout."}
          </p>
        </div>
      </section>
    </main>
  );
}
