import { describe, expect, it } from "vitest";
import { validateSocialUrl } from "./social-url";

describe("validateSocialUrl", () => {
  it("accepts an Instagram profile URL", () => {
    const result = validateSocialUrl("https://www.instagram.com/example/");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.platform).toBe("instagram");
      expect(result.kind).toBe("profile");
    }
  });

  it("accepts an Instagram reel URL", () => {
    const result = validateSocialUrl("https://www.instagram.com/reel/ABC123/?utm_source=test");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe("reel");
      expect(result.normalizedUrl).not.toContain("utm_source");
    }
  });

  it("accepts and normalizes a TikTok profile URL", () => {
    const result = validateSocialUrl("https://m.tiktok.com/@Creator/?source=share");
    expect(result).toEqual({ ok: true, platform: "tiktok", normalizedUrl: "https://www.tiktok.com/@Creator", kind: "profile" });
  });

  it("requires a TikTok profile rather than a single video", () => {
    expect(validateSocialUrl("https://www.tiktok.com/@creator/video/123").ok).toBe(false);
  });

  it("rejects unsupported domains", () => {
    const result = validateSocialUrl("https://example.com/profile");

    expect(result.ok).toBe(false);
  });

  it("rejects dangerous protocols", () => {
    const result = validateSocialUrl("javascript:alert(1)");

    expect(result.ok).toBe(false);
  });

  it("rejects localhost URLs", () => {
    const result = validateSocialUrl("http://localhost/instagram.com/profile");

    expect(result.ok).toBe(false);
  });

  it("rejects private IP URLs", () => {
    const result = validateSocialUrl("http://192.168.1.10/profile");

    expect(result.ok).toBe(false);
  });
});
