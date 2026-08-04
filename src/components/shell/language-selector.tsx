"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m2SetLocale } from "@/app/m2-actions";
import { SHELL_LOCALES } from "@/lib/socialolla/shell/shell";

export function LanguageSelector({ current = "en-US" }: { current?: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState(current);
  const [saved, setSaved] = useState(false);

  async function change(next: string) {
    setLocale(next);
    setSaved(false);
    try {
      await m2SetLocale(next);
      setSaved(true);
      router.refresh();
    } catch {
      setSaved(false);
    }
  }

  const isRtl = locale === "ar-SA";

  return (
    <div className="relative">
      <label htmlFor="shell-locale" className="sr-only">Interface language</label>
      <select
        id="shell-locale"
        value={locale}
        onChange={(e) => change(e.target.value)}
        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-bold text-white/80 hover:bg-white/10"
      >
        {SHELL_LOCALES.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
      </select>
      <span aria-hidden="true" className="ml-1 text-xs text-white/50">{isRtl ? "RTL" : "LTR"}</span>
      {saved && <span className="sr-only" role="status">Language saved</span>}
    </div>
  );
}
