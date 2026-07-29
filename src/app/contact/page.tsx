import Link from "next/link";

import { ContactForm } from "./contact-form";

export default function ContactPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--social-page)] px-5 py-5 text-[var(--social-text)] sm:px-8 lg:px-12">
      <nav className="so-public-nav mx-auto max-w-3xl"><Link className="font-display text-xl font-extrabold tracking-[-0.04em]" href="/">SocialOreo</Link><Link className="so-public-back" href="/">← Home</Link><Link className="rounded-full bg-[var(--social-blue)] px-4 py-2.5 text-sm font-extrabold text-[var(--social-ink)] transition hover:bg-[#cdbbff]" href="/pricing">View pricing</Link></nav>
      <article className="mx-auto max-w-3xl py-16 lg:py-24"><p className="text-sm font-extrabold text-[var(--social-blue)]">Contact</p><h1 className="mt-3 font-display text-5xl font-extrabold tracking-[-0.04em] sm:text-6xl">Tell us what you need.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--social-muted-on-dark)]">Send a question, share feedback, or tell us what would make SocialOreo more useful for your next post.</p><ContactForm /></article>
      <footer className="mx-auto flex max-w-3xl flex-wrap justify-between gap-4 border-t border-[var(--social-line-dark)] py-8 text-sm font-semibold text-[var(--social-muted-on-dark)]"><Link href="/">SocialOreo</Link><span className="flex gap-4"><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/privacy">Privacy</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/terms">Terms</Link><Link className="text-white underline-offset-4 hover:text-[var(--social-blue)] hover:underline" href="/credit-policy">Credits and refunds</Link></span></footer>
    </main>
  );
}
