import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialPlatform } from "./types";
import { providerDisabledEnabled, providerDisabledFixture } from "./provider-guard";

export async function fetchSocialAudit(
  platform: SocialPlatform,
  input: FetchSocialAuditInput,
): Promise<NormalizedSocialAuditResult> {
  // M2 chokepoint is FAIL-CLOSED: live providers are never constructed unless
  // provider-disabled mode is explicitly enabled. Every caller (Watch, audits,
  // any future worker) is covered.
  if (providerDisabledEnabled()) {
    return providerDisabledFixture(platform, input);
  }
  throw new Error(
    "Live provider calls are disabled in Milestone 2 (set SOCIALOLLA_PROVIDER_DISABLED=true to use the provider-disabled fixture).",
  );
}
