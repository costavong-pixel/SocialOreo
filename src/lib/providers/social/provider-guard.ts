/**
 * Provider-disabled runtime guard (M2 chokepoint).
 *
 * Milestone 2 must make zero live provider calls. The single guard sits at the
 * `fetchSocialAudit` chokepoint so every caller (Watch, audits, future worker)
 * is covered: when SOCIALOLLA_PROVIDER_DISABLED is true the live provider is
 * never constructed and a deterministic fixture is returned instead.
 */
import { createHash } from "node:crypto";
import type { FetchSocialAuditInput, NormalizedSocialAuditResult, SocialPlatform } from "./types";

export function providerDisabledEnabled(): boolean {
  return process.env.SOCIALOLLA_PROVIDER_DISABLED === "true";
}

export function assertProviderDisabledMode(): void {
  if (!providerDisabledEnabled()) {
    throw new Error("Live provider calls are disabled in Milestone 2 (set SOCIALOLLA_PROVIDER_DISABLED=true).");
  }
}

/** Deterministic provider-disabled analysis result derived from the profile URL. */
export function providerDisabledFixture(platform: SocialPlatform, input: FetchSocialAuditInput): NormalizedSocialAuditResult {
  const seed = createHash("sha256").update(input.url).digest("hex");
  const follower = 1000 + (parseInt(seed.slice(0, 4), 16) % 9000);
  const posts = 50 + (parseInt(seed.slice(4, 8), 16) % 200);
  return {
    profile: {
      platform,
      provider: "provider-disabled" as NormalizedSocialAuditResult["profile"]["provider"],
      profileUrl: input.url,
      displayName: `Staged profile ${seed.slice(0, 6)}`,
      bio: "Provider-disabled staging profile",
      followerCount: follower,
      postCount: posts,
    },
    videos: [],
  };
}
