import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/current-user";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { loadProfileContext } from "@/lib/socialolla/profile/profile-context";
import { normalizeLocale, localeIsRtl } from "@/lib/socialolla/i18n/locales";
import { ProfileContextView } from "@/components/profile/profile-context-view";
import { SocialOllaShell } from "@/components/layout/socialolla-shell";

export const metadata = { title: "Profile — SocialOlla" };

export default async function ProfilePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.email) redirect("/auth/login?returnTo=%2Fprofile");

  let dbUserId: string | undefined;
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  dbUserId = resolution?.dbId;
  if (dbUserId) await getOrCreatePersonalWorkspace(dbUserId);

  const context = await loadProfileContext(sessionUser, dbUserId);
  const isAdmin = sessionUser.emailVerified && context.role === UserRole.ADMIN;
  const acceptedForApp = Boolean(resolution);
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("so_locale")?.value);
  const dir = localeIsRtl(locale) ? "rtl" : "ltr";

  return (
    <SocialOllaShell
      dir={dir}
      locale={locale}
      sessionUser={{ ...sessionUser, email: sessionUser.email }}
      isAdmin={isAdmin}
      accountRole={context.role === UserRole.ADMIN ? "ADMIN" : "USER"}
      showPrimaryNav={acceptedForApp}
      assistantAuthenticated={acceptedForApp}
    >
      <ProfileContextView context={context} />
    </SocialOllaShell>
  );
}
