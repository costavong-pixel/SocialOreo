export function disconnectedInstagramDestinationData() {
  return {
    status: "DISCONNECTED" as const,
    // A disconnected destination must never remain eligible for a live
    // provider call, even if an old job references it.
    providerDisabled: true,
    accessTokenCiphertext: null,
    accessTokenExpiresAt: null,
    publishingEligibilityVerifiedAt: null,
    scopes: [] as string[],
  };
}
