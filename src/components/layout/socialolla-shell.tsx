import type { SessionUser } from "@/lib/auth/current-user";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AppShellNav } from "@/components/nav/app-shell-nav";

export function SocialOllaShell({
  children,
  dir,
  locale,
  sessionUser,
  isAdmin,
  accountRole,
  showPrimaryNav = true,
  assistantAuthenticated = true,
}: {
  children: React.ReactNode;
  dir: "ltr" | "rtl";
  locale: string;
  sessionUser: SessionUser & { email: string };
  isAdmin: boolean;
  accountRole?: "USER" | "ADMIN";
  showPrimaryNav?: boolean;
  assistantAuthenticated?: boolean;
}) {
  return (
    <div dir={dir} className="min-h-[100dvh] bg-[var(--social-page)] text-[var(--social-text)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[var(--social-blue)] focus:px-4 focus:py-2 focus:font-extrabold focus:text-[var(--social-ink)]">
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[var(--social-page)]/95 px-4 py-3 backdrop-blur">
        <AppShellNav
          locale={locale}
          isAdmin={isAdmin}
          showPrimaryNav={showPrimaryNav}
          account={{
            displayName: sessionUser.displayName ?? null,
            email: sessionUser.email,
            role: accountRole ?? (isAdmin ? "ADMIN" : "USER"),
            emailVerified: sessionUser.emailVerified,
          }}
        />
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <AssistantPanel floating authenticated={assistantAuthenticated} />
    </div>
  );
}
