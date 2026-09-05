import { describe, expect, it } from "vitest";
import { disconnectedInstagramDestinationData } from "./disconnect";

describe("Instagram destination disconnect state", () => {
  it("clears live publishing material and eligibility", () => {
    expect(disconnectedInstagramDestinationData()).toEqual({
      status: "DISCONNECTED",
      providerDisabled: true,
      accessTokenCiphertext: null,
      accessTokenExpiresAt: null,
      publishingEligibilityVerifiedAt: null,
      scopes: [],
    });
  });
});
