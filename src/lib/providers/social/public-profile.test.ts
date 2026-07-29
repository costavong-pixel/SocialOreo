import { describe, expect, it } from "vitest";

import { toPublicSocialProfile } from "./public-profile";

describe("toPublicSocialProfile", () => {
  it("returns only fields safe for the audit API response", () => {
    const source = {
      id: "profile_1",
      auditJobId: "audit_1",
      platform: "instagram",
      provider: "apify",
      username: "example",
      displayName: "Example",
      profileUrl: "https://www.instagram.com/example/",
      bio: "Public bio",
      followerCount: 100,
      followingCount: 20,
      postCount: 30,
      profileImageUrl: "https://example.com/profile.jpg",
      rawProviderPayload: { providerOnlySecret: "do-not-return" },
    };

    const result = toPublicSocialProfile(source);

    expect(result).toEqual({
      platform: "instagram",
      provider: "apify",
      username: "example",
      displayName: "Example",
      profileUrl: "https://www.instagram.com/example/",
      bio: "Public bio",
      followerCount: 100,
      followingCount: 20,
      postCount: 30,
      profileImageUrl: "https://example.com/profile.jpg",
    });
    expect(JSON.stringify(result)).not.toContain("providerOnlySecret");
    expect(result).not.toHaveProperty("rawProviderPayload");
    expect(result).not.toHaveProperty("auditJobId");
  });
});
