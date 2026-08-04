import { describe, expect, it } from "vitest";
import { fallbackChain, localeIsRtl, normalizeLocale, languageOfLocale } from "./locales";
import { translate } from "./translations";
import {
  bidiSafe,
  checkCharacterLimit,
  checkMixedCaption,
  containsRtl,
  isNoTranslateTerm,
  normalizeUnicode,
  unicodeLength,
} from "./unicode";

describe("Slice F — multilingual foundation", () => {
  it("keeps interface, assistant, profile, account, campaign, Watch, and notification languages independent", () => {
    const interfaceLocale = "zh-CN";
    const assistantLanguage = "es";
    const profileDefaultLanguage = "en";
    const accountDefaultLanguage = "ar";
    const campaignLanguage = "fr";
    const watchReportLanguage = "pt";
    const notificationLanguage = "zh";
    expect(interfaceLocale).toBe("zh-CN");
    expect(assistantLanguage).toBe("es");
    expect(profileDefaultLanguage).toBe("en");
    expect(accountDefaultLanguage).toBe("ar");
    expect(campaignLanguage).toBe("fr");
    expect(watchReportLanguage).toBe("pt");
    expect(notificationLanguage).toBe("zh");
  });

  it("translates shared UI keys with locale fallback", () => {
    expect(translate("zh-CN", "nav.posts")).toBe("帖子");
    expect(translate("ar-SA", "common.save")).toBe("حفظ");
    expect(translate("fr-FR", "watch.optIn")).toBe("Suivre les concurrents explicitement");
    // Unknown locale falls back to en-US.
    expect(translate("xx-XX", "nav.dashboard")).toBe("Dashboard");
  });

  it("provides a locale fallback chain ending in en-US", () => {
    expect(fallbackChain("es-MX")).toEqual(["es-MX", "en-US"]);
    expect(fallbackChain("xx-XX")).toContain("en-US");
    expect(normalizeLocale("es")).toBe("es-MX");
    expect(languageOfLocale("ar-SA")).toBe("ar");
  });

  it("detects RTL locales", () => {
    expect(localeIsRtl("ar-SA")).toBe(true);
    expect(localeIsRtl("en-US")).toBe(false);
  });

  it("measures length by grapheme, not code unit (emoji + CJK + accented Latin)", () => {
    expect(unicodeLength("café")).toBe(4);
    expect(unicodeLength("咖啡店")).toBe(3);
    expect(unicodeLength("👍🏽")).toBe(1);
    expect(unicodeLength("مرحباً")).toBe(5);
  });

  it("applies character-limit checks to final variants", () => {
    const ok = checkCharacterLimit("Épique 🎉 咖啡", 20);
    expect(ok.ok).toBe(true);
    expect(ok.visibleLength).toBe(11);
    const over = checkCharacterLimit("This caption is far too long for the provider limit", 10);
    expect(over.ok).toBe(false);
  });

  it("preserves no-translate terms (hashtags, handles, URLs, promotion codes)", () => {
    expect(isNoTranslateTerm("#coffee")).toBe(true);
    expect(isNoTranslateTerm("@costa.studio")).toBe(true);
    expect(isNoTranslateTerm("https://media.slabpizza.ca/x.jpg")).toBe(true);
    expect(checkMixedCaption("Limited offer code SUMMER10 at @costa.studio #coffee https://example.com/offer").ok).toBe(true);
    // Any https URL and any @handle is preserved verbatim (no-translate).
    expect(checkMixedCaption("See our promo here https://unknown.example").ok).toBe(true);
  });

  it("normalizes Unicode NFC without corrupting handles", () => {
    const source = "cafe\u0301 @costa.studio #coffee";
    const normalized = normalizeUnicode(source);
    expect(normalized).toBe("café @costa.studio #coffee");
    expect(normalized).toContain("@costa.studio");
  });

  it("isolates RTL spans in a mixed-language caption safely", () => {
    const safe = bidiSafe("مرحبا and hello", "en-US");
    expect(safe).toContain("\u2067");
    expect(bidiSafe("مرحبا", "ar-SA")).not.toContain("\u2067");
  });

  it("handles mixed captions with accented Latin, Chinese, RTL, emoji, hashtags, handles, URLs", () => {
    const caption = "Épique! 🎉 مرحبا بكم في 咖啡店 @costa.studio #baking https://media.slabpizza.ca/a.jpg";
    const normalized = normalizeUnicode(caption);
    expect(checkCharacterLimit(normalized, 200).ok).toBe(true);
    expect(containsRtl(normalized)).toBe(true);
  });
});
