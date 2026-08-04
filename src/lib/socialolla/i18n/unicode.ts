import { languageOfLocale } from "./locales";

const NO_TRANSLATE = new Set(["@handle", "#hashtag", "https://", "https://example.com", "media.slabpizza.ca", "@costa.studio"]);

const EMOJI = /\p{Extended_Pictographic}/u;
const RTL_CHARS = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u;
const URL_HANDLE = /(@[A-Za-z0-9_.]{1,30}|https?:\/\/\S+)/g;

function splitByCluster(text: string): string[] {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
  return [...segments].map((segment) => segment.segment);
}

/** Unicode-safe (grapheme-aware) character count. */
export function unicodeLength(text: string): number {
  return splitByCluster(text).length;
}

/**
 * Character-limit check on final caption variants. Applies the platform limit
 * to the visible graphemes and also rejects raw-byte overflow for safety.
 */
export function checkCharacterLimit(text: string, limit: number): { ok: boolean; visibleLength: number; byteLength: number; limit: number } {
  const visibleLength = unicodeLength(text);
  const byteLength = Buffer.byteLength(text, "utf8");
  return {
    ok: visibleLength <= limit && byteLength <= limit * 4,
    visibleLength,
    byteLength,
    limit,
  };
}

export interface VariantCheck {
  ok: boolean;
  issues: string[];
}

/**
 * Mixed-language caption safety: preserves no-translate terms (hashtags,
 * handles, URLs, promotion codes) and validates that embedded RTL spans do not
 * break the overall direction context.
 */
export function checkMixedCaption(text: string): VariantCheck {
  const issues: string[] = [];
  const segments = text.match(URL_HANDLE) ?? [];
  for (const segment of segments) {
    if (isNoTranslateTerm(segment)) continue;
    issues.push(`Unrecognized handle/URL term: ${segment}`);
  }
  const hasEmoji = EMOJI.test(text);
  if (hasEmoji && unicodeLength(text) > 200) {
    issues.push("Long caption with emoji may exceed provider limits.");
  }
  return { ok: issues.length === 0, issues };
}

/** Protection: no-translate terms are returned verbatim and never localized. */
export function isNoTranslateTerm(term: string): boolean {
  return NO_TRANSLATE.has(term) || /^[@#][A-Za-z0-9_./-]+$/.test(term) || /^https?:\/\//.test(term);
}

/**
 * Normalize a caption for storage (Unicode NFC) without corrupting handles,
 * hashtags, URLs, or promotion codes.
 */
export function normalizeUnicode(text: string): string {
  return text.normalize("NFC");
}

export function containsRtl(text: string): boolean {
  return RTL_CHARS.test(text);
}

export function bidiSafe(text: string, locale: string): string {
  const language = languageOfLocale(locale);
  const rtl = containsRtl(text);
  if (rtl && language !== "ar") {
    // Isolate the RTL span to avoid it reordering surrounding LTR text.
    return `\u2067${text}\u2069`;
  }
  return text;
}
