import Link from "next/link";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { DemoForm } from "@/components/demo/demo-form";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const metadata = { title: "Free demo — SocialOlla" };

export default async function DemoPage() {
  const sessionUser = await getVerifiedSessionUser();
  const signedIn = sessionUser !== null;

  return (
    <main className="min-h-[100dvh] bg-[var(--social-page)] px-5 py-5 text-[var(--social-text)] sm:px-8 lg:px-12">
      <nav className="so-public-nav mx-auto max-w-7xl">
        <Link className="font-display text-xl font-extrabold tracking-[-0.04em]" href="/">SocialOlla</Link>
        <Link className="so-public-back" href="/">← Home</Link>
      </nav>
      <section className="mx-auto max-w-3xl py-12">
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Free title/caption demo</h1>
        <p className="mt-3 text-white/70">
          This is a live-quality demo. The result is labelled, editable and copyable, uses no credits, and nothing is published or saved without your consent.
        </p>
        <DemoForm signedIn={signedIn} />
        <p className="mt-6 text-sm text-white/50">
          Want to keep going? <Link className="text-[var(--social-blue)]" href="/sign-in">Sign in</Link> to create your workspace — nothing is published or transferred without your explicit consent.
        </p>
      </section>
      <AssistantPanel floating authenticated={signedIn} />
    </main>
  );
}
