"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SHELL_NAV } from "@/lib/socialolla/shell/shell";
import { translate } from "@/lib/socialolla/i18n/translations";
import { LanguageSelect } from "@/components/nav/language-select";

type AccountMenuProps = {
  displayName: string | null;
  email: string;
  role: "USER" | "ADMIN";
  emailVerified: boolean;
};

export function AppShellNav({
  locale,
  isAdmin,
  account,
  showPrimaryNav = true,
}: {
  locale: string;
  isAdmin: boolean;
  account: AccountMenuProps;
  showPrimaryNav?: boolean;
}) {
  const pathname = usePathname();
  const active = (href: string) => (pathname === href || (href !== "/home" && pathname.startsWith(href))) && !href.startsWith("/admin");
  const accountLabel = account.displayName || account.email;

  return (
    <nav aria-label="Primary" className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
      <Link className="font-display text-lg font-extrabold tracking-[-0.04em]" href="/home">
        SocialOlla
      </Link>
      {showPrimaryNav
        ? SHELL_NAV.map((item) => {
            const isActive = active(item.href);
            return (
              <Link
                key={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-bold ${isActive ? "bg-[var(--social-blue)] text-[var(--social-ink)]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                href={item.href}
              >
                {translate(locale, item.labelKey)}
              </Link>
            );
          })
        : null}
      {showPrimaryNav && isAdmin ? (
        <Link className="rounded-full border border-[var(--social-blue)]/50 px-3 py-1.5 text-sm font-bold text-[var(--social-blue)] hover:bg-white/10" href="/admin/plans">
          Admin
        </Link>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        <LanguageSelect currentLocale={locale} />
        <details className="relative">
          <summary aria-label="Account menu" className="flex max-w-[15rem] cursor-pointer list-none items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm font-bold text-white/90 hover:bg-white/10">
            <span className="max-w-[10rem] truncate">{accountLabel}</span>
            <span aria-hidden="true" className="text-white/50">⌄</span>
          </summary>
          <div className="absolute right-0 z-20 mt-2 min-w-72 rounded-2xl border border-white/15 bg-[#171126] p-3 shadow-2xl">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-white/45">Signed in as</p>
            <p className="mt-1 truncate text-sm font-extrabold">{accountLabel}</p>
            <p data-testid="account-email" className="mt-1 truncate text-xs text-white/65">{account.email}</p>

            <div className="mt-3 grid gap-1 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs">
              <p data-testid="account-role" className="font-bold text-[var(--social-blue)]">
                Role: {account.role === "ADMIN" ? "Admin" : "User"}
              </p>
              <p data-testid="account-email-verified" className={account.emailVerified ? "text-emerald-200" : "text-amber-200"}>
                Email verified: <strong>{account.emailVerified ? "Yes" : "No"}</strong>
              </p>
            </div>

            <div className="mt-3 grid gap-1 border-t border-white/10 pt-2">
              <Link className="rounded-xl px-3 py-2 text-sm font-bold text-white/85 hover:bg-white/10" href="/profile">Profile</Link>
              <Link className="rounded-xl px-3 py-2 text-sm font-bold text-white/85 hover:bg-white/10" href="/settings">Settings</Link>
              {isAdmin ? (
                <Link className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--social-blue)] hover:bg-white/10" href="/admin/plans">Admin</Link>
              ) : null}
              <Link className="rounded-xl px-3 py-2 text-sm font-bold text-white/85 hover:bg-white/10" href="/auth/logout">Sign out</Link>
            </div>
          </div>
        </details>
      </div>
    </nav>
  );
}
