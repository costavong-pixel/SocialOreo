import Link from "next/link";

export const metadata = { title: "Account review needed — SocialOlla" };

export default function AccountConflictPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--social-page)] px-5 text-[var(--social-text)]">
      <section className="max-w-xl rounded-3xl border border-white/10 bg-white/[0.02] p-7 text-center">
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Account review needed</h1>
        <p className="mt-3 text-sm text-white/70">
          This verified email is already connected to a different sign-in identity. We did not change any account access, workspace, credits, or purchases.
        </p>
        <p className="mt-3 text-sm text-white/60">Please contact SocialOlla support so the identities can be reviewed safely.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10" href="/">Return home</Link>
          <Link className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/auth/logout">Sign out</Link>
        </div>
      </section>
    </main>
  );
}
