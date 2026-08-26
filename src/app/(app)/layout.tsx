import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { connectionProviderFromSubject, logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";
import { normalizeLocale, localeIsRtl } from "@/lib/socialolla/i18n/locales";
import { SocialOllaShell } from "@/components/layout/socialolla-shell";

export default async function M2AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side auth guard: only provider-verified sessions or the explicit,
  // auditable staging acceptance cohort reach the app shell.
  const sessionUser = await getAcceptedSessionUser();
  if (!sessionUser) {
    logAuthSyncDiagnostic("authorization", { redirectResult: "auth-login" });
    redirect("/auth/login?returnTo=%2Fhome");
  }

  const isAdmin = await requireAdminByAuthUserId(sessionUser.id);
  logAuthSyncDiagnostic("authorization", {
    subject: sessionUser.id,
    email: sessionUser.email,
    connectionProvider: connectionProviderFromSubject(sessionUser.id),
    emailVerified: sessionUser.emailVerified,
    redirectResult: "shell-allowed",
  });

  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("so_locale")?.value);
  const dir = localeIsRtl(locale) ? "rtl" : "ltr";

  return <SocialOllaShell dir={dir} locale={locale} sessionUser={sessionUser} isAdmin={isAdmin}>{children}</SocialOllaShell>;
}
