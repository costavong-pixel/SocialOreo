import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { getSessionUser } from "@/lib/auth/current-user";

const proofPoints = [
  "Public signals, clearly labelled",
  "Advice matched to your goal",
  "A post plan you can actually use",
];

const workflow = [
  {
    title: "Bring the public evidence",
    copy: "Paste an Instagram profile or reel, or a TikTok profile. SocialOreo reviews the returned public video sample only.",
  },
  {
    title: "Give the post a job",
    copy: "Tell us what the next post needs to do: attract attention, build trust, get leads, or make a sale.",
  },
  {
    title: "Leave with a real plan",
    copy: "See the clearest patterns, what to fix next, and the hook, script, CTA, and caption to make.",
  },
];

const deliverables = [
  ["See the proof", "Visible views, interaction patterns, publishing rhythm, and direct reel links stay beside the recommendation."],
  ["Know what to change", "Your score breakdown makes the strongest and weakest parts of the content easy to spot."],
  ["Make the next post", "Turn a finding into a hook, a simple structure, a CTA, and a caption without starting from zero."],
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="overflow-hidden bg-[var(--social-night)] text-[#f4f7fb]">
      <section className="relative isolate overflow-hidden bg-[#0b0b0e] px-5 pb-16 pt-5 text-white sm:px-8 lg:px-12 lg:pb-24">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-24 -z-10 size-[34rem] rounded-full border-[5rem] border-orange-300/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[42%] -z-10 size-80 rounded-full bg-[var(--social-lime)]/90" />
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 py-3">
          <BrandMark inverse />
          <div className="hidden items-center gap-7 text-sm font-bold text-white/75 md:flex">
            <a className="transition hover:text-white" href="#how-it-works">How it works</a>
            <a className="transition hover:text-white" href="#what-you-get">What you get</a>
            <Link className="transition hover:text-white" href="/pricing">Pricing</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link className="rounded-full px-3 py-2.5 text-sm font-extrabold text-white/85 transition hover:text-white sm:px-4" href="/auth/login">
              Sign in
            </Link>
            <Link className="rounded-full bg-[var(--social-lime)] px-3 py-2.5 text-sm font-extrabold text-[var(--social-ink)] transition hover:-translate-y-0.5 hover:bg-white sm:px-4" href="/audits/new">
              Start a free audit
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl gap-12 pb-2 pt-16 lg:grid-cols-[1.04fr_.96fr] lg:items-center lg:pt-24">
          <div>
            <p className="inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-extrabold tracking-[0.08em] text-white/85">
              Short-form strategy, without the jargon
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[0.91] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Make your next video easier to choose.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/85 sm:text-xl">
              SocialOreo turns public short-form signals into clear recommendations and a ready-to-make post plan — built around the result you want.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="rounded-full bg-[var(--social-lime)] px-6 py-3.5 text-center text-sm font-extrabold text-[var(--social-ink)] transition hover:-translate-y-0.5 hover:bg-white" href="/audits/new">
                Analyze a public profile
              </Link>
              <a className="rounded-full border border-white/35 bg-white/10 px-6 py-3.5 text-center text-sm font-extrabold transition hover:bg-white/15" href="#how-it-works">
                See how it works
              </a>
            </div>
            <ul className="mt-9 grid gap-3 text-sm font-bold text-white/82 sm:grid-cols-3">
              {proofPoints.map((point) => <li className="flex gap-2" key={point}><span className="mt-0.5 text-[var(--social-lime)]">●</span><span>{point}</span></li>)}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-xl rounded-2xl bg-[#08080a] p-3 shadow-[0_8px_0_oklch(0.05_0.005_70_/_0.6)] sm:p-4">
            <div className="rounded-xl bg-[var(--social-surface)] p-5 text-[#f4f7fb] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-extrabold tracking-[0.1em] text-[var(--social-lime)]">YOUR NEXT MOVE</p><h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.035em]">From public signal to a clear action.</h2></div>
                <span className="rounded-full bg-[var(--social-lime)] px-3 py-1 text-xs font-extrabold text-[var(--social-ink)]">Public data</span>
              </div>
              <div className="mt-7 grid gap-2 sm:grid-cols-3">
                <SignalCard label="Evidence" value="What people see" note="Views, interactions, timing" />
                <SignalCard label="Diagnosis" value="What holds it back" note="Hooks, structure, clarity" />
                <SignalCard label="Execution" value="What to make" note="Script, CTA, caption" />
              </div>
              <div className="mt-5 rounded-xl bg-[var(--social-surface-raised)] p-4">
                <p className="text-xs font-extrabold tracking-[0.1em] text-[var(--social-lime)]">YOUR NEXT BEST MOVE</p>
                <p className="mt-2 text-sm font-bold leading-6">Open with the transformation in the first sentence, then show the proof before the payoff.</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full w-[72%] rounded-full bg-[var(--social-lime)]" /></div>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--social-muted-on-dark)]">Example of the decision support SocialOreo creates. Private platform Insights are never estimated or relabelled as public data.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#08080a] px-5 py-5 text-white sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-bold sm:flex-row sm:items-center sm:justify-between">
          <p className="text-white/70">For creators who want a stronger next post, not another empty dashboard.</p>
          <p className="text-[var(--social-lime)]">Instagram public profiles/reels + TikTok public profiles</p>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-12 lg:py-28" id="how-it-works">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl"><p className="text-sm font-extrabold text-[var(--social-lime)]">A useful audit in three moves</p><h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">Less dashboard theater. More clarity about the next video.</h2></div>
          <div className="mt-12 grid gap-x-10 gap-y-8 border-t border-[var(--social-line-dark)] pt-8 lg:grid-cols-3">
            {workflow.map((step, index) => <article className="group" key={step.title}><p className="font-display text-5xl font-extrabold text-[var(--social-blue)]">0{index + 1}</p><h3 className="mt-8 text-xl font-extrabold tracking-[-0.025em]">{step.title}</h3><p className="mt-3 max-w-sm leading-7 text-[var(--social-muted-on-dark)]">{step.copy}</p></article>)}
          </div>
        </div>
      </section>

      <section className="bg-[var(--social-surface)] px-5 py-20 sm:px-8 lg:px-12 lg:py-28" id="what-you-get">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div><p className="text-sm font-extrabold text-[var(--social-lime)]">What you actually leave with</p><h2 className="mt-3 font-display text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">A report that becomes your production plan.</h2><p className="mt-6 max-w-md leading-7 text-[var(--social-muted-on-dark)]">SocialOreo keeps the evidence visible, then connects each recommendation to a hook, script, CTA, and caption you can use right away.</p><Link className="mt-8 inline-flex rounded-full bg-[var(--social-lime)] px-5 py-3 text-sm font-extrabold text-[var(--social-ink)] transition hover:-translate-y-0.5 hover:bg-white" href="/audits/new">Start with a free audit</Link></div>
          <div className="divide-y divide-[var(--social-line-dark)] border-y border-[var(--social-line-dark)]">
            {deliverables.map(([title, copy], index) => <div className="grid gap-4 py-6 sm:grid-cols-[3.5rem_1fr]" key={title}><span className="font-display text-3xl font-extrabold text-[var(--social-blue)]">0{index + 1}</span><div><p className="text-lg font-extrabold tracking-[-0.025em]">{title}</p><p className="mt-2 max-w-lg leading-7 text-[var(--social-muted-on-dark)]">{copy}</p></div></div>)}
          </div>
        </div>
      </section>

      <section className="bg-[#08080a] px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-[var(--social-surface-raised)] px-6 py-12 text-white sm:px-10 lg:flex lg:items-end lg:justify-between lg:gap-10 lg:px-14 lg:py-16">
          <div><p className="text-sm font-extrabold text-[var(--social-lime)]">Ready when you are</p><h2 className="mt-3 max-w-2xl font-display text-4xl font-extrabold leading-[.95] tracking-[-0.04em] sm:text-5xl">Turn the next public video sample into your next post plan.</h2></div>
          <Link className="mt-8 inline-flex rounded-full bg-[var(--social-lime)] px-6 py-3.5 text-sm font-extrabold text-[var(--social-ink)] transition hover:-translate-y-0.5 hover:bg-white lg:mt-0" href="/audits/new">Start a free audit</Link>
        </div>
      </section>

      <footer className="border-t border-[var(--social-line-dark)] px-5 py-8 text-sm font-semibold text-[var(--social-muted-on-dark)] sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><BrandMark inverse /><span>Public evidence. Clear recommendations. Ready-to-make plans.</span><span className="flex flex-wrap gap-4"><Link className="text-white underline-offset-4 hover:text-[var(--social-lime)] hover:underline" href="/contact">Contact</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-lime)] hover:underline" href="/privacy">Privacy</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-lime)] hover:underline" href="/terms">Terms</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-lime)] hover:underline" href="/credit-policy">Credits and refunds</Link></span></div></footer>
    </main>
  );
}

function SignalCard({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-lg bg-[var(--social-surface-raised)] p-3"><p className="text-[10px] font-extrabold tracking-[0.1em] text-[var(--social-muted-on-dark)]">{label}</p><p className="mt-5 text-sm font-extrabold tracking-[-0.02em]">{value}</p><p className="mt-1 text-xs leading-5 text-[var(--social-muted-on-dark)]">{note}</p></div>;
}
