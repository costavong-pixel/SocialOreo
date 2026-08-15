import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { normalizeLocale } from "@/lib/socialolla/i18n/locales";
import { LanguageSelect } from "@/components/nav/language-select";

export const metadata = { title: "Settings — SocialOlla" };

export default async function M2SettingsPage() {
  const sessionUser = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(sessionUser)) redirect("/account-conflict");
  if (!sessionUser) redirect("/auth/login");

  const workspace = await getOrCreatePersonalWorkspace(sessionUser.dbId);
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("so_locale")?.value);

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Settings</h1>
      <p className="mt-2 text-white/70">Account and workspace preferences.</p>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Workspace</h2>
        <dl className="mt-3 space-y-2 text-sm text-white/80">
          <div><dt className="inline font-bold">Workspace:</dt> <dd className="inline"><code>{workspace.id}</code></dd></div>
          <div><dt className="inline font-bold">Label:</dt> <dd className="inline">{workspace.label}</dd></div>
          <div><dt className="inline font-bold">Locale:</dt> <dd className="inline">{workspace.defaultLocale}</dd></div>
        </dl>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Interface language</h2>
        <p className="mt-1 text-sm text-white/60">Current interface locale: <code>{locale}</code>. The choice is stored in a cookie and applies to the whole app, including RTL layout for Arabic.</p>
        <div className="mt-3">
          <LanguageSelect currentLocale={locale} />
        </div>
        <p className="mt-3 text-xs text-white/50">Interface and content languages are independent. RTL layout activates for Arabic (ar-SA).</p>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Account</h2>
        <p className="mt-2 text-sm text-white/70">Signed in as <strong>{sessionUser.email}</strong></p>
        <Link className="mt-3 inline-block rounded-full bg-[var(--social-blue)] px-4 py-1.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/auth/logout">
          Sign out
        </Link>
      </div>
    </section>
  );
}
