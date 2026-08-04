"use client";

import { useTransition } from "react";
import { m2SetLocale } from "@/app/m2-actions";
import { SHELL_LOCALES } from "@/lib/socialolla/shell/shell";

export function LanguageSelect({ currentLocale }: { currentLocale: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm font-bold text-white/60">
      <span className="sr-only">Interface language</span>
      <select
        aria-label="Interface language"
        className={`rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-bold text-white ${isPending ? "opacity-60" : ""}`}
        defaultValue={currentLocale}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await m2SetLocale(next);
          });
        }}
      >
        {SHELL_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {locale}
          </option>
        ))}
      </select>
    </label>
  );
}
