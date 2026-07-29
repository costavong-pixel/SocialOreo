import { z } from "zod";

export type SupportedPlatform = "instagram" | "tiktok";

export type SocialUrlValidationResult =
  | {
      ok: true;
      platform: SupportedPlatform;
      normalizedUrl: string;
      kind: "profile" | "reel";
    }
  | {
      ok: false;
      error: string;
    };

const urlSchema = z.string().trim().min(1).max(500);

const blockedProtocols = new Set(["javascript:", "data:", "file:"]);
const instagramHosts = new Set(["instagram.com", "www.instagram.com"]);
const tiktokHosts = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((value) => Number(value));

  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b] = octets;

  if (a === 10) {
    return true;
  }

  if (a === 127) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  return false;
}

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (blockedHosts.has(normalized)) {
    return true;
  }

  if (normalized.endsWith(".local")) {
    return true;
  }

  return isPrivateIpv4(normalized);
}

export function validateSocialUrl(input: string): SocialUrlValidationResult {
  const parsedInput = urlSchema.safeParse(input);

  if (!parsedInput.success) {
    return { ok: false, error: "Enter a valid URL." };
  }

  let url: URL;

  try {
    url = new URL(parsedInput.data);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }

  if (blockedProtocols.has(url.protocol)) {
    return { ok: false, error: "Unsupported URL protocol." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Unsupported URL protocol." };
  }

  const host = url.hostname.toLowerCase();

  if (isBlockedHost(host)) {
    return { ok: false, error: "Internal or local URLs are not allowed." };
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (tiktokHosts.has(host)) {
    if (parts.length !== 1 || !parts[0].startsWith("@")) {
      return { ok: false, error: "Enter a TikTok profile URL such as tiktok.com/@creator." };
    }
    const username = parts[0].slice(1).trim();
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(username)) {
      return { ok: false, error: "Enter a valid TikTok profile URL." };
    }
    return { ok: true, platform: "tiktok", normalizedUrl: `https://www.tiktok.com/@${username}`, kind: "profile" };
  }

  if (!instagramHosts.has(host)) {
    return { ok: false, error: "SocialOreo currently supports Instagram and TikTok profile URLs." };
  }

  if (parts.length === 0) {
    return { ok: false, error: "Enter an Instagram profile or reel URL." };
  }

  const isReel = parts[0] === "reel" || parts[0] === "p";
  const kind = isReel ? "reel" : "profile";

  url.hash = "";
  url.search = "";

  return {
    ok: true,
    platform: "instagram",
    normalizedUrl: url.toString(),
    kind,
  };
}
