import { DEFAULT_LANGUAGE, DEFAULT_LOCALE } from "@/lib/socialolla/contracts";

export interface SupportedLocale {
  locale: string;
  language: string;
  rtl: boolean;
  fallbackLocales: string[];
}

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

function isRtl(language: string): boolean {
  return RTL_LANGUAGES.has(language.toLowerCase());
}

function languageOf(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

export const SUPPORTED_LOCALES: Record<string, SupportedLocale> = {
  "en-US": {
    locale: "en-US",
    language: "en",
    rtl: false,
    fallbackLocales: [],
  },
  "es-MX": {
    locale: "es-MX",
    language: "es",
    rtl: false,
    fallbackLocales: ["en-US"],
  },
  "zh-CN": {
    locale: "zh-CN",
    language: "zh",
    rtl: false,
    fallbackLocales: ["en-US"],
  },
  "ar-SA": {
    locale: "ar-SA",
    language: "ar",
    rtl: true,
    fallbackLocales: ["en-US"],
  },
  "fr-FR": {
    locale: "fr-FR",
    language: "fr",
    rtl: false,
    fallbackLocales: ["en-US"],
  },
  "pt-BR": {
    locale: "pt-BR",
    language: "pt",
    rtl: false,
    fallbackLocales: ["en-US"],
  },
};

export function normalizeLocale(value: string | null | undefined): string {
  if (!value) return DEFAULT_LOCALE;
  const key = SUPPORTED_LOCALES[value] ? value : null;
  if (key) return key;
  const language = languageOf(value);
  const match = Object.values(SUPPORTED_LOCALES).find((entry) => entry.language === language);
  return match?.locale ?? DEFAULT_LOCALE;
}

export function localeIsRtl(locale: string): boolean {
  return normalizeLocale(locale) === locale ? (SUPPORTED_LOCALES[locale]?.rtl ?? false) : isRtl(languageOf(locale));
}

export function fallbackChain(locale: string): string[] {
  const normalized = normalizeLocale(locale);
  const entry = SUPPORTED_LOCALES[normalized];
  const chain = [normalized, ...(entry?.fallbackLocales ?? [])];
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}

export function languageOfLocale(locale: string): string {
  return languageOf(normalizeLocale(locale)) || DEFAULT_LANGUAGE;
}

export { isRtl };
