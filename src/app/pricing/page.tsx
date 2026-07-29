import Link from "next/link";

const plans = [
  {
    name: "Free audit",
    price: "$0",
    referencePrice: null,
    billing: "One-time",
    detail: "A focused public snapshot before you commit.",
    items: ["One account audit", "7 recent public videos", "Complete report and campaign priorities", "No Competitor Board access"],
    action: "Start free",
    featured: false,
  },
  {
    name: "Lifetime",
    price: "$89",
    referencePrice: "$199",
    billing: "One-time",
    detail: "Competitor Board access without a subscription.",
    items: ["Compare your profile with one competitor", "Complete public-evidence comparison", "Purchase additional full-audit credits separately", "Lifetime and Monthly are separate products"],
    action: "Choose Lifetime",
    featured: false,
  },
  {
    name: "Monthly",
    price: "$19",
    referencePrice: "$39",
    billing: "per month",
    detail: "Competitor Board access for broader ongoing comparison.",
    items: ["Compare your profile with up to three competitors", "Complete public-evidence comparison", "Separate product; no Lifetime purchase required", "Cancel through Square when live checkout is enabled"],
    action: "Choose Monthly",
    featured: true,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--social-page)] px-5 py-5 text-[var(--social-text)] sm:px-8 lg:px-12">
      <nav className="so-public-nav mx-auto max-w-7xl"><Link className="font-display text-xl font-extrabold tracking-[-0.04em]" href="/">SocialOreo</Link><Link className="so-public-back" href="/">← Home</Link><div className="flex items-center gap-4"><Link className="hidden text-sm font-bold text-white/65 hover:text-white sm:block" href="/terms">Terms</Link><Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/audits/new">Start a free audit</Link></div></nav>

      <section className="mx-auto max-w-7xl pb-16 pt-20 text-center lg:pb-24 lg:pt-28"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--social-blue)]">Clear access, honest limits</p><h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-[-0.04em] sm:text-6xl">Start with the evidence. Choose competitor access only when you need it.</h1><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[var(--social-muted-on-dark)]">The free trial includes one public 7-post audit and its complete report. Lifetime and Monthly unlock different Competitor Board limits; additional full audits use separate credits.</p></section>

      <section className="mx-auto grid max-w-7xl gap-4 pb-16 lg:grid-cols-3 lg:items-stretch">
        {plans.map((plan) => <article className={`relative flex flex-col rounded-2xl border p-6 ${plan.featured ? "border-[var(--social-blue)] bg-[#241b32] text-white" : "border-[var(--social-line-dark)] bg-[var(--social-surface)]"}`} key={plan.name}>
          {plan.featured ? <span className="absolute right-5 top-5 rounded-full bg-[var(--social-blue)] px-3 py-1 text-xs font-black text-[var(--social-ink)]">Best value</span> : null}
          <h2 className="text-2xl font-black tracking-[-0.04em]">{plan.name}</h2><p className="mt-3 min-h-12 text-sm leading-6 text-[var(--social-muted-on-dark)]">{plan.detail}</p><div className="mt-8 flex items-end gap-3"><p className="text-5xl font-black tracking-[-0.04em]">{plan.price}</p>{plan.referencePrice ? <p className="pb-1 text-base font-bold text-white/50 line-through">{plan.referencePrice}</p> : null}</div><p className="mt-2 text-sm font-bold text-[var(--social-blue)]">{plan.billing}</p>
          <ul className="mt-8 grid gap-3 text-sm leading-5 text-[var(--social-muted-on-dark)]">{plan.items.map((item) => <li className="flex gap-2" key={item}><span className="text-[var(--social-blue)]">+</span>{item}</li>)}</ul>
          <Link className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-black transition hover:-translate-y-0.5 ${plan.featured ? "bg-[var(--social-blue)] text-[var(--social-ink)] hover:bg-[#cdbbff]" : "bg-white text-[var(--social-ink)] hover:bg-[var(--social-blue)]"}`} href="/audits/new">{plan.action}</Link>
        </article>)}
      </section>

      <section className="mx-auto max-w-4xl rounded-2xl border border-[var(--social-line-dark)] bg-[var(--social-surface)] p-6 text-center sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--social-blue)]">Additional full-audit credits</p><h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">$1 for one credit, or $9 for ten credits</h2><p className="mt-3 leading-7 text-[var(--social-muted-on-dark)]">Credits are one-time purchases. Lifetime and Monthly are separate Competitor Board products.</p></section>

      <section className="mx-auto max-w-4xl rounded-2xl border border-[var(--social-line-dark)] bg-[#1d1728] p-6 text-center sm:p-8"><h2 className="text-2xl font-black tracking-[-0.04em]">Checkout is not live yet</h2><p className="mt-3 leading-7 text-[var(--social-muted-on-dark)]">SocialOreo is validating Square sandbox checkout and verified entitlement webhooks before accepting live payments. When checkout is enabled, the exact price and renewal terms will appear before purchase; a full audit will consume a credit only after you choose to run it.</p><p className="mt-4 text-sm font-semibold text-white/65">Public-data audits do not include private Instagram Insights such as reach, watch time, retention, or audience demographics.</p></section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 py-10 text-sm font-semibold text-[var(--social-muted-on-dark)] sm:flex-row sm:justify-between"><span>SocialOreo</span><span className="flex gap-4"><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/contact">Contact</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/privacy">Privacy</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/terms">Terms</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/credit-policy">Credits and refunds</Link></span></footer>
    </main>
  );
}
