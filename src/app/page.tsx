import Link from "next/link";
import { getSessionUser } from "@/lib/auth/current-user";
import { planConfig, formatPriceCents } from "@/lib/socialolla/plans/plan-config";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const metadata = {
  title: "SocialOlla — Plan, Post and Watch your social content",
  description: "SocialOlla helps you plan, post and watch your social content. Start with a free demo.",
};

export default async function HomePage() {
  const sessionUser = await getSessionUser();
  const lifetime = planConfig().lifetime;
  const price = formatPriceCents(lifetime.priceCents, lifetime.currency);
  return (
    <main className="min-h-[100dvh] bg-[var(--social-page)] px-5 py-5 text-[var(--social-text)] sm:px-8 lg:px-12">
      <nav className="so-public-nav mx-auto max-w-7xl">
        <Link className="font-display text-xl font-extrabold tracking-[-0.04em]" href="/">SocialOlla</Link>
        <div className="flex items-center gap-4">
          <Link className="text-sm font-bold text-white/65 hover:text-white" href="/pricing">Pricing</Link>
          {sessionUser ? (
            <>
              <Link className="text-sm font-bold text-white/65 hover:text-white" href="/home">Dashboard</Link>
              <Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/auth/logout">Sign out</Link>
            </>
          ) : (
            <Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/sign-in">Sign in</Link>
          )}
        </div>
      </nav>
      <section className="mx-auto max-w-7xl py-16 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl">Plan, post and watch your social content.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-white/70">
          Create destination-specific posts, plan a week of content, and get a Basic Profile Analysis — all in one place, starting at {price} lifetime.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link className="rounded-full bg-[var(--social-blue)] px-6 py-3 text-base font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/demo">Try the free demo</Link>
          <Link className="rounded-full border border-white/20 px-6 py-3 text-base font-bold text-white/80 hover:bg-white/10" href="/pricing">See pricing</Link>
        </div>
      </section>
      <AssistantPanel floating authenticated={sessionUser?.emailVerified === true} />
    </main>
  );
}
