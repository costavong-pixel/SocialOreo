import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { normalizeLocale, localeIsRtl } from "@/lib/socialolla/i18n/locales";
import { AppShellNav } from "@/components/nav/app-shell-nav";
import { AssistantPanel } from "@/components/assistant/assistant-panel";

export default async function M2AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth guard: unauthenticated and unverified users never reach
  // the app shell (no 500 — redirect to Auth0 login).
  const sessionUser = await getVerifiedSessionUser();
  if (!sessionUser) redirect("/auth/login?returnTo=%2Fhome");

  const isAdmin = await requireAdminByAuthUserId(sessionUser.id);

  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("so_locale")?.value);
  const dir = localeIsRtl(locale) ? "rtl" : "ltr";

  return (
    <div dir={dir} className="min-h-[100dvh] bg-[var(--social-page)] text-[var(--social-text)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--social-blue)] focus:px-4 focus:py-2 focus:font-extrabold focus:text-[var(--social-ink)]">
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[var(--social-page)]/95 px-4 py-3 backdrop-blur">
        <AppShellNav locale={locale} isAdmin={isAdmin} />
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <AssistantPanel floating authenticated />
    </div>
  );
}
