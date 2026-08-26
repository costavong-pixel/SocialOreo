import type { NormalizedSocialAuditResult } from "./types";

/**
 * Provider adapters may retain raw payloads for normalization and diagnostics.
 * Raw payloads are not part of the customer-facing or durable SocialOlla
 * result because they can contain provider-specific metadata and unrelated
 * personal data.
 */
export function sanitizeSocialAuditResult(input: NormalizedSocialAuditResult): NormalizedSocialAuditResult {
  const { rawProviderPayload: _profilePayload, ...profile } = input.profile;
  return {
    profile,
    videos: input.videos.map(({ rawProviderPayload: _videoPayload, ...video }) => video),
  };
}
