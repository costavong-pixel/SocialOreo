/**
 * Slice A — SocialOlla product shell.
 * Mobile-first navigation, design tokens, plain-language state labels, and a
 * language selector contract. Admin routes are exposed separately by the
 * authorized app shell; this list contains customer-facing product routes.
 */
import type { TranslationKey } from "@/lib/socialolla/i18n/translations";

export const SHELL_NAV: ReadonlyArray<{ href: string; labelKey: TranslationKey }> = [
  { href: "/home", labelKey: "nav.dashboard" },
  { href: "/posts", labelKey: "nav.posts" },
  { href: "/watch", labelKey: "nav.watch" },
  { href: "/calendar", labelKey: "nav.calendar" },
  { href: "/connections", labelKey: "nav.connections" },
  { href: "/credits", labelKey: "nav.credits" },
  { href: "/analysis", labelKey: "nav.analysis" },
  { href: "/assistant", labelKey: "nav.assistant" },
  { href: "/settings", labelKey: "nav.settings" },
  { href: "/profile", labelKey: "nav.profile" },
];

export type ShellStateKind = "loading" | "empty" | "error" | "offline" | "partial-success";

export const SHELL_STATE_LABELS: Record<ShellStateKind, string> = {
  loading: "Loading…",
  empty: "Nothing here yet",
  error: "Something went wrong — please try again",
  offline: "You are offline — changes may not be saved",
  "partial-success": "Partially complete — some items need attention",
};

export function shellStateLabel(kind: ShellStateKind): string {
  return SHELL_STATE_LABELS[kind];
}

export const SHELL_LOCALES = ["en-US", "es-MX", "zh-CN", "ar-SA", "fr-FR", "pt-BR"] as const;

export interface ShellLanguageSelection {
  locale: string;
  interfaceLanguage: string;
  assistantLanguage?: string;
  profileDefaultLanguage?: string;
  accountDefaultLanguage?: string;
  notificationLanguage?: string;
}

/** Language selector contract: keeps interface vs content languages independent. */
export function shellLanguageSelection(selection: Partial<ShellLanguageSelection>): ShellLanguageSelection {
  return {
    locale: selection.locale ?? "en-US",
    interfaceLanguage: selection.interfaceLanguage ?? "en",
    assistantLanguage: selection.assistantLanguage,
    profileDefaultLanguage: selection.profileDefaultLanguage,
    accountDefaultLanguage: selection.accountDefaultLanguage,
    notificationLanguage: selection.notificationLanguage,
  };
}
