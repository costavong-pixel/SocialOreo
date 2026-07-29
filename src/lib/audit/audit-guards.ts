import type { AuditTier } from "@/lib/credits/audit-tier";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";
import { validateSocialUrl } from "@/lib/validators/social-url";
import type { SupportedPlatform } from "@/lib/validators/social-url";

export type AuditGuardInput = {
  url: string;
  rateLimitKey: string;
  auditTier: AuditTier;
};

export type AuditGuardResult =
  | {
      allowed: true;
      normalizedUrl: string;
      platform: SupportedPlatform;
      kind: "profile" | "reel";
      auditTier: AuditTier;
    }
  | {
      allowed: false;
      stage: "url_validation" | "rate_limit";
      message: string;
      retryAfterSeconds?: number;
    };

export function evaluateAuditGuards(input: AuditGuardInput): AuditGuardResult {
  const urlValidation = validateSocialUrl(input.url);

  if (!urlValidation.ok) {
    return {
      allowed: false,
      stage: "url_validation",
      message: urlValidation.error,
    };
  }

  const rateLimit = checkRateLimit(input.rateLimitKey);

  if (!rateLimit.allowed) {
    return {
      allowed: false,
      stage: "rate_limit",
      message: "Too many audit requests. Please try again shortly.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    normalizedUrl: urlValidation.normalizedUrl,
    platform: urlValidation.platform,
    kind: urlValidation.kind,
    auditTier: input.auditTier,
  };
}
