import { describe, expect, it } from "vitest";
import { toDestinationView } from "./destination-view";

describe("destination client DTO", () => {
  it("projects only selector-safe fields and drops provider credentials", () => {
    const view = toDestinationView({
      externalId: "dst_1",
      label: "@slabburgers",
      platform: "instagram",
      status: "CONNECTED",
      providerDisabled: false,
      ...({
        accessTokenCiphertext: "ciphertext-must-not-cross-boundary",
        platformUserId: "provider-user-id",
        scopes: ["instagram_business_content_publish"],
        accessTokenExpiresAt: new Date(),
      } as Record<string, unknown>),
    });

    expect(view).toEqual({
      externalId: "dst_1",
      label: "@slabburgers",
      platform: "instagram",
      status: "CONNECTED",
      providerDisabled: false,
    });
    expect(view).not.toHaveProperty("accessTokenCiphertext");
    expect(view).not.toHaveProperty("platformUserId");
    expect(view).not.toHaveProperty("scopes");
    expect(view).not.toHaveProperty("accessTokenExpiresAt");
  });
});
