"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SHELL_NAV } from "@/lib/socialolla/shell/shell";
import { translate } from "@/lib/socialolla/i18n/translations";
import { LanguageSelect } from "@/components/nav/language-select";

export function AppShellNav({ locale, isAdmin }: { locale: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => (pathname === href || (href !== "/home" && pathname.startsWith(href))) && !href.startsWith("/admin");

  return (
    <nav aria-label="Primary" className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
      <Link className="font-display text-lg font-extrabold tracking-[-0.04em]" href="/home">
        SocialOlla
      </Link>
      {SHELL_NAV.map((item) => {
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
      })}
      {isAdmin ? (
        <Link className="rounded-full border border-[var(--social-blue)]/50 px-3 py-1.5 text-sm font-bold text-[var(--social-blue)] hover:bg-white/10" href="/admin/plans">
          Admin
        </Link>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        <LanguageSelect currentLocale={locale} />
        <Link className="rounded-full bg-[var(--social-blue)] px-4 py-1.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/auth/logout">
          Sign out
        </Link>
      </div>
    </nav>
  );
}
